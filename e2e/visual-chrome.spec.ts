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

	test('the anchor button is present but disabled (deferred codec seam)', async ({ page }) => {
		await replaceProse(page, 'prose-main-subject', 'ANCHORTEST');
		await selectAll(page, 'prose-main-subject');
		await expect(page.getByTestId('format-popover')).toBeVisible();
		await expect(page.getByTestId('mark-anchor')).toBeDisabled();
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

		await page.getByTestId('main-font_size').fill('abc');
		await expect(page.getByTestId('diag-main-font_size')).toBeVisible();
		await expect(page.getByTestId('diag-main-font_size')).toContainText('font_size');

		// The bad value never landed in the document.
		expect((await readDump(page)).font_size).toBe(before);
		expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	});

	test('a subsequent valid commit clears the commit-error diagnostic', async ({ page }) => {
		await page.getByTestId('main-font_size').fill('abc');
		await expect(page.getByTestId('diag-main-font_size')).toBeVisible();

		await page.getByTestId('main-font_size').fill('16');
		await expect.poll(async () => (await readDump(page)).font_size).toBe(16);
		await expect(page.getByTestId('diag-main-font_size')).toBeHidden();
	});

	test('the app keeps working after a coercion error (non-gating)', async ({ page }) => {
		await page.getByTestId('main-font_size').fill('not-a-number');
		await expect(page.getByTestId('diag-main-font_size')).toBeVisible();
		// Editing elsewhere still works — nothing gates.
		await replaceProse(page, 'prose-main-subject', 'STILLWORKS');
		await expect.poll(async () => (await readDump(page)).subject).toBe('STILLWORKS');
	});

	test('(d) an externally supplied diagnostic renders against its main field and (best-effort) its card field', async ({
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
