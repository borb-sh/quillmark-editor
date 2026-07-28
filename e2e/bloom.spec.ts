import { test, expect, type Page } from '@playwright/test';
import { pm } from './support.js';

// Issue #115 (browser tier): the editor↔preview address is marked as an EVENT and
// the preview rests clean. Unit tests can reach the control flow around the wash
// (tests/preview/overlay.test.ts, with a stubbed `animate` — jsdom has no WAAPI);
// what only the real browser can answer is whether the wash actually RUNS — real
// keyframes, real `color-mix`, real compositing over the page canvas — and whether
// the landing is visible at all, which turns on layout the DOM alone does not
// report (a collapsed accordion group clips its panel to zero height while its
// children keep their intrinsic boxes).

/** Every field box for `field`, as `{opacity, borderWidth, running}`. */
async function boxes(page: Page, field: string) {
	return page.evaluate((f) => {
		const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-qm-field="${f}"]`));
		return els.map((el) => ({
			opacity: Number(getComputedStyle(el).opacity),
			borderWidth: getComputedStyle(el).borderTopWidth,
			running: el.getAnimations().length,
			offset: Number(el.getAnimations()[0]?.currentTime ?? -1)
		}));
	}, field);
}

test.describe('correlation bloom', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/editor');
		// The Typst backend (26 MB) compiles on the first open; give it room.
		await expect(page.getByTestId('status')).toHaveText('Session open.', { timeout: 60_000 });
		await expect(page.locator('[data-qm-field]').first()).toBeVisible();
	});

	test('(a) the preview rests clean — no box draws ink until an address moves', async ({
		page
	}) => {
		const all = await page.evaluate(() =>
			Array.from(document.querySelectorAll<HTMLElement>('[data-qm-field]')).map((el) => {
				const cs = getComputedStyle(el);
				return {
					border: cs.borderTopWidth,
					opacity: cs.opacity,
					running: el.getAnimations().length
				};
			})
		);
		expect(all.length).toBeGreaterThan(0);
		for (const b of all) {
			expect(b.border).toBe('0px');
			expect(b.opacity).toBe('0');
			expect(b.running).toBe(0);
		}
	});

	test('(b) editor → preview: a field blooms on arrival and decays back to nothing', async ({
		page
	}) => {
		await pm(page, 'prose-main-body').click();

		// It runs, and it is actually PAINTED — a wash animating at opacity 0 would
		// satisfy an animation count and answer nothing. Opacity is polled rather than
		// read after a separate wait, because the peak is a window: a round-trip spent
		// confirming the animation exists is a round-trip of decay.
		await expect
			.poll(async () => (await boxes(page, 'main.body'))[0]?.opacity ?? 0, { timeout: 2000 })
			.toBeGreaterThan(0.5);

		// And it ends: WAAPI drops a finished animation, and the box is back to the
		// resting state (a). Nothing needs to clear it — that is the point.
		await expect
			.poll(async () => (await boxes(page, 'main.body'))[0]?.running, { timeout: 4000 })
			.toBe(0);
		const rested = (await boxes(page, 'main.body'))[0];
		expect(rested.opacity).toBe(0);
		expect(rested.borderWidth).toBe('0px');
	});

	test('(c) a field with several boxes blooms them in step', async ({ page }) => {
		// `main.subject` surfaces two boxes on the reference memo.
		await pm(page, 'prose-main-subject').click();
		await expect.poll(async () => (await boxes(page, 'main.subject')).length).toBeGreaterThan(1);
		const offsets = (await boxes(page, 'main.subject')).map((b) => b.offset);
		expect(Math.max(...offsets) - Math.min(...offsets)).toBeLessThan(20);
	});

	test('(d) typing does not re-bloom the field being typed into', async ({ page }) => {
		await pm(page, 'prose-main-body').click();
		await expect
			.poll(async () => (await boxes(page, 'main.body'))[0]?.running, { timeout: 2000 })
			.toBe(1);

		// A keystroke moves the caret (so `focusPosition` fires) AND schedules the
		// debounced recompile that rebuilds every box 120ms later. Neither may restart
		// the wash: the address did not change, and a rebuilt box RESUMES. A restart
		// would read as a highlight that re-blooms on every keystroke burst.
		await page.keyboard.type('probe');
		await page.waitForTimeout(400);
		const after = (await boxes(page, 'main.body'))[0];
		if (after.running) expect(after.offset).toBeGreaterThan(300);
	});

	test('(e) preview → editor: the landing leaf is revealed and blooms', async ({ page }) => {
		// `main.subject` sits inside the collapsed ADDRESSING group, so this is also
		// the reveal case: without it the caret — and the cue — land in a panel
		// clipped to zero height.
		const group = page.getByTestId('group-main-addressing');
		await expect(group).toHaveAttribute('aria-expanded', 'false');

		const rect = await page.locator('[data-qm-field="main.subject"]').first().boundingBox();
		if (!rect) throw new Error('subject overlay box has no bounding box');
		await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);

		await expect(group).toHaveAttribute('aria-expanded', 'true');
		const leaf = page.locator('[data-leaf-key="main:subject"]');
		await expect(leaf).toBeInViewport();

		// The wash is a transient child over the leaf, and it removes itself.
		const wash = leaf.locator('.qm-bloom');
		await expect(wash).toBeVisible();
		expect(await wash.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.5);
		await expect(wash).toHaveCount(0, { timeout: 4000 });
	});
});
