import { test, expect, type Page } from '@playwright/test';

// Phase 4b exit criteria (browser tier): the formatting selection popover and
// diagnostics routing, over the SAME /visual playground e2e/visual.spec.ts uses
// (a freshly seeded usaf_memo document, one indorsement card, per navigation).
// Each assertion checks DOC/DIAGNOSTIC STATE (the `doc-json` dump, or a rendered
// `diag-*` node's presence/text), not just that a button exists.

interface Dump {
	subject: string;
	subjectMarks: { start: number; end: number; type: string }[];
	tag_line: string;
	body: string;
	font_size: number | null;
	classification: string | null;
	letterhead_seal: string | null;
	date: string | null;
	memo_for: string[];
	references: string[];
	cardCount: number;
	cards: { kind: string; title: string | null; from: string | null; body: string }[];
}

async function readDump(page: Page): Promise<Dump> {
	const text = (await page.getByTestId('doc-json').textContent()) ?? '{}';
	return JSON.parse(text) as Dump;
}

/** The contenteditable inside a prose leaf, by its container testid. */
function pm(page: Page, leafTestid: string) {
	return page.locator(`[data-testid="${leafTestid}"] .ProseMirror`);
}

/** Replace a prose leaf's whole content with `text` (select-all + type). */
async function replaceProse(page: Page, leafTestid: string, text: string): Promise<void> {
	const el = pm(page, leafTestid);
	await el.click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type(text);
}

/** Select the whole (single-line) content of a prose leaf. */
async function selectAll(page: Page, leafTestid: string): Promise<void> {
	await pm(page, leafTestid).click();
	await page.keyboard.press('ControlOrMeta+a');
}

