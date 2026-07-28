import { test, expect, type Page } from '@playwright/test';
import { pm, openPlayground, clickFieldBox } from './support.js';

// Browser tier: the editor↔preview address is marked as an EVENT and
// the preview rests clean. The unit tier reaches the control flow around the wash
// (tests/preview/overlay.test.ts, with a stubbed `animate` — jsdom has no WAAPI);
// what only a real browser answers is whether the wash RUNS — real keyframes, real
// `color-mix`, real compositing over the page canvas — and whether the landing is
// visible at all, which turns on layout the DOM alone does not report: a collapsed
// accordion group clips its panel to zero height while its children keep their
// intrinsic boxes.
//
// Scope is that boundary, deliberately. Whether several boxes share a start time and
// whether a rebuild resumes rather than restarts are decided in JS, so they are pinned
// deterministically in the unit tier; restating them here would buy a slower, timing-
// dependent copy of an answer already held.

/** Every field box for `field` (or every box, when `field` is omitted). */
async function boxes(page: Page, field?: string) {
	return page.evaluate((f) => {
		const sel = f ? `[data-qm-field="${f}"]` : '[data-qm-field]';
		return Array.from(document.querySelectorAll<HTMLElement>(sel)).map((el) => ({
			opacity: Number(getComputedStyle(el).opacity),
			borderWidth: getComputedStyle(el).borderTopWidth,
			running: el.getAnimations().length
		}));
	}, field);
}

test.describe('correlation bloom', () => {
	test.beforeEach(async ({ page }) => {
		await openPlayground(page, '/editor');
		await expect(page.locator('[data-qm-field]').first()).toBeVisible();
	});

	test('(a) the preview rests clean — no box draws ink until an address moves', async ({
		page
	}) => {
		const all = await boxes(page);
		expect(all.length).toBeGreaterThan(0);
		for (const b of all) {
			expect(b.borderWidth).toBe('0px');
			expect(b.opacity).toBe(0);
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

	test('(c) preview → editor: the landing leaf is revealed and blooms', async ({ page }) => {
		// `main.subject` sits inside the collapsed ADDRESSING group, so this is also
		// the reveal case: without it the caret — and the cue — land in a panel
		// clipped to zero height.
		const group = page.getByTestId('group-main-addressing');
		await expect(group).toHaveAttribute('aria-expanded', 'false');

		await clickFieldBox(page, 'main.subject');

		await expect(group).toHaveAttribute('aria-expanded', 'true');
		const leaf = page.locator('[data-leaf-key="main:subject"]');
		await expect(leaf).toBeInViewport();

		// The wash is a transient child over the leaf, and it removes itself.
		const wash = leaf.locator('.qm-bloom');
		await expect(wash).toBeVisible();
		expect(await wash.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.5);
		await expect(wash).toHaveCount(0, { timeout: 4000 });
	});

	test('(d) a second landing on the same leaf reuses its wash, never stacks one', async ({
		page
	}) => {
		await clickFieldBox(page, 'main.subject');
		const wash = page.locator('[data-leaf-key="main:subject"] .qm-bloom');
		await expect(wash).toHaveCount(1);
		await clickFieldBox(page, 'main.subject');
		await expect(wash).toHaveCount(1);
	});

	test('(e) reduced motion holds the wash and cuts, with no ramps to track', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await pm(page, 'prose-main-body').click();

		const timing = async () =>
			page
				.locator('[data-qm-field="main.body"]')
				.first()
				.evaluate((el) => {
					const effect = el.getAnimations()[0]?.effect as KeyframeEffect | undefined;
					return {
						opacity: Number(getComputedStyle(el).opacity),
						duration: (effect?.getTiming().duration as number) ?? null,
						frames: effect?.getKeyframes().length ?? null
					};
				});
		// The reduced form is a two-frame hold at full on the `slow` rung, not the
		// four-frame rise/hold/decay on `linger`.
		await expect.poll(async () => (await timing()).opacity, { timeout: 2000 }).toBe(1);
		const t = await timing();
		expect(t.frames).toBe(2);
		expect(t.duration).toBeLessThan(1100);

		// It still ends at nothing — the degradation drops the ramps, not the decay.
		await expect.poll(async () => (await timing()).opacity, { timeout: 3000 }).toBe(0);
	});
});
