import { test, expect, type Page } from '@playwright/test';

// Phase 4 exit criteria (browser tier): the /visual playground mounts
// <VisualEditor> over a freshly seeded usaf_memo document (one indorsement card).
// Each assertion checks the DOC STATE via the `doc-json` dump — proving a commit
// LANDED in the Document, not merely that the DOM changed. A fresh seed loads on
// every navigation, so tests are independent.

interface Dump {
	subject: string;
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

test.describe('visual editor', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/visual');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });
	});

	test('(a) typing the inline `subject` prose leaf updates the stored field', async ({ page }) => {
		await replaceProse(page, 'prose-main-subject', 'NEWSUBJECT');
		await expect.poll(async () => (await readDump(page)).subject).toBe('NEWSUBJECT');
		// The editor emitted the active address for the preview bridge.
		await expect(page.getByTestId('active-addr')).toContainText('"field":"subject"');
	});

	test('(b) editing the body prose commits to the main body', async ({ page }) => {
		const before = (await readDump(page)).body;
		const el = pm(page, 'prose-main-body');
		await el.click();
		await page.keyboard.type('ZZTOP ');
		await expect.poll(async () => (await readDump(page)).body).not.toBe(before);
		await expect.poll(async () => (await readDump(page)).body).toContain('ZZTOP');
	});

	test('(c) changing enums (classification, letterhead_seal) commits', async ({ page }) => {
		await page.getByTestId('main-classification').selectOption('CUI');
		await expect.poll(async () => (await readDump(page)).classification).toBe('CUI');
		await page.getByTestId('main-letterhead_seal').selectOption('dod');
		await expect.poll(async () => (await readDump(page)).letterhead_seal).toBe('dod');
	});

	test('(d) editing a number (font_size) and a date (date) commits', async ({ page }) => {
		// Number/date commit at `change` (blur/Enter), not per keystroke (issue #13) —
		// so the assertion follows a blur, mirroring a real settle.
		await page.getByTestId('main-font_size').fill('14.5');
		await page.getByTestId('main-font_size').blur();
		await expect.poll(async () => (await readDump(page)).font_size).toBe(14.5);
		await page.getByTestId('main-date').fill('2026-03-04');
		await page.getByTestId('main-date').blur();
		await expect.poll(async () => (await readDump(page)).date).toBe('2026-03-04');
	});

	test('(d2) clearing a number / date UNSETS the field — removed, not held (issue #12)', async ({
		page
	}) => {
		// Author, then clear: the field is REMOVED, so `doc.get` reads absent and the
		// dump is null — NOT the last committed value the old blank-commits-nothing
		// path stranded it on. The engine then resolves the ghosted `default:`.
		await page.getByTestId('main-font_size').fill('14.5');
		await page.getByTestId('main-font_size').blur();
		await expect.poll(async () => (await readDump(page)).font_size).toBe(14.5);
		await page.getByTestId('main-font_size').fill('');
		await page.getByTestId('main-font_size').blur();
		await expect.poll(async () => (await readDump(page)).font_size).toBeNull();

		await page.getByTestId('main-date').fill('2026-03-04');
		await page.getByTestId('main-date').blur();
		await expect.poll(async () => (await readDump(page)).date).toBe('2026-03-04');
		await page.getByTestId('main-date').fill('');
		await page.getByTestId('main-date').blur();
		await expect.poll(async () => (await readDump(page)).date).toBeNull();
	});

	test('(d3) an enum unsets via the ghost sentinel; picking the default VALUE writes it (issue #21a)', async ({
		page
	}) => {
		// Author a value, then pick the ghost sentinel (always the first option) →
		// the field is UNSET (null), the "clear back to default" affordance.
		await page.getByTestId('main-classification').selectOption('CUI');
		await expect.poll(async () => (await readDump(page)).classification).toBe('CUI');
		await page.getByTestId('main-classification').selectOption({ index: 0 });
		await expect.poll(async () => (await readDump(page)).classification).toBeNull();
		// Explicitly picking the default value ('' — a real enum member here) is a
		// GENUINE write, distinct from unset: authored-default ('') vs null.
		await page.getByTestId('main-classification').selectOption('');
		await expect.poll(async () => (await readDump(page)).classification).toBe('');
	});

	test('(e1) editing, adding, and removing an array-of-string (memo_for) commits', async ({
		page
	}) => {
		const initial = (await readDump(page)).memo_for;
		expect(initial.length).toBeGreaterThanOrEqual(2);
		// Edit element 0 (arrays commit by whole-value replace).
		await page.getByTestId('main-memo_for-el-0').fill('EDITED-ORG');
		await expect.poll(async () => (await readDump(page)).memo_for[0]).toBe('EDITED-ORG');
		// Add a row → the array grows by one; fill the new last element.
		await page.getByTestId('main-memo_for-add').click();
		await page.getByTestId(`main-memo_for-el-${initial.length}`).fill('ADDED-ORG');
		await expect.poll(async () => (await readDump(page)).memo_for.at(-1)).toBe('ADDED-ORG');
		// Remove the first row → length returns to initial, element 1 shifts up.
		await page.getByTestId('main-memo_for-remove-0').click();
		await expect.poll(async () => (await readDump(page)).memo_for.length).toBe(initial.length);
		await expect.poll(async () => (await readDump(page)).memo_for[0]).toBe(initial[1]);
	});

	test('(e2) editing an array-of-richtext (references) commits', async ({ page }) => {
		const initial = (await readDump(page)).references;
		expect(initial.length).toBeGreaterThanOrEqual(2);
		// Edit element 0's prose → whole-array replace commit.
		await replaceProse(page, 'main-references-el-0', 'REFERENCE ZERO');
		await expect.poll(async () => (await readDump(page)).references[0]).toBe('REFERENCE ZERO');
		// The other elements are untouched by the single-element replace.
		await expect.poll(async () => (await readDump(page)).references[1]).toBe(initial[1]);
	});

	test('(f) adding an indorsement card makes it appear', async ({ page }) => {
		expect((await readDump(page)).cardCount).toBe(1);
		await page.getByTestId('add-card-1').click();
		await expect.poll(async () => (await readDump(page)).cardCount).toBe(2);
		await expect(page.getByTestId('card-title-1')).toBeVisible();
	});

	test('(g) reordering two cards changes order AND survives a caret/edit (no remount)', async ({
		page
	}) => {
		// Two cards: seed (index 0) + one added (index 1).
		await page.getByTestId('add-card-1').click();
		await expect.poll(async () => (await readDump(page)).cardCount).toBe(2);

		// Edit card 0's body and stamp its leaf element by STABLE key (survives reorder).
		const leafKey = await page.getByTestId('prose-card0-body').getAttribute('data-leaf-key');
		expect(leafKey).toBeTruthy();
		await pm(page, 'prose-card0-body').click();
		await page.keyboard.type('SURVIVE');
		await expect.poll(async () => (await readDump(page)).cards[0].body).toBe('SURVIVE');
		await page.evaluate((k) => {
			const el = document.querySelector(`[data-leaf-key="${k}"]`) as HTMLElement & {
				__survived?: boolean;
			};
			if (el) el.__survived = true;
		}, leafKey);

		// Move card 0 down → the edited card is now index 1, carrying its body.
		await page.getByTestId('card-0-down').click();
		await expect.poll(async () => (await readDump(page)).cards[1].body).toBe('SURVIVE');
		await expect.poll(async () => (await readDump(page)).cards[0].body).toBe('');

		// The stamped leaf element still exists (was NOT remounted by the reorder).
		const survived = await page.evaluate((k) => {
			const el = document.querySelector(`[data-leaf-key="${k}"]`) as HTMLElement & {
				__survived?: boolean;
			};
			return !!el && el.__survived === true;
		}, leafKey);
		expect(survived).toBe(true);
	});

	test('(h) deleting a card removes it', async ({ page }) => {
		await page.getByTestId('add-card-1').click();
		await expect.poll(async () => (await readDump(page)).cardCount).toBe(2);
		await page.getByTestId('card-1-delete').click();
		await expect.poll(async () => (await readDump(page)).cardCount).toBe(1);
	});

	test('(i) retype is wired (degenerate single kind) without error', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(String(e)));
		await page.getByTestId('card-retype-0').click();
		await expect.poll(async () => (await readDump(page)).cards[0].kind).toBe('indorsement');
		expect(errors, errors.join('\n')).toEqual([]);
	});

	test('(j) renaming a card via its title persists $ext.editor.title', async ({ page }) => {
		await page.getByTestId('card-title-0').fill('My Endorsement');
		await expect.poll(async () => (await readDump(page)).cards[0].title).toBe('My Endorsement');
	});
});
