import { test, expect, type Page } from '@playwright/test';
import { openPlayground, reveal } from './support.js';

// The section grid, browser tier. `placeFields` decides spans and is
// unit-tested; the container query decides capacity and subgrid decides alignment,
// and neither is visible anywhere but a laid-out page. Everything here is geometry.
//
// The reference run is the main card's LETTERHEAD group: two full-width fields
// (`letterhead_title`, the `letterhead_caption` array) above a compact run of three —
// `letterhead_seal` (enum), `letterhead_seal_subtitle` (string), `tag_line` (richtext
// + inline). That run reproduced both reported bugs.

interface Box {
	x: number;
	y: number;
	w: number;
	h: number;
	labelH: number | null;
	controlY: number | null;
}

/** Every field in a group's section grid, by field name, with its geometry. */
async function fields(page: Page, group: string): Promise<Record<string, Box>> {
	return page.evaluate((g) => {
		const grid = document
			.querySelector(`[data-testid="group-main-${g}"]`)
			?.closest('.qm-group')
			?.querySelector('.qm-fields');
		const out: Record<string, Box> = {};
		// Only the grid's own children — an array's inner rows are not fields.
		for (const el of grid?.querySelectorAll(':scope > .qm-field') ?? []) {
			// The field's testid sits on a descendant control, prefixed by control kind
			// (`main-letterhead_seal` for a scalar, `prose-main-tag_line` for a leaf).
			let name: string | undefined;
			for (const m of el.querySelectorAll<HTMLElement>('[data-testid]')) {
				const hit = /^(?:prose-)?main-(\w+)$/.exec(m.dataset.testid ?? '');
				if (hit) {
					name = hit[1];
					break;
				}
			}
			if (!name) continue;
			const label = el.querySelector('.qm-field-label');
			const control = el.querySelector('.qm-field-control');
			const r = el.getBoundingClientRect();
			out[name] = {
				x: Math.round(r.x),
				y: Math.round(r.y),
				w: Math.round(r.width),
				h: Math.round(r.height),
				labelH: label ? Math.round(label.getBoundingClientRect().height) : null,
				controlY: control ? Math.round(control.getBoundingClientRect().y) : null
			};
		}
		return out;
	}, group);
}

/** The distinct row offsets among `boxes` — how many visual rows they occupy. */
const rows = (boxes: Box[]) => new Set(boxes.map((b) => b.y)).size;

