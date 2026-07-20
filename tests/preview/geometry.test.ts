// The shared pixel<->PDF-pt transform (src/lib/preview/geometry.ts), tested both
// as pure math (synthetic rects, exact round-trip) and against a real compiled
// session (subject's fieldBoxes rect -> % -> a simulated click at its center ->
// positionAt), proving the overlay's forward transform and the bridge's inverse
// never drift apart. No canvas needed — geometry and positionAt are session
// queries, so this runs in Node against the real Typst backend.
//
// geometry.ts is reached directly (not through the `$lib/preview` barrel, which
// only re-exports the public `createPreview`/`Preview` surface per PREVIEW.md —
// the transform is an internal correctness seam, not part of that surface).
import { describe, it, expect } from 'vitest';
import { Engine, Quill } from '$lib/core';
import type { PageSize } from '$lib/core';
import { rectToPercent, clickToPdfPt } from '$lib/preview/geometry.js';
import { loadFixtureTree } from '../helpers/fixtures.js';

describe('geometry: synthetic round-trip', () => {
	const pageSize: PageSize = { widthPt: 612, heightPt: 792 }; // US Letter

	it('rectToPercent places a known rect at the expected %', () => {
		// A 100x50pt box with its bottom-left corner at (50,700) — near the
		// top-left of the page (y is bottom-left origin, so a high y sits near the top).
		const rect: [number, number, number, number] = [50, 700, 150, 750];
		const pct = rectToPercent(rect, pageSize);
		expect(pct.left).toBeCloseTo((50 / 612) * 100, 10);
		expect(pct.top).toBeCloseTo((1 - 750 / 792) * 100, 10);
		expect(pct.width).toBeCloseTo((100 / 612) * 100, 10);
		expect(pct.height).toBeCloseTo((50 / 792) * 100, 10);
	});

	it('clickToPdfPt is the exact inverse of rectToPercent, for points across the page', () => {
		// Model a point as a zero-size rect so both directions compose through the
		// SAME forward transform the overlay uses — not a hand-derived inverse.
		const cssW = 612;
		const cssH = 792;
		const points: Array<[number, number]> = [
			[0, 0], // bottom-left corner
			[pageSize.widthPt, pageSize.heightPt], // top-right corner
			[pageSize.widthPt / 2, pageSize.heightPt / 2], // center
			[123.4, 567.8] // an arbitrary interior point
		];
		for (const [x, y] of points) {
			const pct = rectToPercent([x, y, x, y], pageSize);
			const px = (pct.left / 100) * cssW;
			const py = (pct.top / 100) * cssH;
			const pt = clickToPdfPt(px, py, cssW, cssH, pageSize);
			expect(pt.x).toBeCloseTo(x, 6);
			expect(pt.y).toBeCloseTo(y, 6);
		}
	});

	it('clickToPdfPt is DPR/size-independent — the same % click lands the same PDF-pt at any CSS size', () => {
		const rect: [number, number, number, number] = [50, 700, 150, 750];
		const pct = rectToPercent(rect, pageSize);
		const results = [300, 612, 1500, 3000].map((cssW) => {
			const cssH = (cssW / pageSize.widthPt) * pageSize.heightPt;
			const px = (pct.left / 100) * cssW;
			const py = (pct.top / 100) * cssH;
			return clickToPdfPt(px, py, cssW, cssH, pageSize);
		});
		for (const pt of results) {
			expect(pt.x).toBeCloseTo(rect[0], 6);
			expect(pt.y).toBeCloseTo(rect[3], 6); // top-left on screen = y1 in bottom-left space
		}
	});
});

describe('geometry: against a real compiled session (usaf_memo)', () => {
	it('forward-transforms a subject fieldBox to %, then inverse-transforms its center back to a positionAt hit on subject', async () => {
		const tree = loadFixtureTree();
		const quill = Quill.fromTree(tree);
		const doc = quill.seedDocument();
		const engine = new Engine();
		const session = await engine.open(quill, doc);
		try {
			const boxes = session.fieldBoxes('subject');
			expect(boxes.length).toBeGreaterThan(0);
			const box = boxes[0];
			const pageSize = session.pageSize(box.page);
			const pct = rectToPercent(box.rect, pageSize);

			// A page element rendered at some arbitrary CSS size (DPR-independent).
			const cssW = 800;
			const cssH = (cssW / pageSize.widthPt) * pageSize.heightPt;
			const centerPx = ((pct.left + pct.width / 2) / 100) * cssW;
			const centerPy = ((pct.top + pct.height / 2) / 100) * cssH;

			const pt = clickToPdfPt(centerPx, centerPy, cssW, cssH, pageSize);
			const hit = session.positionAt(box.page, pt.x, pt.y);
			expect(hit?.field).toBe('subject');
		} finally {
			session.free();
			doc.free();
			quill.free();
		}
	});

	it('subject surfaces multiple fieldBoxes across pages (header + continuation)', async () => {
		const tree = loadFixtureTree();
		const quill = Quill.fromTree(tree);
		const doc = quill.seedDocument();
		const engine = new Engine();
		const session = await engine.open(quill, doc);
		try {
			// subject -> 2 boxes (page 0 header + page 1 continuation),
			// same span — the exact case overlay.ts's "group by field" exists for.
			const boxes = session.fieldBoxes('subject');
			expect(boxes.length).toBeGreaterThanOrEqual(2);
			const pages = new Set(boxes.map((b) => b.page));
			expect(pages.size).toBeGreaterThanOrEqual(2);
		} finally {
			session.free();
			doc.free();
			quill.free();
		}
	});

	it('every fieldBoxes rect round-trips through positionAt back to its own field, somewhere in the box', async () => {
		// NOT the box's geometric center: fieldBoxes unions same-page segments into
		// ONE rect (PREVIEW.md), so a field whose content is two non-adjacent lines
		// (e.g. $body, verified empirically: two disjoint line segments with a real
		// vertical gap between them) has a bounding box whose center legitimately
		// falls in that gap, off any ink. A grid sample proves the transform is
		// correct everywhere it's exercised, without assuming a geometry the API
		// never promised (that promise is `subject`-specific, tested above).
		const tree = loadFixtureTree();
		const quill = Quill.fromTree(tree);
		const doc = quill.seedDocument();
		const engine = new Engine();
		const session = await engine.open(quill, doc);
		try {
			const fieldNames = new Set(session.regions().map((r) => r.field));
			expect(fieldNames.size).toBeGreaterThan(0);
			const fractions = [0.1, 0.3, 0.5, 0.7, 0.9];
			let checked = 0;
			for (const field of fieldNames) {
				for (const box of session.fieldBoxes(field)) {
					const pageSize = session.pageSize(box.page);
					const pct = rectToPercent(box.rect, pageSize);
					const cssW = 612;
					const cssH = (cssW / pageSize.widthPt) * pageSize.heightPt;
					let hitOwnField = false;
					for (const fy of fractions) {
						for (const fx of fractions) {
							const px = ((pct.left + fx * pct.width) / 100) * cssW;
							const py = ((pct.top + fy * pct.height) / 100) * cssH;
							const pt = clickToPdfPt(px, py, cssW, cssH, pageSize);
							const hit = session.positionAt(box.page, pt.x, pt.y);
							if (hit?.field === field) hitOwnField = true;
						}
					}
					expect(
						hitOwnField,
						`field ${field} page ${box.page}: no grid sample hit its own ink`
					).toBe(true);
					checked++;
				}
			}
			expect(checked).toBeGreaterThan(0);
		} finally {
			session.free();
			doc.free();
			quill.free();
		}
	});
});
