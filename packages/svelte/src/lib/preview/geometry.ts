// The one shared pixel<->PDF-pt transform, and the one rule for WHICH rects an
// address has. Both the overlay's forward direction (a FieldRegion rect -> CSS % of
// the page box, overlay.ts) and the bridge's inverse (a CSS px click -> PDF-pt for
// `positionAt`, bridge.ts) derive from `PageSize` alone here, so they can never
// drift apart; the correctness seam PREVIEW.md calls out. Pure: no DOM, no session;
// safe to unit-test against known geometry (tests/preview/geometry.test.ts).
import type { FieldRegion, PageSize } from '@quillmark/wasm';

/** A page rect in PDF points, `[x0, y0, x1, y1]`, bottom-left origin (`FieldRegion.rect`'s shape). */
export type PdfRect = readonly [number, number, number, number];

/** A rect as CSS percent of the page box (top-left origin; Y is flipped from PDF-pt). */
export interface PercentRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** A point in PDF points, bottom-left origin (the space `positionAt`/`fieldAt` read). */
export interface PdfPoint {
	x: number;
	y: number;
}

/**
 * An address's boxes: `fieldBoxes`'s union, else its own `regions()` rects, else the
 * rects of everything UNDER it. The one rule the overlay and the scroll both read, so
 * an address `regions()` names never draws nothing (PREVIEW.md §"Three
 * responsibilities").
 *
 * `fieldBoxes` answers `[]` for a scalar reference the plate places without tracking
 * its content and for a `richtext[]` element; runtime.d.ts says what such a field's
 * box is, a single `regions()` rect. The third rung is that sentence one granularity
 * down — an array's ink is its elements' — and is a fallback, not a union, so an
 * address with rects of its own never also draws its children's. The `.` keeps the
 * prefix a path boundary: `main.references` matches `main.references.0`, not
 * `main.references_note`.
 */
export function boxesForField(
	field: string,
	boxes: readonly FieldRegion[],
	regions: readonly FieldRegion[]
): readonly FieldRegion[] {
	if (boxes.length) return boxes;
	const own = regions.filter((r) => r.field === field);
	return own.length ? own : regions.filter((r) => r.field.startsWith(`${field}.`));
}

/**
 * Forward: a PDF-pt rect -> CSS % of the page box. Percent positioning tracks
 * the page's displayed size across DPR and container resize for free; this is
 * what the overlay draws (overlay.ts).
 */
export function rectToPercent(rect: PdfRect, pageSize: PageSize): PercentRect {
	const [x0, y0, x1, y1] = rect;
	const { widthPt, heightPt } = pageSize;
	return {
		left: (x0 / widthPt) * 100,
		top: (1 - y1 / heightPt) * 100,
		width: ((x1 - x0) / widthPt) * 100,
		height: ((y1 - y0) / heightPt) * 100
	};
}

/**
 * Position `el` absolutely at `pct` (the % rect this module produces); the one
 * `PercentRect` → `element.style` write, shared by the overlay's field boxes and
 * the bridge's scroll marker so the positioning convention lives in one place.
 * The caller sets any box chrome (border, background) on top.
 */
export function applyPercentRect(el: HTMLElement, pct: PercentRect): void {
	Object.assign(el.style, {
		position: 'absolute',
		left: `${pct.left}%`,
		top: `${pct.top}%`,
		width: `${pct.width}%`,
		height: `${pct.height}%`
	});
}

/**
 * Inverse: a click at CSS px `(px, py)` within a page element of CSS size
 * `(cssW, cssH)` -> PDF-pt. The EXACT inverse of {@link rectToPercent}: the
 * fraction `rectToPercent` would place a point's box corner at is the same
 * fraction this reads back from `px/cssW`, `py/cssH`; DPR-independent, since
 * the page element's CSS size (not its canvas backing store) is the only input.
 * This is what the click bridge feeds `session.positionAt`/`fieldAt` (bridge.ts).
 */
export function clickToPdfPt(
	px: number,
	py: number,
	cssW: number,
	cssH: number,
	pageSize: PageSize
): PdfPoint {
	const { widthPt, heightPt } = pageSize;
	return {
		x: (px / cssW) * widthPt,
		y: heightPt - (py / cssH) * heightPt
	};
}