test.describe('section grid', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1400, height: 900 });
		await openPlayground(page, '/editor');
		await reveal(page, 'group-main-letterhead');
	});

	test('(a) shapes that grow decline the compact hint and take a full row', async ({ page }) => {
		const f = await fields(page, 'letterhead');
		// The `letterhead_caption` array spans the whole grid...
		expect(f.letterhead_caption.w).toBeGreaterThan(f.letterhead_seal.w);
		// ...and shares its row with nothing.
		for (const [name, box] of Object.entries(f)) {
			if (name === 'letterhead_caption') continue;
			expect(box.y, `${name} must not share the array's row`).not.toBe(f.letterhead_caption.y);
		}
	});

	test('(b) a wrapped orphan keeps its column width', async ({ page }) => {
		const f = await fields(page, 'letterhead');
		const run = [f.letterhead_seal, f.letterhead_seal_subtitle, f.tag_line];
		// A run of three at capacity two wraps, and the wrapped field holds ONE column —
		// filling its line would render the third field at twice its siblings.
		expect(rows(run), 'the run of three must wrap').toBe(2);
		expect(new Set(run.map((b) => b.w)), `widths were ${run.map((b) => b.w).join(', ')}`).toEqual(
			new Set([run[0].w])
		);
		// And `tag_line` starts a row rather than trailing one.
		expect(f.tag_line.x).toBe(f.letterhead_seal.x);
	});

	test('(c) subgrid shares row tracks, so one tall label moves every control', async ({ page }) => {
		const before = await fields(page, 'letterhead');
		expect(before.letterhead_seal.y).toBe(before.letterhead_seal_subtitle.y);

		// The reference quill's labels all fit one line at this capacity, so the shared
		// track is forced rather than waited for: inflate ONE label and the neighbour's
		// control must move with it. That is the whole claim — the tracks are the
		// section's, not each field's — and it fails the moment subgrid is dropped.
		await page.evaluate(() => {
			const label = document
				.querySelector('[data-testid="main-letterhead_seal"]')
				?.closest('.qm-field')
				?.querySelector('.qm-field-label') as HTMLElement;
			label.style.display = 'block';
			label.style.height = '60px';
		});
		const after = await fields(page, 'letterhead');

		expect(after.letterhead_seal.labelH).toBeGreaterThan(before.letterhead_seal.labelH!);
		expect(after.letterhead_seal_subtitle.labelH).toBe(before.letterhead_seal_subtitle.labelH);
		// The untouched neighbour's control dropped by the same amount, and both fields
		// still occupy exactly the same rows.
		expect(after.letterhead_seal_subtitle.controlY).toBe(after.letterhead_seal.controlY);
		expect(after.letterhead_seal_subtitle.h).toBe(after.letterhead_seal.h);
		expect(after.letterhead_seal_subtitle.controlY).toBeGreaterThan(
			before.letterhead_seal_subtitle.controlY!
		);
	});

	test('(d) capacity follows the container, and steps 2 → 4 at the rung', async ({ page }) => {
		const two = await fields(page, 'classification');
		// Six compact fields; the editor pane sits at the 2-column rung.
		expect(rows(Object.values(two))).toBe(3);

		// Past 57rem the grid steps to four columns — 6 fields become 2 rows. No surface
		// in the playground is this wide, so the rung is forced rather than resized into.
		await page.addStyleTag({ content: '.qm-group-panel-inner { width: 1000px !important }' });
		const four = await fields(page, 'classification');
		expect(rows(Object.values(four))).toBe(2);
		expect(four.classification.w).toBeLessThan(two.classification.w);
	});

	test('(e) a lone compact field takes half the capacity from column 1', async ({ page }) => {
		// No group in the reference quill has a compact run of ONE, so `lone` is placed
		// by hand here; that it is assigned at all is `placeFields`' unit tests. What the
		// browser settles is the arithmetic — `span var(--cols-half)` has to land on a
		// track boundary, which is why capacity skips 3.
		await page.addStyleTag({ content: '.qm-group-panel-inner { width: 1000px !important }' });
		const geom = await page.evaluate(() => {
			const grid = document
				.querySelector('[data-testid="group-main-classification"]')
				?.closest('.qm-group')
				?.querySelector('.qm-fields') as HTMLElement;
			const first = grid.querySelector(':scope > .qm-field') as HTMLElement;
			const cell = first.getBoundingClientRect().width;
			first.classList.replace('cell', 'lone');
			const lone = first.getBoundingClientRect().width;
			first.classList.replace('lone', 'cell');
			const gap = parseFloat(getComputedStyle(grid).columnGap);
			return {
				cell,
				lone,
				gap,
				cols: getComputedStyle(grid).gridTemplateColumns.split(' ').length
			};
		});
		expect(geom.cols).toBe(4);
		// Half of four columns is two columns plus the gutter between them — exact, not
		// a percentage that lands mid-track.
		expect(Math.round(geom.lone)).toBe(Math.round(geom.cell * 2 + geom.gap));
	});

	// SURFACES §"The shared recipe" — an inline leaf is EXACTLY as tall as the input
	// beside it, because both draw one rule rather than two floors tuned to agree. A
	// control's height is a padding rung, a line box and two hairlines, so the
	// agreement rests on leading as much as on padding: a `line-height` landing on one
	// selector of the shared rule and not the other mints no literal, leaves
	// `check:style` green, and breaks this by a few pixels. Only a browser sees it.
	test('(f2) an inline prose leaf measures exactly as tall as the input beside it', async ({
		page
	}) => {
		const box = (testid: string) =>
			page.getByTestId(testid).evaluate((el) => {
				const s = getComputedStyle(el);
				return { h: el.getBoundingClientRect().height, lineHeight: s.lineHeight };
			});
		const leaf = await box('prose-main-tag_line');
		const input = await box('main-letterhead_seal_subtitle');

		expect(leaf.h).toBe(input.h);
		// …and for the stated reason: one leading rung, resolved, not `normal`.
		expect(leaf.lineHeight).toBe(input.lineHeight);
		expect(leaf.lineHeight).not.toBe('normal');
	});

	test('(f) a resize does not remount a prose leaf', async ({ page }) => {
		// Nothing re-derives row structure, so a capacity change touches CSS tracks and
		// not the DOM: the leaf element must survive resizes in both directions.
		await expect(page.locator('[data-leaf-key="main:tag_line"]')).toBeAttached();
		await page.evaluate(() => {
			const el = document.querySelector('[data-leaf-key="main:tag_line"]') as HTMLElement & {
				__survived?: boolean;
			};
			el.__survived = true;
		});

		for (const width of [620, 900, 1400, 480, 1200]) {
			await page.setViewportSize({ width, height: 900 });
			const survived = await page.evaluate(() => {
				const el = document.querySelector('[data-leaf-key="main:tag_line"]') as HTMLElement & {
					__survived?: boolean;
				};
				return !!el && el.__survived === true;
			});
			expect(survived, `tag_line remounted at ${width}px`).toBe(true);
		}
	});

	// SURFACES §Rhythm — the section's trailing action column. The reservation is an
	// inset on the query container rather than a track, so nothing in the track model
	// says whether an array's element control lands on the same edge as the scalar
	// above it.
	test('(h) one right edge serves the section, and the remove sits beyond it', async ({ page }) => {
		const right = (testid: string) =>
			page.getByTestId(testid).evaluate((el) => el.getBoundingClientRect().right);
		const edge = await right('main-letterhead_title');
		expect(await right('main-letterhead_caption-el-0'), 'an array element').toBe(edge);
		// The last cell of a packed row lands there too: the action column is held clear
		// of the tracks, so capacity is untouched and every row ends on one edge.
		expect(await right('main-letterhead_seal_subtitle'), 'a packed compact cell').toBe(edge);

		// The remove lives in the reserved column — past every control's edge, so it is
		// never over a long value — and keeps the 24px target floor (WCAG 2.5.8).
		const remove = (await page.getByTestId('main-letterhead_caption-remove-0').boundingBox())!;
		expect(remove.x).toBeGreaterThanOrEqual(edge);
		expect(remove.width).toBeGreaterThanOrEqual(24);
		expect(remove.height).toBeGreaterThanOrEqual(24);
	});

	test('(g) the accordion still collapses under containment', async ({ page }) => {
		// `.qm-group-panel-inner` is both the query container and the sliding panel's
		// clipped inner, and `container-type` applies containment — so the 0fr↔1fr
		// collapse is asserted rather than assumed.
		// Polled at both ends: the panel slides on the `slow` duration rung, so neither
		// the open height nor the collapse is settled the instant `aria-expanded` flips.
		// Located through the group, not through `.qm-open` — that class is what the
		// collapse REMOVES, so keying on it would measure nothing instead of zero.
		const panel = page
			.locator('.qm-group', { has: page.getByTestId('group-main-letterhead') })
			.locator('.qm-group-panel');
		await expect
			.poll(async () => Math.round((await panel.boundingBox())?.height ?? -1))
			.toBeGreaterThan(0);

		await page.getByTestId('group-main-letterhead').click();
		await expect(page.getByTestId('group-main-letterhead')).toHaveAttribute(
			'aria-expanded',
			'false'
		);
		await expect.poll(async () => Math.round((await panel.boundingBox())?.height ?? -1)).toBe(0);
	});
});
