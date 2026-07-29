// Field-box overlay: absolutely-positioned % divs per page, one per
// `session.fieldBoxes(field)` entry, grouped by `field` via a `data-qm-field`
// attribute (a field can surface several boxes — header/continuation/repeat,
// see PREVIEW.md). Reads geometry off the session; never mutates it. Each
// page's layer sits over its canvas with `pointer-events:none` so clicks fall
// through to bridge.ts's listener on the slot beneath — the overlay is
// decoration, never an independent click target.
//
// The boxes carry NO resting ink. They exist for their geometry (bridge.ts reads
// their rects) and to be bloomed: the preview is the rendered output, so
// correlation is marked as an event that decays, not as a border the document did
// not ask for. See `core/bloom.ts` for why the wash resumes rather than restarts.
import type { LiveSession } from '../core/index.js';
import { bloom, bloomTiming, primeWash } from '../core/bloom.js';
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

export function createOverlay(session: LiveSession, slots: readonly PageSlot[]): OverlayController {
	const layers: HTMLElement[] = slots.map((slot) => {
		const layer = document.createElement('div');
		layer.className = 'qm-overlay-layer';
		Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
		slot.el.appendChild(layer);
		return layer;
	});

	// The marked address, and with it the bloom's start. ONE variable does both jobs:
	// the change guard has to outlive the decay (a caret move after the wash ended
	// must not re-mark the same field), and `bloom` refuses an `elapsed` past the
	// decay, so a spent flash is inert on every later rebuild and never needs
	// clearing. The editor→preview signal is continuous — every caret move, so every
	// keystroke — and only a change of address is an event; marking the field being
	// typed into is noise the recompile already answers, since the changed text
	// repaints under the caret 120ms later.
	let flash: { field: string; startedAt: number } | undefined;
	/** field → its boxes, rebuilt with them. The bloom's only lookup. */
	let byField = new Map<string, HTMLElement[]>();

	// Start or RESUME the bloom on whatever boxes exist for it now — one path, because
	// starting is resuming at ~0. A field surfaces several boxes and they share
	// `startedAt`, so they bloom in step rather than shimmering unevenly.
	function applyFlash(): void {
		const els = flash && byField.get(flash.field);
		if (!flash || !els?.length) return;
		const elapsed = performance.now() - flash.startedAt;
		const timing = bloomTiming(els[0]);
		for (const el of els) bloom(el, elapsed, timing);
	}

	// Field names come from `regions()` (the only session query that enumerates
	// them — Preview carries no schema); the boxes themselves come from
	// `fieldBoxes(field)`, which is content-only and `[]` for a scalar-reference
	// or widget field, so a nameless-of-content field contributes no boxes.
	function build(): void {
		for (const layer of layers) layer.replaceChildren();
		byField = new Map();
		const fields = new Set<string>();
		for (const region of session.regions()) fields.add(region.field);
		for (const field of fields) {
			const els: HTMLElement[] = [];
			for (const box of session.fieldBoxes(field)) {
				const layer = layers[box.page];
				const slot = slots[box.page];
				if (!layer || !slot) continue;
				const pct = rectToPercent(box.rect, slot.size);
				const el = document.createElement('div');
				el.className = 'qm-field-box';
				el.setAttribute(FIELD_ATTR, field);
				applyPercentRect(el, pct);
				el.style.borderRadius = '2px';
				primeWash(el);
				layer.appendChild(el);
				els.push(el);
			}
			if (els.length) byField.set(field, els);
		}
		applyFlash();
	}

	build();

	return {
		refresh: build,
		flashField(field) {
			if (field === flash?.field) return;
			flash = { field, startedAt: performance.now() };
			applyFlash();
		},
		destroy() {
			for (const layer of layers) layer.remove();
		}
	};
}