test.describe('visual editor chrome — formatting popover', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/visual');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });
	});

	test('(a) a non-empty selection in `subject` raises the popover; bold toggles a strong markOp', async ({
		page
	}) => {
		await replaceProse(page, 'prose-main-subject', 'BOLDWORD');
		await selectAll(page, 'prose-main-subject');

		await expect(page.getByTestId('format-popover')).toBeVisible();
		await page.getByTestId('mark-strong').click();

		await expect
			.poll(async () => (await readDump(page)).subjectMarks)
			.toEqual([{ start: 0, end: 8, type: 'strong' }]);
	});

	test('(b) toggling bold again removes the mark', async ({ page }) => {
		await replaceProse(page, 'prose-main-subject', 'BOLDWORD');
		await selectAll(page, 'prose-main-subject');
		await page.getByTestId('mark-strong').click();
		await expect.poll(async () => (await readDump(page)).subjectMarks).toHaveLength(1);

		// Selection survives the click (mousedown is swallowed) — toggle again.
		await page.getByTestId('mark-strong').click();
		await expect.poll(async () => (await readDump(page)).subjectMarks).toEqual([]);
	});

	test('a mark button shows the active state when the selection already carries it', async ({
		page
	}) => {
		await replaceProse(page, 'prose-main-subject', 'ITALICWORD');
		await selectAll(page, 'prose-main-subject');
		// Gate on the popover settling (its rAF-deferred sync mounts it and sets the
		// active-mark state) before reading a button's class — every sibling test
		// waits for this; skipping it races the sync.
		await expect(page.getByTestId('format-popover')).toBeVisible();
		const em = page.getByTestId('mark-em');
		await expect(em).not.toHaveClass(/active/);
		await em.click();
		await expect(em).toHaveClass(/active/);
	});

	test('clicking a mark button does not steal focus from the editor (selection survives a second click)', async ({
		page
	}) => {
		await replaceProse(page, 'prose-main-subject', 'MULTIMARK');
		await selectAll(page, 'prose-main-subject');
		await page.getByTestId('mark-strong').click();
		// If focus had moved to the button, the popover would have closed
		// (gated on the LEAF's hasFocus()) instead of staying open for a second click.
		await expect(page.getByTestId('format-popover')).toBeVisible();
		await page.getByTestId('mark-em').click();
		await expect
			.poll(async () => (await readDump(page)).subjectMarks.map((m) => m.type).sort())
			.toEqual(['emph', 'strong']);
	});

	test('the popover hides once the selection collapses', async ({ page }) => {
		await replaceProse(page, 'prose-main-subject', 'SOMEWORD');
		await selectAll(page, 'prose-main-subject');
		await expect(page.getByTestId('format-popover')).toBeVisible();
		await page.keyboard.press('ArrowRight'); // collapses the selection
		await expect(page.getByTestId('format-popover')).toBeHidden();
	});

	test('the link button prompts for a URL and toggles a link markOp with that href', async ({
		page
	}) => {
		await replaceProse(page, 'prose-main-subject', 'LINKWORD');
		await selectAll(page, 'prose-main-subject');
		await page.getByTestId('mark-link').click();
		await page.getByTestId('mark-link-input').fill('https://example.com');
		await page.getByTestId('mark-link-apply').click();
		await expect
			.poll(async () => (await readDump(page)).subjectMarks)
			.toEqual([{ start: 0, end: 8, type: 'link', url: 'https://example.com' }]);
	});

	test('the anchor button toggles an identity anchor over the selection (issue #43)', async ({
		page
	}) => {
		await replaceProse(page, 'prose-main-subject', 'ANCHORTEST');
		// The popover's raise is rAF-deferred (see FormatPopover §SELECTION
		// OBSERVATION); re-assert the selection until it settles, so this gate never
		// races the sync when the test runs after a heavier sibling.
		await expect(async () => {
			await selectAll(page, 'prose-main-subject');
			await expect(page.getByTestId('format-popover')).toBeVisible({ timeout: 1000 });
		}).toPass({ timeout: 15_000 });
		const anchor = page.getByTestId('mark-anchor');
		await expect(anchor).toBeEnabled();
		const anchors = async () =>
			(await readDump(page)).subjectMarks.filter((m) => m.type === 'anchor');
		// Toggle on: a zero-width identity anchor lands at the selection start.
		await anchor.click();
		await expect.poll(anchors).toHaveLength(1);
		await expect(anchor).toHaveClass(/active/);
		// Toggle off: the selection survives the swallowed mousedown, so a second
		// click removes the anchor it now covers.
		await anchor.click();
		await expect.poll(anchors).toHaveLength(0);
	});

	test('clicking back into the editor while the popover is open still moves the caret (no focus trap)', async ({
		page
	}) => {
		await replaceProse(page, 'prose-main-subject', 'CLICKBACK');
		await selectAll(page, 'prose-main-subject');
		await expect(page.getByTestId('format-popover')).toBeVisible();
		// Click at the start of the leaf's text — collapses the selection there.
		await pm(page, 'prose-main-subject').click({ position: { x: 2, y: 5 } });
		await page.keyboard.type('X');
		await expect.poll(async () => (await readDump(page)).subject).toContain('X');
	});

	// Clicking a native input below the fold while the popover holds a prose
	// selection must not move the viewport: returning focus to the leaf would
	// re-assert the retained selection and scroll it back into view.
	test('select-then-click a distant native input does not scroll back to the selection', async ({
		page
	}) => {
		// Seed has one card; pad to six so a far card-title sits well below the fold.
		for (let i = 0; i < 5; i++) {
			await page.getByTestId(`add-card-${i + 1}`).click();
		}
		await expect.poll(async () => (await readDump(page)).cardCount).toBe(6);

		await replaceProse(page, 'prose-main-body', 'SELECTION ANCHOR');
		await selectAll(page, 'prose-main-body');
		await expect(page.getByTestId('format-popover')).toBeVisible();

		const target = page.getByTestId('card-title-5');
		await target.scrollIntoViewIfNeeded();
		const scrollBefore = await page.evaluate(() => window.scrollY);
		expect(scrollBefore).toBeGreaterThan(500); // below the Body fold

		await target.click();

		const after = await page.evaluate(() => ({
			scrollY: window.scrollY,
			activeTestId: (document.activeElement as HTMLElement | null)?.dataset?.testid ?? null
		}));
		expect(Math.abs(after.scrollY - scrollBefore)).toBeLessThan(50);
		expect(after.activeTestId).toBe('card-title-5');
	});
});

