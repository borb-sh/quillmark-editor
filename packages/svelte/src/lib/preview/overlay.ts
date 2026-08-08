// Field-box overlay: absolutely-positioned % divs per page, one per box an address
// has (`geometry.ts`, `boxesForField`), grouped by `field` via a `data-qm-field`
// attribute (a field can surface several boxes: header/continuation/repeat, see
// PREVIEW.md). Reads geometry off the session; never mutates it. Each page's layer
// sits over its canvas with `pointer-events:none` so clicks fall through to
// bridge.ts's listener on the slot beneath; the overlay is decoration, never an
// independent click target.
//
// The boxes carry NO resting ink. They exist for their geometry (bridge.ts reads
// their rects) and to be bloomed: the preview is the rendered output, so
// correlation is marked as an event that decays, not as a border the document did
// not ask for. See `core/bloom.ts` for why the wash resumes rather than restarts.
import type { LiveSession } from '@quillmark/wasm';
import { bloom, bloomTiming, primeWash } from '../core/bloom.js';
import type { PageSlot } from './paint.js';
import { boxesForField, rectToPercent, applyPercentRect } from './geometry.js';

export interface OverlayController {
	/** Re-read geometry and rebuild every box; call after a layout-affecting refresh. */
	refresh(): void;
	/** Bloom the boxes at `field` AND under it: transient, and a no-op when `field`
	 *  is already the marked one. */
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
	// clearing. The editor→preview signal is continuous (every caret move, so every
	// keystroke), and only a change of address is an event; marking the field being
	// typed into is noise the recompile already answers, since the changed text
	// repaints under the caret 120ms later.
	let flash: { field: string; startedAt: number } | undefined;
	/** field → its boxes, rebuilt with them. The bloom's only lookup. */
	let byField = new Map<string, HTMLElement[]>();

	// The boxes a flash covers: the address's own, plus every one UNDER it, since the
	// boxes are keyed as `regions()` names them (`main.references.0`) and an
	// editor-side signal names the declared field (`main.references`). Resolved per
	// apply rather than at `flashField`, so a rebuild picks up boxes the recompile
	// moved or added.
	function flashed(field: string): HTMLElement[] {
		const els: HTMLElement[] = [];
		for (const [key, group] of byField) {
			if (key === field || key.startsWith(`${field}.`)) els.push(...group);
		}
		return els;
	}

	// Start or RESUME the bloom on whatever boxes exist for it now: one path, because
	// starting is resuming at ~0. A field surfaces several boxes and they share
	// `startedAt`, so they bloom in step rather than shimmering unevenly.
	function applyFlash(): void {
		if (!flash) return;
		const els = flashed(flash.field);
		if (!els.length) return;
		const elapsed = performance.now() - flash.startedAt;
		const timing = bloomTiming(els[0]);
		for (const el of els) bloom(el, elapsed, timing);
	}

	// Field names come from `regions()` (the only session query that enumerates them;
	// Preview carries no schema); the rects from `boxesForField`, whose fallback is
	// what makes every address `regions()` names draw.
	function build(): void {
		for (const layer of layers) layer.replaceChildren();
		byField = new Map();
		const regions = session.regions();
		const fields = new Set<string>();
		for (const region of regions) fields.add(region.field);
		for (const field of fields) {
			const els: HTMLElement[] = [];
			for (const box of boxesForField(field, session.fieldBoxes(field), regions)) {
				const layer = layers[box.page];
				const slot = slots[box.page];
				if (!layer || !slot) continue;
				const pct = rectToPercent(box.rect, slot.size);
				const el = document.createElement('div');
				el.className = 'qm-field-box';
				el.setAttribute(FIELD_ATTR, field);
				applyPercentRect(el, pct);
				el.style.borderRadius = 'var(--_qm-radius-inner)';
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
