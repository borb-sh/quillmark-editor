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
	mainExtEditor: Record<string, unknown> | null;
	cardCount: number;
	cards: { kind: string; title: string | null; from: string | null; body: string }[];
}

async function readDump(page: Page): Promise<Dump> {
	const text = (await page.getByTestId('doc-json').textContent()) ?? '{}';
	return JSON.parse(text) as Dump;
}

/**
 * Pick an enum option. The control is a bits-ui listbox (issue #79 §3), not a
 * native `<select>`, so `selectOption` does not apply: open the trigger, then
 * click the option by its `data-value` — the same value-keyed targeting the old
 * `selectOption(value)` did.
 */
async function pickEnum(page: Page, testid: string, value: string): Promise<void> {
	await page.getByTestId(testid).click();
	await page.locator(`[role="listbox"] [data-value="${value}"]`).click();
}

/** Open an enum's listbox and return a locator over one option, for state assertions. */
async function openEnum(page: Page, testid: string) {
	await page.getByTestId(testid).click();
	await expect(page.locator('[role="listbox"]')).toBeVisible();
	return (value: string) => page.locator(`[role="listbox"] [data-value="${value}"]`);
}

/** The segmented date control's first segment — the entry point for typing. */
function dateEntry(page: Page, testid: string) {
	return page.locator(`[data-testid="${testid}"] [data-segment="month"]`);
}

/** Type an ISO date into the segments. They advance on fill, so digits run together. */
async function setDate(page: Page, testid: string, iso: string): Promise<void> {
	const [y, m, d] = iso.split('-');
	await dateEntry(page, testid).click();
	await page.keyboard.type(`${m}${d}${y}`);
}

/**
 * Empty the month segment — Backspace is the primitive's clear key, and one
 * incomplete segment makes the whole date `undefined`, which is the unset rung.
 */
