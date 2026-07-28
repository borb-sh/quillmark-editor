import { test, expect, type Page } from '@playwright/test';
import { openPlayground, clickFieldBox } from './support.js';

// Phase 2 exit criteria (browser tier): the playground paints usaf_memo, draws
// field-box overlays, resolves clicks to content positions, and bounds mounted
// canvases to the visible+margin band on scroll. `/preview` mounts `<Preview
// margin={0}>` over a fixed short shell specifically so virtualization is
// observable with a 2-page fixture (see src/routes/preview/+page.svelte's
// header comment for why margin=0, not the component's default of 1).

/** Page indices (0-based, DOM order of `.qm-page`) that currently have a mounted canvas. */
async function mountedPages(page: Page): Promise<number[]> {
	return page.evaluate(() => {
		const slots = Array.from(document.querySelectorAll('.qm-page'));
		return slots
			.map((el, i) => (el.querySelector('canvas.qm-page-canvas') ? i : -1))
			.filter((i) => i >= 0);
	});
}

test.describe('preview', () => {
	test.beforeEach(async ({ page }) => {
		await openPlayground(page, '/preview');
	});

	test('(a) paints at least one canvas with non-zero backing size', async ({ page }) => {
		const canvas = page.locator('canvas.qm-page-canvas').first();
		await expect(canvas).toBeVisible();
		const [w, h] = await canvas.evaluate((el: HTMLCanvasElement) => [el.width, el.height]);
		expect(w).toBeGreaterThan(0);
		expect(h).toBeGreaterThan(0);
	});

	test('(b) renders field-box overlay elements', async ({ page }) => {
		await expect(page.locator('[data-qm-field]').first()).toBeVisible();
		expect(await page.locator('[data-qm-field]').count()).toBeGreaterThan(0);
	});

	test('(c) clicking the subject field ink sets last-hit to a subject ContentHit', async ({
		page
	}) => {
		await clickFieldBox(page, 'main.subject');
		await expect(page.getByTestId('last-hit')).toContainText('"field":"main.subject"');
	});

	test('(d) clicking a clearly-empty margin area does not change last-hit', async ({ page }) => {
		// First set last-hit via a real field click, so the follow-up margin click
		// is proven to leave an EXISTING hit alone, not just that it starts empty.
		await clickFieldBox(page, 'main.subject');
		await expect(page.getByTestId('last-hit')).toContainText('"field":"main.subject"');
		const before = await page.getByTestId('last-hit').textContent();

		// A few CSS px from the page's own top-left corner — for usaf_memo's
		// letter-format margins this is nowhere near any field's content ink.
		const page0 = page.locator('.qm-page').first();
		const pRect = await page0.boundingBox();
		if (!pRect) throw new Error('page slot has no bounding box');
		await page.mouse.click(pRect.x + 4, pRect.y + 4);

		// positionAt returns nothing off-ink, so onCaretPick never fires and the
		// DOM stays exactly as it was after the field click.
		await expect(page.getByTestId('last-hit')).toHaveText(before ?? '');
	});

	test('(e) scrolling keeps mounted canvases bounded below pageCount (virtualization)', async ({
		page
	}) => {
		await expect(page.locator('canvas.qm-page-canvas').first()).toBeVisible();

		// At scroll-top, margin=0 mounts exactly the intersecting page — page 0 —
		// and NOT page 1 (both pages taller than the 500px shell, so they never
		// share the viewport at once).
		await expect.poll(() => mountedPages(page), { timeout: 10_000 }).toEqual([0]);

		const scrollContainer = page.locator('.qm-preview');
		await scrollContainer.evaluate((el) => {
			el.scrollTop = el.scrollHeight;
		});

		// At scroll-bottom, only page 1 should be mounted — proving the band
		// actually MOVES with scroll (bounded AND live), not just "always < 2".
		await expect.poll(() => mountedPages(page), { timeout: 10_000 }).toEqual([1]);
	});

	// Bonus coverage beyond the required (a)-(e): the OTHER half of the exit
	// criteria ("an apply from the playground repaints only dirty ∩ visible
	// pages") needs a live `apply`, which only the playground route can drive
	// (Preview itself never calls `apply`). Not pixel-diffed — just proves the
	// refresh(changeSet) plumbing runs end-to-end without error.
	test('(f) apply + refresh updates dirtyPages without a page error', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(String(e)));

		await expect(page.getByTestId('dirty-pages')).toHaveText('dirtyPages: —');
		await page.getByRole('button', { name: 'Edit subject (apply + refresh)' }).click();
		await expect(page.getByTestId('dirty-pages')).not.toHaveText('dirtyPages: —');

		expect(errors, errors.join('\n')).toEqual([]);
	});

	// Bonus: the remaining command-surface verbs the click-bridge tests don't
	// reach. setZoom folds into densityScale (crispness) — the mounted canvas's
	// BACKING STORE should scale with it, independent of its unchanged CSS size.
	test('(g) setZoom(2) roughly doubles the mounted canvas backing store', async ({ page }) => {
		const canvas = page.locator('canvas.qm-page-canvas').first();
		await expect(canvas).toBeVisible();
		const before = await canvas.evaluate((el: HTMLCanvasElement) => [el.width, el.height]);

		await page.getByRole('button', { name: 'Zoom 2x' }).click();

		await expect
			.poll(async () => {
				const [w] = await canvas.evaluate((el: HTMLCanvasElement) => [el.width, el.height]);
				return w;
			})
			.toBeGreaterThan(before[0] * 1.5);
		const after = await canvas.evaluate((el: HTMLCanvasElement) => [el.width, el.height]);
		expect(after[0] / before[0]).toBeCloseTo(2, 1);
		expect(after[1] / before[1]).toBeCloseTo(2, 1);
	});

	// scrollToField(fieldBoxes -> scroll into view): scroll away from subject's
	// first box (on page 0) down to the bottom, then prove the command scrolls
	// back toward it. focusPosition shares this same scroll mechanic in
	// bridge.ts (only the geometry source differs: `locate` vs `fieldBoxes`,
	// both exercised elsewhere), so this stands in for both.
	test('(h) scrollToField scrolls the container back to the field', async ({ page }) => {
		const scrollContainer = page.locator('.qm-preview');
		await scrollContainer.evaluate((el) => {
			el.scrollTop = el.scrollHeight;
		});
		await expect.poll(() => mountedPages(page), { timeout: 10_000 }).toEqual([1]);
		const scrollTopAtBottom = await scrollContainer.evaluate((el) => el.scrollTop);

		await page.getByRole('button', { name: 'Scroll to subject' }).click();

		await expect
			.poll(async () => scrollContainer.evaluate((el) => el.scrollTop), { timeout: 10_000 })
			.toBeLessThan(scrollTopAtBottom);
	});

	// A mounted canvas must not keep the CSS width it had at paint time: a
	// widened/narrowed pane would leave the raster the wrong size under the
	// %-tracked page box (overlays drift off the ink). The ResizeObserver in
	// paint.ts repaints mounted pages so the canvas re-fits its box. Narrow the
	// shell and assert the canvas tracks the box.
	test('(i) resizing the container repaints the mounted canvas to track the page box', async ({
		page
	}) => {
		const canvas = page.locator('canvas.qm-page-canvas').first();
		await expect(canvas).toBeVisible();

		// The paint contract's layoutWidth == the box's clientWidth, so a correctly
		// fitted canvas renders exactly as wide as its `.qm-page` box.
		const widths = () =>
			page.evaluate(() => {
				const c = document.querySelector('canvas.qm-page-canvas') as HTMLCanvasElement;
				const box = c.parentElement as HTMLElement;
				return { canvas: c.getBoundingClientRect().width, box: box.clientWidth };
			});
		const before = await widths();
		expect(Math.abs(before.canvas - before.box)).toBeLessThan(2);

		// Narrow the shell so the %-width page box shrinks under the mounted canvas.
		await page.evaluate(() => {
			(document.querySelector('.preview-shell') as HTMLElement).style.width = '360px';
		});

		// The box shrinks immediately (CSS %); without the ResizeObserver the canvas
		// keeps its frozen width and drifts. Poll until the repaint re-fits it to the
		// (now clearly smaller) box.
		await expect
			.poll(
				async () => {
					const w = await widths();
					return Math.abs(w.canvas - w.box) < 2 && w.box < before.box - 50;
				},
				{ timeout: 10_000 }
			)
			.toBe(true);
	});
});
