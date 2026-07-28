// Field-box overlay: absolutely-positioned % divs per page, one per
// `session.fieldBoxes(field)` entry, grouped by `field` via a `data-qm-field`
// attribute (a field can surface several boxes — header/continuation/repeat,
// see PREVIEW.md). Reads geometry off the session; never mutates it. Each
// page's layer sits over its canvas with `pointer-events:none` so clicks fall
// through to bridge.ts's listener on the slot beneath — the overlay is
// decoration, never an independent click target.
//
// The boxes carry NO resting ink. They exist for their geometry (bridge.ts and the
// e2e read their rects) and to be bloomed: the preview is the rendered output, so
// correlation is marked as an event that decays, not as a border the document did
// not ask for. See `core/bloom.ts` for why the wash resumes rather than restarts.
import type { LiveSession } from '../core/index.js';
import { bloom } from '../core/bloom.js';
import type { PageSlot } from './paint.js';
import { rectToPercent, applyPercentRect } from './geometry.js';

export interface OverlayController {
	/** Re-read geometry and rebuild every box — call after a layout-affecting refresh. */
	refresh(): void;
	/** Bloom `field`'s boxes — transient, and a no-op when `field` is already the marked one. */
	flashField(field: string): void;
	destroy(): void;
}

const FIELD_ATTR = 'data-qm-field';
const WASH = 'var(--_qm-accent-wash)';

export function createOverlay(session: LiveSession, slots: readonly PageSlot[]): OverlayController {
	const layers: HTMLElement[] = slots.map((slot) => {
		const layer = document.createElement('div');
		layer.className = 'qm-overlay-layer';
		Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
		slot.el.appendChild(layer);
		return layer;
	});

	// The last address marked. Distinct from `flash`, which is only the bloom in
	// flight: the guard has to OUTLIVE the decay, or the next caret move after a
	// bloom ended would re-mark the same field. The editor→preview signal is
	// continuous (every caret move, so every keystroke), and marking the field being
	// typed into is the noise this replaced — only a change of address is an event.
	let marked: string | undefined;
	let flash: { field: string; startedAt: number } | undefined;

	function boxesFor(field: string): HTMLElement[] {
		const out: HTMLElement[] = [];
		for (const layer of layers)
			for (const child of Array.from(layer.children)) {
				const el = child as HTMLElement;
				if (el.getAttribute(FIELD_ATTR) === field) out.push(el);
			}
		return out;
	}

	// Start or RESUME the bloom on whatever boxes currently exist for it — one path,
	// because starting is just resuming at ~0. A field surfaces several boxes and they
	// share `startedAt`, so they bloom in step rather than shimmering unevenly. When
	// nothing takes (the decay is spent, or the field lost its boxes) the flash is
	// dropped here, so the state lives exactly as long as the animation without
	// leaning on an event a re-created node may never fire.
	function applyFlash(): void {
		if (!flash) return;
		const elapsed = performance.now() - flash.startedAt;
		let live = false;
		for (const el of boxesFor(flash.field)) live = bloom(el, elapsed) !== undefined || live;
		if (!live) flash = undefined;
	}

	// Field names come from `regions()` (the only session query that enumerates
	// them — Preview carries no schema); the boxes themselves come from
	// `fieldBoxes(field)`, which is content-only and `[]` for a scalar-reference
	// or widget field, so a nameless-of-content field contributes no boxes.
	function build(): void {
		for (const layer of layers) layer.replaceChildren();
		const fields = new Set<string>();
		for (const region of session.regions()) fields.add(region.field);
		for (const field of fields) {
			for (const box of session.fieldBoxes(field)) {
				const layer = layers[box.page];
				const slot = slots[box.page];
				if (!layer || !slot) continue;
				const pct = rectToPercent(box.rect, slot.size);
				const el = document.createElement('div');
				el.className = 'qm-field-box';
				el.setAttribute(FIELD_ATTR, field);
				applyPercentRect(el, pct);
				Object.assign(el.style, {
					boxSizing: 'border-box',
					borderRadius: '2px',
					background: WASH,
					opacity: '0'
				});
				layer.appendChild(el);
			}
		}
		applyFlash();
	}

	build();

	return {
		refresh: build,
		flashField(field) {
			if (field === marked) return;
			marked = field;
			flash = { field, startedAt: performance.now() };
			applyFlash();
		},
		destroy() {
			for (const layer of layers) layer.remove();
		}
	};
}
