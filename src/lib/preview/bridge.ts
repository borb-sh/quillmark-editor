// The click bridge: a click on a page slot resolves pixel -> PDF-pt (the EXACT
// inverse of overlay.ts's forward transform, both from geometry.ts) -> a content
// hit via `session.positionAt`, surfaced through `onCaretPick`. Also the
// editor->preview scroll commands (`scrollToField`/`focusPosition`), which
// place an ephemeral marker at the target's % position and let the DOM scroll
// to it — robust to zoom/resize since it reads the SAME percent geometry the
// overlay draws, not a hand-rolled pixel offset.
import type { LiveSession, ContentHit } from '../core/index.js';
import type { PageSlot } from './paint.js';
import { rectToPercent, clickToPdfPt, type PercentRect } from './geometry.js';

export interface BridgeController {
	/** Scroll `field`'s first content box into view (a no-op if it has none). */
	scrollToField(field: string): void;
	/** Scroll the caret rect at `field`/`pos` into view (a no-op off-content). */
	focusPosition(field: string, pos: number): void;
	destroy(): void;
}

export function createBridge(
	session: LiveSession,
	slots: readonly PageSlot[],
	onCaretPick: ((hit: ContentHit) => void) | undefined
): BridgeController {
	const unlisten: Array<() => void> = [];

	if (onCaretPick) {
		for (const { page, el } of slots) {
			const handleClick = (ev: MouseEvent): void => {
				// Re-read through the live array: a same-count `refresh` swaps the
				// slot objects to re-cache `size`, and the click math must use the
				// current compile's PageSize, not the one captured at bridge build.
				const slot = slots[page];
				if (!slot) return;
				const box = slot.el.getBoundingClientRect();
				const px = ev.clientX - box.left;
				const py = ev.clientY - box.top;
				const pt = clickToPdfPt(px, py, box.width, box.height, slot.size);
				const hit = session.positionAt(slot.page, pt.x, pt.y);
				if (hit) onCaretPick(hit);
			};
			el.addEventListener('click', handleClick);
			unlisten.push(() => el.removeEventListener('click', handleClick));
		}
	}

	// Scroll `slot` so the % rect `pct` centers in view, via a throwaway marker —
	// reuses native scrollIntoView instead of hand-rolling a scroll offset.
	function scrollToPercentRect(slot: PageSlot, pct: PercentRect): void {
		const marker = document.createElement('div');
		Object.assign(marker.style, {
			position: 'absolute',
			left: `${pct.left}%`,
			top: `${pct.top}%`,
			width: `${pct.width}%`,
			height: `${pct.height}%`
		});
		slot.el.appendChild(marker);
		marker.scrollIntoView({ block: 'center', inline: 'nearest' });
		marker.remove();
	}

	return {
		scrollToField(field) {
			const box = session.fieldBoxes(field)[0];
			if (!box) return;
			const slot = slots[box.page];
			if (!slot) return;
			scrollToPercentRect(slot, rectToPercent(box.rect, slot.size));
		},
		focusPosition(field, pos) {
			const region = session.locate(field, pos);
			if (!region) return;
			const slot = slots[region.page];
			if (!slot) return;
			scrollToPercentRect(slot, rectToPercent(region.rect, slot.size));
		},
		destroy() {
			for (const off of unlisten) off();
		}
	};
}
