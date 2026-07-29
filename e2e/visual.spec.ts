import { test, expect, type Page } from '@playwright/test';
import { pm, replaceProse, reveal } from './support.js';

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
 * Pick an enum option. The control is a bits-ui listbox, not a
 * native `<select>`, so `selectOption` does not apply: open the trigger, then
 * click the option by its `data-value` — the same value-keyed targeting the old
 * `selectOption(value)` did.
 */
async function pickEnum(page: Page, testid: string, value: string): Promise<void> {
	await reveal(page, testid);
	await page.getByTestId(testid).click();
	await page.locator(`[role="listbox"] [data-value="${value}"]`).click();
}

/** Open an enum's listbox and return a locator over one option, for state assertions. */
async function openEnum(page: Page, testid: string) {
	await reveal(page, testid);
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
	await reveal(page, testid);
	await dateEntry(page, testid).click();
	await page.keyboard.type(`${m}${d}${y}`);
}

/**
 * Empty the month segment — Backspace is the primitive's clear key, and one
 * incomplete segment makes the whole date `undefined`, which is the unset rung.
 */
async function clearDate(page: Page, testid: string): Promise<void> {
	await reveal(page, testid);
	await dateEntry(page, testid).click();
	await page.keyboard.press('Backspace');
	await page.keyboard.press('Backspace');
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

	test('(a2) a no-default field shows a required marker; a defaulted field does not', async ({
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

	test('(c2) a consumer enum policy DISABLES a forbidden option without mutating a stored value', async ({
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
		// Number/date commit at `change` (blur/Enter), not per keystroke —
		// so the assertion follows a blur, mirroring a real settle.
		await reveal(page, 'main-font_size');
		await page.getByTestId('main-font_size').fill('14.5');
		await page.getByTestId('main-font_size').blur();
		await expect.poll(async () => (await readDump(page)).font_size).toBe(14.5);
		// The date control is segmented and commits as soon as the
		// segments form a complete date — there is no blur-to-settle step.
		await setDate(page, 'main-date', '2026-03-04');
		await expect.poll(async () => (await readDump(page)).date).toBe('2026-03-04');
	});

	test('(d2) clearing a number / date UNSETS the field — removed, not held', async ({ page }) => {
		// Author, then clear: the field is REMOVED, so `doc.get` reads absent and the
		// dump is null (not the last committed value) — the engine resolves the
		// ghosted `default:` at render.
		await reveal(page, 'main-font_size');
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

	test('(d2b) an unset date ghosts its `default:`, not the format hint', async ({ page }) => {
		// The reference quill's `date` declares a BLANK default (blank → today at
		// render), which ghosts nothing — `?dateDefault` rewrites that one schema line
		// so the rung exists to assert (src/routes/fixture.ts).
		await page.goto('/visual?dateDefault=2026-01-01');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });

		await reveal(page, 'main-date');
		const field = page.getByTestId('main-date');
		const year = field.locator('[data-segment="year"]');
		const month = field.locator('[data-segment="month"]');
		const ink = async (l: Locator) => l.evaluate((e) => getComputedStyle(e).color);

		await expect(field).toHaveAttribute('data-ghosted', '');
		// The segments carry the DEFAULT's digits, not `mm`/`dd`/`yyyy`.
		await expect(year).toHaveText('2026');
		await expect(month).toHaveText('01');
		// …and carry them in the GHOST TONE, asserted as a colour rather than an
		// attribute: the tone IS the rung — the same digits at full ink read as an
		// authored date — and a marker alone does not prove a rule matched it.
		const ghostInk = await ink(year);
		// Shown, never written: the ghost is not a value.
		expect((await readDump(page)).date).toBeNull();

		// A half-entered date keeps the digits just typed, at FULL ink — the ghost
		// fills only the segments still empty, though the field is unset until they
		// all fill.
		await dateEntry(page, 'main-date').click();
		await page.keyboard.type('03');
		await expect(month).toHaveText('03');
		expect(await ink(month), 'a typed segment').not.toBe(ghostInk);
		await expect(year).toHaveText('2026');
		expect(await ink(year), 'a still-ghosted segment').toBe(ghostInk);
		expect((await readDump(page)).date).toBeNull();

		// Authoring drops the ghost, tone included; clearing back to unset restores it.
		await setDate(page, 'main-date', '2026-03-04');
		await expect.poll(async () => (await readDump(page)).date).toBe('2026-03-04');
		await expect(field).not.toHaveAttribute('data-ghosted', '');
		expect(await ink(year), 'an authored year').not.toBe(ghostInk);
		await clearDate(page, 'main-date');
		await expect.poll(async () => (await readDump(page)).date).toBeNull();
		await expect(field).toHaveAttribute('data-ghosted', '');
		await expect(year).toHaveText('2026');
		expect(await ink(year), 'the restored ghost').toBe(ghostInk);
	});

	test('(d3) an enum unsets via the ghost sentinel; picking the default VALUE writes it', async ({
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
		await reveal(page, 'main-memo_for-el-0');
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

	// The array's keyboard contract (VISUAL_EDITOR_UIUX §Fields). The browser tier is
	// where it is provable at all: the keys ride the element control's own keydown, the
	// focus that follows lands after a flush the array cannot observe, and every step
	// asserts the Document rather than the DOM.
	test('(e3) Enter inserts a sibling mid-array; Backspace on an empty element removes it', async ({
		page
	}) => {
		const initial = (await readDump(page)).memo_for;
		expect(initial.length).toBeGreaterThanOrEqual(2);
		await reveal(page, 'main-memo_for-el-0');

		// Enter on element 0 opens a sibling BELOW it — mid-array, not at the end — and
		// takes the caret there, so the next keystroke is the new element's value.
		await page.getByTestId('main-memo_for-el-0').click();
		await page.keyboard.press('Enter');
		await expect(page.getByTestId('main-memo_for-el-1')).toBeFocused();
		await page.keyboard.type('INSERTED');
		await expect
			.poll(async () => (await readDump(page)).memo_for)
			.toEqual([initial[0], 'INSERTED', ...initial.slice(1)]);

		// A HELD Backspace runs on past the character that empties an element; the
		// repeats are ignored, so clearing a value never also destroys its row.
		await page.keyboard.press('ControlOrMeta+a');
		for (let i = 0; i < 12; i++) await page.keyboard.down('Backspace');
		await page.keyboard.up('Backspace');
		await expect(page.getByTestId('main-memo_for-el-1')).toBeFocused();
		await expect(page.getByTestId(`main-memo_for-el-${initial.length}`)).toHaveCount(1);

		// A deliberate press on the now-empty element removes it, and the caret falls to
		// the element above.
		await page.keyboard.press('Backspace');
		await expect.poll(async () => (await readDump(page)).memo_for).toEqual(initial);
		await expect(page.getByTestId('main-memo_for-el-0')).toBeFocused();

		// Emptied all the way down, the list hands focus to the add affordance — the only
		// thing left to hold it — and a press there re-opens the list at one element.
		for (let n = initial.length; n > 0; n--) {
			await page.keyboard.press('ControlOrMeta+a');
			await page.keyboard.press('Backspace');
			await page.keyboard.press('Backspace');
			await expect.poll(async () => (await readDump(page)).memo_for.length).toBe(n - 1);
		}
		await expect(page.getByTestId('main-memo_for-add')).toBeFocused();
		await page.keyboard.press('Enter');
		await expect(page.getByTestId('main-memo_for-el-0')).toBeFocused();
		await page.keyboard.type('REOPENED');
		await expect.poll(async () => (await readDump(page)).memo_for).toEqual(['REOPENED']);
	});

	test('(e4) a mid-array insert moves the prose elements below it without remounting them', async ({
		page
	}) => {
		const initial = (await readDump(page)).references;
		expect(initial.length).toBeGreaterThanOrEqual(2);
		await reveal(page, 'main-references-el-0');
		// Stamp element 1's view. Ids splice with the values, so the insert above it
		// carries it down a row — a remount would lose both the stamp and a live caret.
		await page
			.getByTestId('main-references-el-1')
			.evaluate((el: HTMLElement & { __survived?: boolean }) => (el.__survived = true));

		await pm(page, 'main-references-el-0').click();
		await page.keyboard.press('Enter');
		await page.keyboard.type('NEW REFERENCE');
		await expect
			.poll(async () => (await readDump(page)).references)
			.toEqual([initial[0], 'NEW REFERENCE', ...initial.slice(1)]);
		await expect(page.getByTestId('main-references-el-2')).toHaveJSProperty('__survived', true);

		// Backspace on an EMPTY prose element removes it — the element's committed
		// `Content`, not an input's value, is what "empty" means here — and the caret
		// falls back to the element above.
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.press('Backspace');
		await expect.poll(async () => (await readDump(page)).references[1]).toBe('');
		await page.keyboard.press('Backspace');
		await expect.poll(async () => (await readDump(page)).references).toEqual(initial);
		await expect(pm(page, 'main-references-el-0')).toBeFocused();
		await expect(page.getByTestId('main-references-el-1')).toHaveJSProperty('__survived', true);
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

	// A kind is chosen at insert and changed only by the recovery shell — test (k) —
	// so no card header offers a retype.
	test('(i) the card header carries no retype control', async ({ page }) => {
		await expect(page.getByTestId('card-retype-0')).toHaveCount(0);
	});

	// The rename target is the header's free width, not the title's text box, which
	// the autosize keeps exactly as wide as its text.
	test('(i2) a press in the header free space enters the rename', async ({ page }) => {
		const title = page.getByTestId('card-title-0');
		const region = page.getByTestId('card-rename-0');
		const box = (await region.boundingBox())!;
		const titleBox = (await title.boundingBox())!;
		// Past the title's right edge — the free width the autosize leaves beside it.
		expect(box.width).toBeGreaterThan(titleBox.width + 8);
		await page.mouse.click(box.x + box.width - 4, box.y + box.height / 2);
		await expect(title).toBeFocused();
		// Entering selects all, so the first keystroke replaces rather than appends.
		await page.keyboard.type('Replaced');
		await expect.poll(async () => (await readDump(page)).cards[0].title).toBe('Replaced');
	});

	test('(j) renaming a card via its title persists $ext.editor.title', async ({ page }) => {
		await page.getByTestId('card-title-0').fill('My Endorsement');
		await expect.poll(async () => (await readDump(page)).cards[0].title).toBe('My Endorsement');
	});

	test('(k) an un-schemable card renders a recovery shell; retype re-projects it', async ({
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

	test('(l) the tips card rotates, renders markdown, and dismissal clears the channel', async ({
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

	test('(m) dismissing tips leaves a renamed card its title', async ({ page }) => {
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

	test('(n) list keys indent, exit, and merge through the real keymap', async ({ page }) => {
		// The browser tier is where key DELIVERY is provable: Tab reaches the leaf
		// rather than moving focus, Shift-Tab survives the modifier, and each press
		// COMMITS (the dump is the Document, not the DOM).
		const el = pm(page, 'prose-main-body');
		await el.click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('- one');
		await page.keyboard.press('Enter');
		await page.keyboard.type('two');
		// Tab indents rather than leaving the leaf — the focus check is the point.
		await page.keyboard.press('Tab');
		await expect(el).toBeFocused();
		await expect.poll(async () => (await readDump(page)).body).toMatch(/one[\s\S]*two/);
		await expect(el.locator('ul ul li')).toHaveText('two');

		// Shift-Tab puts it back at the outer level.
		await page.keyboard.press('Shift+Tab');
		await expect(el.locator('ul ul')).toHaveCount(0);
		await expect(el.locator('ul > li')).toHaveCount(2);

		// Enter opens a third, empty item; Backspace at its start merges it back.
		await page.keyboard.press('Enter');
		await expect(el.locator('ul > li')).toHaveCount(3);
		await page.keyboard.press('Backspace');
		await expect(el.locator('ul > li')).toHaveCount(2);

		// Enter on an empty item exits the list into a paragraph instead of adding
		// a fourth one — two presses: one to open the empty item, one to leave.
		await page.keyboard.press('Enter');
		await page.keyboard.press('Enter');
		await expect(el.locator('ul > li')).toHaveCount(2);
		await expect(el.locator('p:not(li p)')).toHaveCount(1);
	});

	test('(o) code-block keys take literal indentation', async ({ page }) => {
		// Same reason as the list keys: only the browser proves Tab is DELIVERED to
		// the leaf — a swallowed key that still moves focus passes every unit test.
		const el = pm(page, 'prose-main-body');
		await replaceProse(page, 'prose-main-body', '```'); // the fence input rule
		await expect(el.locator('pre')).toHaveCount(1);
		await page.keyboard.type('one');
		// Enter stays INSIDE the block — a second block would be the base keymap's split.
		await page.keyboard.press('Enter');
		await expect(el.locator('pre')).toHaveCount(1);
		// Each step polls the dump before the next press: the caret rides on a
		// committed state, and the assertion is the Document rather than the DOM.
		await expect.poll(async () => (await readDump(page)).body).toBe('one\n');

		// Tab indents rather than leaving the leaf — the focus check is the point.
		await page.keyboard.press('Tab');
		await expect(el).toBeFocused();
		await expect.poll(async () => (await readDump(page)).body).toBe('one\n  ');
		await page.keyboard.type('two');
		await expect.poll(async () => (await readDump(page)).body).toBe('one\n  two');

		// Shift-Tab survives the modifier and takes the indent back.
		await page.keyboard.press('Shift+Tab');
		await expect.poll(async () => (await readDump(page)).body).toBe('one\ntwo');
	});

	// An insert past the fold moves the viewport to the new card, so the click is
	// never silent.
	test('(p) a newly added card is scrolled into view', async ({ page }) => {
		// Fill well past the viewport so the last insert point is genuinely off-screen.
		for (let n = 1; n <= 4; n++) {
			await page.getByTestId(`add-card-${n}`).click();
			await expect.poll(async () => (await readDump(page)).cardCount).toBe(n + 1);
		}
		await page.evaluate(() => window.scrollTo(0, 0));
		await expect(page.getByTestId('card-title-4')).not.toBeInViewport();

		// `dispatchEvent` clicks WITHOUT Playwright's auto-scroll, so the insert really
		// happens off-screen — the case the scroll exists for.
		await page.getByTestId('add-card-5').dispatchEvent('click');
		await expect.poll(async () => (await readDump(page)).cardCount).toBe(6);
		await expect(page.getByTestId('card-title-5')).toBeInViewport();
	});

	// The empty body's ghost. Asserted through the DECORATION, never the dump: a
	// ghost that reached the document would be the bug this guards against, so each
	// case checks the rendered attribute AND that `body` stayed empty.
	const ghost = (page: Page, testid: string) =>
		page.locator(`[data-testid="${testid}"] .qm-prose-placeholder`);

	test('(q) a freshly added card ghosts the built-in invitation, writing nothing', async ({
		page
	}) => {
		await page.getByTestId('add-card-1').click();
		await expect.poll(async () => (await readDump(page)).cardCount).toBe(2);

		// The reference quill declares no body `default:`, so this is the fallback.
		await expect(ghost(page, 'prose-card1-body')).toHaveAttribute('data-placeholder', 'Write…');
		expect((await readDump(page)).cards[1].body).toBe('');

		// It is a ghost, not content: typing replaces it and leaves nothing behind.
		await pm(page, 'prose-card1-body').click();
		await page.keyboard.type('AUTHORED');
		await expect.poll(async () => (await readDump(page)).cards[1].body).toBe('AUTHORED');
		await expect(ghost(page, 'prose-card1-body')).toHaveCount(0);
	});

	test('(r) a consumer hook words every empty body, and sampling does not re-roll', async ({
		page
	}) => {
		await page.getByTestId('add-card-1').click();
		await page.getByTestId('add-card-2').click();
		await expect.poll(async () => (await readDump(page)).cardCount).toBe(3);

		// The playground's hook samples at random and is a fresh closure per derive —
		// the worst case for stability, and the one the per-kind cache exists for.
		await page.getByTestId('toggle-body-placeholder').click();

		const read = async (t: string) => await ghost(page, t).getAttribute('data-placeholder');
		await expect.poll(async () => await read('prose-card1-body')).not.toBe('Write…');

		const first = await read('prose-card1-body');
		// Two cards of ONE kind are one invitation — the property a per-mount re-roll
		// breaks, and the reason the answer is cached by kind.
		expect(await read('prose-card2-body')).toBe(first);

		// A re-derive must not re-roll it. Editing another card's body bumps the model
		// without remounting these leaves.
		await pm(page, 'prose-main-body').click();
		await page.keyboard.type('X');
		await expect.poll(async () => (await readDump(page)).body).toContain('X');
		expect(await read('prose-card1-body')).toBe(first);
		expect(await read('prose-card2-body')).toBe(first);

		// Still only chrome: no hook wording reached any card's stored body.
		const dump = await readDump(page);
		expect(dump.cards.map((c) => c.body)).toEqual(['', '', '']);
	});
});
