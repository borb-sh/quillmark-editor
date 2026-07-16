// The one shared pixel<->PDF-pt transform. Both the overlay's forward direction
// (a FieldRegion rect -> CSS % of the page box, overlay.ts) and the bridge's
// inverse (a CSS px click -> PDF-pt for `positionAt`, bridge.ts) derive from
// `PageSize` alone here, so they can never drift apart — the correctness seam
// PHASE_2 calls out. Pure: no DOM, no session — safe to unit-test against known
// geometry (tests/preview/geometry.test.ts).
import type { PageSize } from '../core/index.js';

/** A page rect in PDF points, `[x0, y0, x1, y1]`, bottom-left origin — `FieldRegion.rect`'s shape. */
export type PdfRect = readonly [number, number, number, number];

/** A rect as CSS percent of the page box (top-left origin — Y is flipped from PDF-pt). */
export interface PercentRect {
	left: number;
	top: number;
	width: number;
	height: number;
}

/** A point in PDF points, bottom-left origin — the space `positionAt`/`fieldAt` read. */
export interface PdfPoint {
	x: number;
	y: number;
}

/**
 * Forward: a PDF-pt rect -> CSS % of the page box. Percent positioning tracks
 * the page's displayed size across DPR and container resize for free — this is
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
 * Inverse: a click at CSS px `(px, py)` within a page element of CSS size
 * `(cssW, cssH)` -> PDF-pt. The EXACT inverse of {@link rectToPercent}: the
 * fraction `rectToPercent` would place a point's box corner at is the same
 * fraction this reads back from `px/cssW`, `py/cssH` — DPR-independent, since
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