test.describe('visual editor chrome — polish (issue #58)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/visual');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });
	});

	const opacityOf = (page: Page, testid: string) =>
		page.getByTestId(testid).evaluate((el) => getComputedStyle(el).opacity);

	// SURFACES §Focus — the scalar controls draw ONE themed ring, and they draw it
	// because they opt into one rule (`.qm-focus-ring`, controls.css), not because
	// each restates the declarations. Only a browser can check this: `outline` is
	// computed style, and three of these controls are bits-ui primitives whose
	// element the component never writes. If a control drops the marker class, or a
	// future one hand-rolls its own ring, the triples stop agreeing here.
	test('(§Focus) every scalar control draws the same themed focus ring', async ({ page }) => {
		// Establish keyboard modality first — `:focus-visible` is modality-gated on a
		// button, so a programmatic focus after a pointer-only session would not match.
		await page.keyboard.press('Tab');

		/** Focus `focusOn`, then read the computed outline of the element that RINGS. */
		const ringOf = async (focusOn: string, ringOn = focusOn) => {
			await page.locator(focusOn).first().focus();
			return page
				.locator(ringOn)
				.first()
				.evaluate((el) => {
					const s = getComputedStyle(el);
					return `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`;
				});
		};

		const rings = {
			// A plain input, and the same recipe on the numeric entry.
			text: await ringOf('[data-testid="main-letterhead_title"]'),
			number: await ringOf('[data-testid="main-font_size"]'),
			// A bits-ui trigger — its element is the primitive's, not the component's.
			enum: await ringOf('[data-testid="main-classification"]'),
			// The date field is the one that rings a DIFFERENT element than the one
			// focus lands on: focus goes to a segment, the ring to the field around it
			// (`:focus-within`), so the ring does not flicker as the caret walks the
			// segments. The value it draws must still be the same one.
			date: await ringOf('[data-testid="main-date"] [data-segment="month"]', '.qm-date')
		};

		// A real ring, not the UA default and not nothing.
		expect(rings.text).toMatch(/^solid 2px rgb\(/);
		// …and one ring: every control reports the identical computed triple.
		expect(Object.values(rings)).toEqual(Array(4).fill(rings.text));
	});

	// §6 — the add triggers recede: invisible at rest, one dim label on the last gap,
	// and they reveal on hover. Opacity (not display) so clicks still land.
	test('(§6) add triggers recede at rest; only the last shows a dim label; hover reveals', async ({
		page
	}) => {
		expect((await readDump(page)).cardCount).toBe(1); // one interior gap + the last gap
		expect(await opacityOf(page, 'add-card-0')).toBe('0'); // interior: invisible at rest
		expect(await opacityOf(page, 'add-card-1')).toBe('0.35'); // last: dim, always visible
		await page.getByTestId('add-card-0').hover();
		await expect.poll(() => opacityOf(page, 'add-card-0')).toBe('1');
	});

	// §8 — focusing the title selects all, so typing replaces it rather than appending.
	test('(§8) focusing the title selects all so a keystroke replaces the whole title', async ({
		page
	}) => {
		await page.getByTestId('card-title-0').fill('Base Title');
		await expect.poll(async () => (await readDump(page)).cards[0].title).toBe('Base Title');
		await page.getByTestId('card-title-0').blur(); // fill left it focused — reset for a real entry
		await page.getByTestId('card-title-0').focus(); // entry → select-all (no mouse caret)
		await page.keyboard.type('Z');
		await expect.poll(async () => (await readDump(page)).cards[0].title).toBe('Z');
	});

	// §8 — Escape rolls the live edits back to the value the title held on entry.
	test('(§8) Escape reverts an in-progress title edit to the pre-edit value', async ({ page }) => {
		await page.getByTestId('card-title-0').fill('Keep Me');
		await expect.poll(async () => (await readDump(page)).cards[0].title).toBe('Keep Me');
		await page.getByTestId('card-title-0').blur(); // fill left it focused — reset for a real entry
		await page.getByTestId('card-title-0').focus(); // captures the revert baseline + select-all
		await page.keyboard.type('scratch'); // select-all replace → live-commits 'scratch'
		await expect.poll(async () => (await readDump(page)).cards[0].title).toBe('scratch');
		await page.keyboard.press('Escape');
		await expect.poll(async () => (await readDump(page)).cards[0].title).toBe('Keep Me');
	});

	// §8 — the title is an autosize sizer that grows with its content, not a fixed box.
	test('(§8) the title width tracks its content via the hidden sizer', async ({ page }) => {
		const width = () =>
			page
				.getByTestId('card-title-0')
				.evaluate((el) => (el as HTMLElement).getBoundingClientRect().width);
		await page.getByTestId('card-title-0').fill('Ab');
		const short = await width();
		await page.getByTestId('card-title-0').fill('Abcdefghijklmnop');
		expect(await width()).toBeGreaterThan(short);
	});
});

