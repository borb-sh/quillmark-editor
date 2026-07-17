// The paint + scroll-virtualization loop: one <canvas> per visible-plus-margin
// page, mounted/unmounted as the container scrolls so live memory stays bounded
// (`session.paint` re-rasterizes in full every call — never pool a canvas across
// pages, per the paint contract). Builds the per-page slot elements overlay.ts
// and bridge.ts attach their own DOM/listeners to; owns `pageSize` caching and
// slot-count reconciliation across an `apply` (`ChangeSet.pageCount` can differ
// from the previous compile — pages can be added or removed).
import type { LiveSession, PageSize } from '../core/index.js';

/** One page's DOM slot — the box overlay.ts/bridge.ts position against, plus its cached geometry. */
export interface PageSlot {
	readonly page: number;
	readonly size: PageSize;
	readonly el: HTMLElement;
}

export interface PaintLoop {
	/** Live view of the current per-page slots — same array identity for the loop's life. */
	readonly slots: readonly PageSlot[];
	/** Reconcile slot count to `pageCount`, re-cache geometry, repaint mounted `dirtyPages`. */
	refresh(dirtyPages: readonly number[], pageCount: number): void;
	/** Fold a density multiplier into every future paint; repaints mounted pages now. */
	setDensityZoom(zoom: number): void;
	destroy(): void;
}

// Vertical breathing room between stacked pages — cosmetic only.
const PAGE_GAP_PX = 16;

export function createPaintLoop(
	session: LiveSession,
	container: HTMLElement,
	margin: number
): PaintLoop {
	// The IntersectionObserver root must be a scrollable ancestor of the slots;
	// respect a consumer's own choice if they already set one (computed style, so
	// a stylesheet rule counts as a choice, not just an inline style).
	const computed = getComputedStyle(container);
	if (computed.overflowY === 'visible') container.style.overflowY = 'auto';
	if (computed.position === 'static') container.style.position = 'relative';

	const slots: PageSlot[] = [];
	const pageByEl = new Map<Element, number>();
	const canvases = new Map<number, HTMLCanvasElement>();
	const visible = new Set<number>();
	let zoom = 1;

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				const idx = pageByEl.get(entry.target);
				if (idx === undefined) continue;
				if (entry.isIntersecting) visible.add(idx);
				else visible.delete(idx);
			}
			updateBand();
		},
		{ root: container, threshold: 0 }
	);

	function makeSlot(page: number): PageSlot {
		const size = session.pageSize(page);
		const el = document.createElement('div');
		el.className = 'qm-page';
		Object.assign(el.style, {
			position: 'relative',
			width: '100%',
			aspectRatio: `${size.widthPt} / ${size.heightPt}`,
			background: 'var(--qm-page-bg, #fff)',
			boxShadow: 'var(--qm-page-shadow, 0 1px 4px rgba(0, 0, 0, 0.2))'
		});
		if (page > 0) el.style.marginTop = `${PAGE_GAP_PX}px`;
		container.appendChild(el);
		pageByEl.set(el, page);
		observer.observe(el);
		return { page, size, el };
	}

	// Rasterize `slot` into its canvas (creating the canvas if this is its first
	// paint since mounting). `layoutScale` is derived from the slot's OWN current
	// CSS width, so layout width tracks the container per the zoom settled
	// decision; `canvas.style.*` is then set from the authoritative PaintResult,
	// never guessed.
	function paintSlot(slot: PageSlot): void {
		let canvas = canvases.get(slot.page);
		if (!canvas) {
			canvas = document.createElement('canvas');
			canvas.className = 'qm-page-canvas';
			Object.assign(canvas.style, { position: 'absolute', inset: '0', display: 'block' });
		}
		// Contextless canvas: bail BEFORE registering, so `updateBand` still sees
		// the page as unmounted and retries instead of keeping a blank page.
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		if (!canvases.has(slot.page)) {
			slot.el.insertBefore(canvas, slot.el.firstChild);
			canvases.set(slot.page, canvas);
		}
		const layoutScale = (slot.el.clientWidth || slot.size.widthPt) / slot.size.widthPt;
		const densityScale = (window.devicePixelRatio || 1) * zoom;
		const result = session.paint(ctx, slot.page, { layoutScale, densityScale });
		canvas.style.width = `${result.layoutWidth}px`;
		canvas.style.height = `${result.layoutHeight}px`;
	}

	function unmountPage(page: number): void {
		const canvas = canvases.get(page);
		if (!canvas) return;
		canvas.remove();
		canvases.delete(page);
	}

	// Mount pages newly inside [min(visible)-margin, max(visible)+margin], unmount
	// pages that fell outside it. Only touches pages CHANGING band membership —
	// an already-mounted page in the band is left alone (paint contract: an idle
	// canvas keeps its pixels for free; repainting it here would be pure waste).
	function updateBand(): Set<number> {
		const painted = new Set<number>();
		if (visible.size === 0 || slots.length === 0) return painted;
		const min = Math.min(...visible);
		const max = Math.max(...visible);
		const lo = Math.max(0, min - margin);
		const hi = Math.min(slots.length - 1, max + margin);
		for (const slot of slots) {
			const inBand = slot.page >= lo && slot.page <= hi;
			if (inBand && !canvases.has(slot.page)) {
				paintSlot(slot);
				painted.add(slot.page);
			} else if (!inBand && canvases.has(slot.page)) unmountPage(slot.page);
		}
		return painted;
	}

	// Grow/shrink the slot array to `pageCount` (trailing add/remove — a recompile
	// reports the new count, and dirtyPages already covers any reflow), then
	// re-cache every page's geometry (cheap report-only reads; simplest way to
	// stay correct across any recompile, not just a count change).
	function reconcile(pageCount: number): void {
		while (slots.length > pageCount) {
			const slot = slots.pop();
			if (!slot) break;
			observer.unobserve(slot.el);
			pageByEl.delete(slot.el);
			unmountPage(slot.page);
			visible.delete(slot.page);
			slot.el.remove();
		}
		while (slots.length < pageCount) {
			slots.push(makeSlot(slots.length));
		}
		for (let i = 0; i < slots.length; i++) {
			const size = session.pageSize(i);
			slots[i] = { ...slots[i], size };
			// Keep the page box's shape in step with the re-read size — a recompile
			// can change a page's dimensions without changing the count, and every
			// %-space overlay/click transform assumes box shape matches PageSize.
			slots[i].el.style.aspectRatio = `${size.widthPt} / ${size.heightPt}`;
		}
	}

	reconcile(session.pageCount);

	return {
		get slots() {
			return slots;
		},
		refresh(dirtyPages, pageCount) {
			reconcile(pageCount);
			// Slot count may have moved the band (pages added/removed); a page the
			// band just painted is already post-apply, so a second full
			// rasterization from the dirty loop would add nothing.
			const painted = updateBand();
			for (const page of dirtyPages) {
				if (painted.has(page)) continue;
				const slot = slots[page];
				if (slot && canvases.has(page)) paintSlot(slot);
			}
		},
		setDensityZoom(z) {
			zoom = z;
			for (const page of canvases.keys()) {
				const slot = slots[page];
				if (slot) paintSlot(slot);
			}
		},
		destroy() {
			observer.disconnect();
			for (const page of [...canvases.keys()]) unmountPage(page);
			for (const slot of slots) slot.el.remove();
			slots.length = 0;
			pageByEl.clear();
		}
	};
}
