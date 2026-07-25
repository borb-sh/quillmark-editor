// Field-box overlay: absolutely-positioned % divs per page, one per
// `session.fieldBoxes(field)` entry, grouped by `field` via a `data-qm-field`
// attribute (a field can surface several boxes — header/continuation/repeat,
// see PREVIEW.md). Reads geometry off the session; never mutates it. Each
// page's layer sits over its canvas with `pointer-events:none` so clicks fall
// through to bridge.ts's listener on the slot beneath — the overlay is
// decoration, never an independent click target.
import type { LiveSession } from '../core/index.js';
import type { PageSlot } from './paint.js';
import { rectToPercent, applyPercentRect } from './geometry.js';

export interface OverlayController {
	/** Re-read geometry and rebuild every box — call after a layout-affecting refresh. */
	refresh(): void;
	/** Ring-highlight every box for `field`; clear the ring when `field` is `undefined`. */
	setActiveField(field: string | undefined): void;
	destroy(): void;
}

const FIELD_ATTR = 'data-qm-field';
const ACTIVE_CLASS = 'qm-field-box--active';
const RING = 'var(--_qm-ring-width) solid var(--_qm-accent-soft)';
const RING_ACTIVE = 'var(--_qm-ring-width-active) solid var(--_qm-accent)';

export function createOverlay(session: LiveSession, slots: readonly PageSlot[]): OverlayController {
	const layers: HTMLElement[] = slots.map((slot) => {
		const layer = document.createElement('div');
		layer.className = 'qm-overlay-layer';
		Object.assign(layer.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
		slot.el.appendChild(layer);
		return layer;
	});

	// The ring survives `build()` — a refresh rebuilds every box, and losing the
	// active highlight on each apply would make it useless.
	let activeField: string | undefined;

	function applyRing(el: HTMLElement, field: string): void {
		const isActive = field === activeField;
		el.style.border = isActive ? RING_ACTIVE : RING;
		el.classList.toggle(ACTIVE_CLASS, isActive);
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
					background: 'transparent'
				});
				applyRing(el, field);
				layer.appendChild(el);
			}
		}
	}

	build();

	return {
		refresh: build,
		setActiveField(field) {
			activeField = field;
			for (const layer of layers) {
				for (const child of Array.from(layer.children)) {
					const el = child as HTMLElement;
					applyRing(el, el.getAttribute(FIELD_ATTR) ?? '');
				}
			}
		},
		destroy() {
			for (const layer of layers) layer.remove();
		}
	};
}