test.describe('visual editor chrome — diagnostics routing', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/visual');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });
	});

	test('(c) an invalid font_size entry surfaces an inline diagnostic, does not crash, and does not commit', async ({
		page
	}) => {
		const pageErrors: string[] = [];
		page.on('pageerror', (e) => pageErrors.push(String(e)));
		const before = (await readDump(page)).font_size;

		// Commit is at `change` (issue #13) — blur to settle the bad entry so the
		// boundary judges it and the coercion diagnostic surfaces.
		await page.getByTestId('main-font_size').fill('abc');
		await page.getByTestId('main-font_size').blur();
		await expect(page.getByTestId('diag-main-font_size')).toBeVisible();
		await expect(page.getByTestId('diag-main-font_size')).toContainText('font_size');

		// The bad value never landed in the document.
		expect((await readDump(page)).font_size).toBe(before);
		expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	});

	test('a subsequent valid commit clears the commit-error diagnostic', async ({ page }) => {
		await page.getByTestId('main-font_size').fill('abc');
		await page.getByTestId('main-font_size').blur();
		await expect(page.getByTestId('diag-main-font_size')).toBeVisible();

		await page.getByTestId('main-font_size').fill('16');
		await page.getByTestId('main-font_size').blur();
		await expect.poll(async () => (await readDump(page)).font_size).toBe(16);
		await expect(page.getByTestId('diag-main-font_size')).toBeHidden();
	});

	test('the app keeps working after a coercion error (non-gating)', async ({ page }) => {
		await page.getByTestId('main-font_size').fill('not-a-number');
		await page.getByTestId('main-font_size').blur();
		await expect(page.getByTestId('diag-main-font_size')).toBeVisible();
		// Editing elsewhere still works — nothing gates.
		await replaceProse(page, 'prose-main-subject', 'STILLWORKS');
		await expect.poll(async () => (await readDump(page)).subject).toBe('STILLWORKS');
	});

	test('(d) an externally supplied diagnostic renders against its main field and its card field', async ({
		page
	}) => {
		expect((await readDump(page)).cards[0]?.kind).toBe('indorsement');
		await page.getByTestId('inject-diagnostics').click();

		await expect(page.getByTestId('diag-main-subject')).toBeVisible();
		await expect(page.getByTestId('diag-main-subject')).toContainText(
			'External test warning on subject'
		);

		await expect(page.getByTestId('diag-card0-from')).toBeVisible();
		await expect(page.getByTestId('diag-card0-from')).toContainText(
			'External test error on indorsement 0 from'
		);
	});
});