async function clearDate(page: Page, testid: string): Promise<void> {
	await dateEntry(page, testid).click();
	await page.keyboard.press('Backspace');
	await page.keyboard.press('Backspace');
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

	test('(a2) a no-default field shows a required marker; a defaulted field does not (issue #75a)', async ({
		page
	}) => {
		// `subject` declares no `default:` (Unendorsed) → a persistent `*`; the marker is
		// present regardless of its accordion group's open state, so assert on DOM count.
		await expect(page.getByTestId('required-main-subject')).toHaveCount(1);
		await expect(page.getByTestId('required-main-subject')).toHaveAttribute(
			'aria-label',
			'required'
		);
		// `letterhead_title` carries a `default:` → not required, no marker.
		await expect(page.getByTestId('required-main-letterhead_title')).toHaveCount(0);
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
		await pickEnum(page, 'main-classification', 'CUI');
		await expect.poll(async () => (await readDump(page)).classification).toBe('CUI');
		await pickEnum(page, 'main-letterhead_seal', 'dod');
		await expect.poll(async () => (await readDump(page)).letterhead_seal).toBe('dod');
	});

	test('(c2) a consumer enum policy DISABLES a forbidden option without mutating a stored value (issue #73)', async ({
		page
	}) => {
		// Author CUI first, then arm the policy that forbids it: the stored value is
		// untouched (still CUI) and the option renders disabled, not stripped.
		await pickEnum(page, 'main-classification', 'CUI');
		await expect.poll(async () => (await readDump(page)).classification).toBe('CUI');
		await page.getByTestId('toggle-enum-policy').click();
		let opt = await openEnum(page, 'main-classification');
		await expect(opt('CUI')).toHaveAttribute('data-disabled', '');
		await expect(opt('UNCLASSIFIED')).not.toHaveAttribute('data-disabled', '');
		await page.keyboard.press('Escape');
		expect((await readDump(page)).classification).toBe('CUI');
		// Disarm: the option is offerable again.
		await page.getByTestId('toggle-enum-policy').click();
		opt = await openEnum(page, 'main-classification');
		await expect(opt('CUI')).not.toHaveAttribute('data-disabled', '');
		await page.keyboard.press('Escape');
	});

	test('(d) editing a number (font_size) and a date (date) commits', async ({ page }) => {
		// Number/date commit at `change` (blur/Enter), not per keystroke (issue #13) —
		// so the assertion follows a blur, mirroring a real settle.
		await page.getByTestId('main-font_size').fill('14.5');
		await page.getByTestId('main-font_size').blur();
		await expect.poll(async () => (await readDump(page)).font_size).toBe(14.5);
		// The date control is segmented (issue #79 §3) and commits as soon as the
		// segments form a complete date — there is no blur-to-settle step.
		await setDate(page, 'main-date', '2026-03-04');
		await expect.poll(async () => (await readDump(page)).date).toBe('2026-03-04');
	});

	test('(d2) clearing a number / date UNSETS the field — removed, not held (issue #12)', async ({
		page
	}) => {
		// Author, then clear: the field is REMOVED, so `doc.get` reads absent and the
		// dump is null (not the last committed value) — the engine resolves the
		// ghosted `default:` at render.
		await page.getByTestId('main-font_size').fill('14.5');
		await page.getByTestId('main-font_size').blur();
		await expect.poll(async () => (await readDump(page)).font_size).toBe(14.5);
		await page.getByTestId('main-font_size').fill('');
		await page.getByTestId('main-font_size').blur();
		await expect.poll(async () => (await readDump(page)).font_size).toBeNull();

		await setDate(page, 'main-date', '2026-03-04');
		await expect.poll(async () => (await readDump(page)).date).toBe('2026-03-04');
		await clearDate(page, 'main-date');
		await expect.poll(async () => (await readDump(page)).date).toBeNull();
	});

	test('(d3) an enum unsets via the ghost sentinel; picking the default VALUE writes it (issue #21a)', async ({
		page
	}) => {
		// Author a value, then pick the ghost sentinel (always the first option) →
		// the field is UNSET (null), the "clear back to default" affordance.
		await pickEnum(page, 'main-classification', 'CUI');
		await expect.poll(async () => (await readDump(page)).classification).toBe('CUI');
		// The sentinel is always the FIRST option — targeted positionally rather than
		// by its internal marker value.
		await page.getByTestId('main-classification').click();
		await page.locator('[role="listbox"] [role="option"]').first().click();
		await expect.poll(async () => (await readDump(page)).classification).toBeNull();
		// Explicitly picking the default value ('' — a real enum member here) is a
		// GENUINE write, distinct from unset: authored-default ('') vs null.
		await pickEnum(page, 'main-classification', '');
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

	test('(k) an un-schemable card renders a recovery shell; retype re-projects it (issue #72)', async ({
		page
	}) => {
		// `?foreign` seeds a card whose kind the schema can't project (see the route).
		await page.goto('/visual?foreign=1');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });

		// The foreign card is VISIBLE as a recovery shell — not dropped, not gated away.
		const recovery = page.locator('[data-testid^="card-recovery-"]');
		await expect(recovery).toHaveCount(1);
		await expect(recovery).toContainText('Unrecognized card type');
		await expect(recovery).toContainText('legacy_kind');
		// Its content is still in the Document (the whole point — no data trap).
		const foreign = (await readDump(page)).cards.find((c) => c.kind === 'legacy_kind');
		expect(foreign?.body).toContain('Trapped legacy body');

		// Retype to a declared kind → the shell is gone and the body is preserved under
		// the new kind (setCardKind keeps payload + body).
		await page.locator('[data-testid^="recovery-retype-"]').selectOption('indorsement');
		await expect(page.locator('[data-testid^="card-recovery-"]')).toHaveCount(0);
		await expect
			.poll(async () =>
				(await readDump(page)).cards.some(
					(c) => c.kind === 'indorsement' && c.body.includes('Trapped legacy body')
				)
			)
			.toBe(true);
	});

	test('(l) the tips card rotates, renders markdown, and dismissal clears the channel (issue #71)', async ({
		page
	}) => {
		// `?tips` seeds `$ext.editor.tips` with three tips (see the route) — the
		// channel a quill or consumer supplies; nothing in the schema declares it.
		await page.goto('/visual?tips=1');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });

		const card = page.getByTestId('tips-card');
		await expect(card).toBeVisible();
		await expect(page.getByTestId('tips-count')).toHaveText('1 of 3');
		// Inline markdown, rendered as the body renders it — a `strong` element, not
		// the literal asterisks.
		await expect(page.getByTestId('tips-body').locator('strong')).toHaveText('Tab');

		// Advance: the tip swaps, the count follows, and NOTHING is written — reading
		// a tip must not dirty the document.
		await page.getByTestId('tips-next').click();
		await expect(page.getByTestId('tips-count')).toHaveText('2 of 3');
		await expect(page.getByTestId('tips-body').locator('code')).toHaveText('npm run dev');
		expect((await readDump(page)).mainExtEditor?.tips).toHaveLength(3);

		// Advancing past the last tip clears the channel: the card goes, and the
		// Document — not just the DOM — carries no `tips`.
		await page.getByTestId('tips-next').click();
		await expect(page.getByTestId('tips-count')).toHaveText('3 of 3');
		await page.getByTestId('tips-next').click();
		await expect(card).toHaveCount(0);
		await expect.poll(async () => (await readDump(page)).mainExtEditor?.tips).toBeUndefined();
	});

	test('(m) dismissing tips leaves a renamed card its title (issue #71)', async ({ page }) => {
		// The silent hazard: `tips` and `title` are sibling keys of one `editor`
		// namespace, so a namespace-removing clear would destroy the rename. Only a
		// document carrying BOTH can catch it — so this test makes one.
		await page.goto('/visual?tips=1');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });

		await page.getByTestId('card-title-0').fill('Kept Title');
		await expect.poll(async () => (await readDump(page)).cards[0].title).toBe('Kept Title');

		await page.getByTestId('tips-dismiss').click();
		await expect(page.getByTestId('tips-card')).toHaveCount(0);
		expect((await readDump(page)).cards[0].title).toBe('Kept Title');
	});
});
