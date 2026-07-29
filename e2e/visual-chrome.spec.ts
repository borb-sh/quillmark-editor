import { test, expect, type Page } from '@playwright/test';
import { pm, replaceProse, reveal, selectAndAwaitPopover } from './support.js';

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

test.describe('visual editor chrome — formatting popover', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/visual');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });
	});

	test('(a) a non-empty selection in `subject` raises the popover; bold toggles a strong markOp', async ({
		page
	}) => {
		await replaceProse(page, 'prose-main-subject', 'BOLDWORD');
		// The raise is this test's first claim — the helper gates on it.
		await selectAndAwaitPopover(page, 'prose-main-subject');
		await page.getByTestId('mark-strong').click();

		await expect
			.poll(async () => (await readDump(page)).subjectMarks)
			.toEqual([{ start: 0, end: 8, type: 'strong' }]);
	});

	test('(b) toggling bold again removes the mark', async ({ page }) => {
		await replaceProse(page, 'prose-main-subject', 'BOLDWORD');
		await selectAndAwaitPopover(page, 'prose-main-subject');
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
		// The same sync that mounts the popover sets the active-mark state, so the
		// helper's gate is also what makes a button's class readable.
		await selectAndAwaitPopover(page, 'prose-main-subject');
		const em = page.getByTestId('mark-em');
		await expect(em).not.toHaveClass(/active/);
		await em.click();
		await expect(em).toHaveClass(/active/);
	});

	test('clicking a mark button does not steal focus from the editor (selection survives a second click)', async ({
		page
	}) => {
		await replaceProse(page, 'prose-main-subject', 'MULTIMARK');
		await selectAndAwaitPopover(page, 'prose-main-subject');
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
		await selectAndAwaitPopover(page, 'prose-main-subject');
		await page.keyboard.press('ArrowRight'); // collapses the selection
		await expect(page.getByTestId('format-popover')).toBeHidden();
	});

	test('the link button prompts for a URL and toggles a link markOp with that href', async ({
		page
	}) => {
		await replaceProse(page, 'prose-main-subject', 'LINKWORD');
		await selectAndAwaitPopover(page, 'prose-main-subject');
		await page.getByTestId('mark-link').click();
		await page.getByTestId('mark-link-input').fill('https://example.com');
		await page.getByTestId('mark-link-apply').click();
		await expect
			.poll(async () => (await readDump(page)).subjectMarks)
			.toEqual([{ start: 0, end: 8, type: 'link', url: 'https://example.com' }]);
	});

	test('the anchor button toggles an identity anchor over the selection', async ({ page }) => {
		await replaceProse(page, 'prose-main-subject', 'ANCHORTEST');
		await selectAndAwaitPopover(page, 'prose-main-subject');
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
		await selectAndAwaitPopover(page, 'prose-main-subject');
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
		await selectAndAwaitPopover(page, 'prose-main-body');

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

test.describe('visual editor chrome — polish', () => {
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

	// The strip between two blocks IS the target — a gap is found by position, and a
	// trigger sized to its label is a word to aim at in a row the eye reads as empty.
	// Geometry only a browser settles: the width comes from the flex row, the height
	// from `--_qm-tap-min` through the button recipe's `box-sizing`, and the gutter
	// from the strip's own margins netted against the stack's gap.
	test('the add strip spans the stack, stays on the tap floor, and is the whole gutter', async ({
		page
	}) => {
		const cards = page.locator('.qm-card');
		const [above, below, strip] = await Promise.all([
			cards.nth(0).boundingBox(),
			cards.nth(1).boundingBox(),
			page.getByTestId('add-card-0').boundingBox()
		]);

		// Full-bleed: the trigger is as wide as the cards it sits between, not as wide
		// as `+ Add Indorsement`.
		expect(Math.round(strip!.width)).toBe(Math.round(above!.width));
		// …and still ≥ the WCAG floor the recipe reads.
		expect(strip!.height).toBeGreaterThanOrEqual(24);

		// The strip absorbs a space rung of the gap on each side, so the visible gutter
		// is the strip plus what is left — 32px, down from 8 + 24 + 8.
		expect(Math.round(below!.y - (above!.y + above!.height))).toBe(32);
		// What is left is miss-tolerance: the strip is invisible and live, so a click
		// just under a card's edge must land on neither.
		expect(strip!.y - (above!.y + above!.height)).toBeGreaterThan(0);
	});

	// The strip absorbs the gap; it does not replace it. `main` and the tips card have
	// no strip between them — as no pair does under a quill declaring no kinds — so the
	// gap is their whole separation and the strip's margins must not reach it.
	test('a seam with no strip in it keeps the full stack gap', async ({ page }) => {
		await page.goto('/visual?tips=1');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });

		const main = (await page.locator('.qm-card').first().boundingBox())!;
		const tips = (await page.getByTestId('tips-card').boundingBox())!;
		expect(Math.round(tips.y - (main.y + main.height))).toBe(8);
	});

	// The cost of a full-bleed invisible target: 24px of dead-to-the-eye,
	// live-to-the-pointer strip between every pair of cards. A drag that starts in a
	// body and is released past the gap must select, not insert — a `click` fires on
	// the common ancestor of press and release, so leaving the button on the way out
	// is not a press of it.
	test('a selection dragged out of a card body across the strip selects, and inserts nothing', async ({
		page
	}) => {
		await replaceProse(page, 'prose-main-body', 'DRAG ACROSS THE GAP');
		const before = await readDump(page);

		const leaf = (await pm(page, 'prose-main-body').boundingBox())!;
		const strip = (await page.getByTestId('add-card-0').boundingBox())!;
		await page.mouse.move(leaf.x + 4, leaf.y + leaf.height / 2);
		await page.mouse.down();
		await page.mouse.move(leaf.x + leaf.width - 4, leaf.y + leaf.height / 2, { steps: 5 });
		// …out of the leaf, through the strip, and released below it.
		await page.mouse.move(strip.x + strip.width / 2, strip.y + strip.height / 2, { steps: 5 });
		await page.mouse.move(strip.x + strip.width / 2, strip.y + strip.height + 8, { steps: 5 });
		await page.mouse.up();

		const after = await readDump(page);
		expect(after.cardCount).toBe(before.cardCount); // crossing it is not pressing it
		expect(after.body).toBe(before.body);
		expect(
			await page.evaluate(() => (window.getSelection()?.toString() ?? '').length)
		).toBeGreaterThan(0);
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

		// Commit is at `change` — blur to settle the bad entry so the
		// boundary judges it and the coercion diagnostic surfaces.
		await reveal(page, 'main-font_size');
		await page.getByTestId('main-font_size').fill('abc');
		await page.getByTestId('main-font_size').blur();
		await expect(page.getByTestId('diag-main-font_size')).toBeVisible();
		await expect(page.getByTestId('diag-main-font_size')).toContainText('font_size');

		// The bad value never landed in the document.
		expect((await readDump(page)).font_size).toBe(before);
		expect(pageErrors, pageErrors.join('\n')).toEqual([]);
	});

	test('a subsequent valid commit clears the commit-error diagnostic', async ({ page }) => {
		await reveal(page, 'main-font_size');
		await page.getByTestId('main-font_size').fill('abc');
		await page.getByTestId('main-font_size').blur();
		await expect(page.getByTestId('diag-main-font_size')).toBeVisible();

		await page.getByTestId('main-font_size').fill('16');
		await page.getByTestId('main-font_size').blur();
		await expect.poll(async () => (await readDump(page)).font_size).toBe(16);
		await expect(page.getByTestId('diag-main-font_size')).toBeHidden();
	});

	test('the app keeps working after a coercion error (non-gating)', async ({ page }) => {
		await reveal(page, 'main-font_size');
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

// The reference quill declares exactly one card kind, so `kinds.length === 1` always
// wins and the add affordance's MENU branch is a path no fixture reaches — the same
// blind spot the untested scalar controls sit in. `?kinds2` declares a second kind so
// the branch has a browser to run in.
test.describe('visual editor chrome — the multi-kind add menu', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/visual?kinds2=1');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });
	});

	const openMenu = async (page: Page) => {
		await page.getByTestId('add-card-0').click();
		await expect(page.getByTestId('add-card-0-kinds')).toBeVisible();
		// Off the strip, so nothing below is proved by hover rather than by state.
		await page.mouse.move(0, 0);
	};

	// The trigger takes the button recipes rather than rendering in UA chrome, and it
	// measures what the single-kind button measures: the floor is a BOX floor, so an
	// element that is not a `<button>` cannot clear it on its content box and stand a
	// padding taller than its sibling branch.
	test('the trigger draws the shared recipes and lands on the same tap floor', async ({ page }) => {
		const trigger = page.getByTestId('add-card-0');
		const chrome = await trigger.evaluate((el) => {
			const s = getComputedStyle(el);
			// The root carries the family every surface inherits, but deliberately no
			// size — the body rung is what a control reads instead (theme.css).
			const root = getComputedStyle(el.closest('[data-qm-root]')!);
			const probe = document.createElement('span');
			probe.style.fontSize = 'var(--_qm-text-body)';
			el.closest('[data-qm-root]')!.append(probe);
			const bodyRung = getComputedStyle(probe).fontSize;
			probe.remove();
			return {
				borderWidth: s.borderTopWidth,
				background: s.backgroundColor,
				sameFamilyAsRoot: s.fontFamily === root.fontFamily,
				readsBodyRung: s.fontSize === bodyRung
			};
		});
		expect(chrome.borderWidth).toBe('0px'); // no UA border
		expect(chrome.background).toBe('rgba(0, 0, 0, 0)'); // no UA fill
		expect(chrome.sameFamilyAsRoot).toBe(true); // not Arial
		expect(chrome.readsBodyRung).toBe(true);

		const box = (await trigger.boundingBox())!;
		expect(box.height).toBe(24);
	});

	// A menu, not a disclosure: it floats, so raising it moves no card. An in-flow
	// list of kinds pushes the stack open and reflows every card below the gap.
	test('opening the menu moves no card', async ({ page }) => {
		const below = page.locator('.qm-card').nth(1);
		// Document space, not the viewport's: reaching a trigger below the fold scrolls
		// the page, and a scroll is not the reflow under test.
		const docTop = () => below.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
		const before = await docTop();
		await openMenu(page);
		expect(await docTop()).toBe(before);
	});

	// The recede ladder is driven by the row's hover, and the menu portals OUT of the
	// row — so a pointer on an item has left the element that was revealing the label
	// the menu hangs from. Without the open state the trigger vanishes under its own
	// menu.
	test('an open menu keeps its trigger lit with the pointer away', async ({ page }) => {
		await openMenu(page);
		await expect
			.poll(() => page.getByTestId('add-card-0').evaluate((el) => getComputedStyle(el).opacity))
			.toBe('1');
	});

	// The items are the shared menu recipe (`.qm-menu-item`, controls.css) — bits-ui
	// marks the pointer/keyboard cursor with `[data-highlighted]`, and that is the one
	// lane a highlight fills through.
	test('an item takes the shared menu recipe and fills on the highlight rung', async ({ page }) => {
		await openMenu(page);
		const item = page.getByTestId('add-card-0-attachment');
		const rest = await item.evaluate((el) => getComputedStyle(el).backgroundColor);
		await item.hover();
		await expect
			.poll(() => item.evaluate((el) => getComputedStyle(el).backgroundColor))
			.not.toBe(rest);
	});

	// The pick commits: the chosen kind is seeded and inserted at the gap, and the
	// menu closes behind it.
	test('picking a kind inserts a card of that kind and closes the menu', async ({ page }) => {
		// `seedDocument` seeds a card per declared kind, so the count is the variant's,
		// not the reference quill's — the claim is the delta and the position.
		const before = (await readDump(page)).cardCount;
		await openMenu(page);
		await page.getByTestId('add-card-0-attachment').click();

		await expect.poll(async () => (await readDump(page)).cardCount).toBe(before + 1);
		// Index 0 is the gap this affordance owns: the pick lands there, as that kind.
		expect((await readDump(page)).cards[0].kind).toBe('attachment');
		await expect(page.getByTestId('add-card-0-kinds')).toBeHidden();
	});

	// The two dismissals that are not a pick. The outside click goes through the raw
	// mouse: bits-ui's dismissal layer swallows the press, which is the behaviour under
	// test and which Playwright's actionability check reads as an interception.
	test('Escape and an outside click both dismiss the menu', async ({ page }) => {
		const before = (await readDump(page)).cardCount;

		await openMenu(page);
		await page.keyboard.press('Escape');
		await expect(page.getByTestId('add-card-0-kinds')).toBeHidden();

		await openMenu(page);
		const card = (await page.locator('.qm-card').first().boundingBox())!;
		await page.mouse.click(card.x + 5, card.y + 5);
		await expect(page.getByTestId('add-card-0-kinds')).toBeHidden();
		expect((await readDump(page)).cardCount).toBe(before); // dismissal is not a pick
	});
});

test.describe('visual editor chrome — dark scheme', () => {
	test.use({ colorScheme: 'dark' });

	test.beforeEach(async ({ page }) => {
		await page.goto('/visual');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });
	});

	// The cheapest regression guard against a typed value's box taking the UA's
	// own text colour instead of the card's ink rung: every other spec in this
	// tier runs at Playwright's default light scheme, where the UA's black and
	// the light ink rung sit close enough that a divergence there is easy to
	// miss. Dark is where a control stuck on the UA's colour and the card
	// around it visibly disagree.
	test("a text control's computed ink matches its card", async ({ page }) => {
		await reveal(page, 'main-letterhead_title');
		const color = (selector: string) =>
			page
				.locator(selector)
				.first()
				.evaluate((el) => getComputedStyle(el).color);
		expect(await color('[data-testid="main-letterhead_title"]')).toBe(await color('.qm-card'));
	});
});

// VISUAL_EDITOR_UIUX §"Card stack" — the reorder pair reveals on POINTER OR FOCUS,
// and the focus half is what only a browser can check: `:focus-within` is a live
// match against the document's focus, and the pair is hidden by OPACITY, so it stays
// in the tab order whether or not it is drawn. A hover-only rule type-checks, passes
// every unit test, and leaves a keyboard on a focused control it cannot see.
test.describe('visual editor chrome — card controls reveal', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/visual');
		await expect(page.getByTestId('status')).toHaveText('Ready.', { timeout: 30_000 });
	});

	/** The pair's computed opacity — the wrapper carries it, not the buttons. */
	const reorderOpacity = (page: Page) =>
		page
			.locator('.qm-card-reorder')
			.first()
			.evaluate((el) => getComputedStyle(el).opacity);

	test('hidden at rest, revealed by the pointer', async ({ page }) => {
		expect(await reorderOpacity(page)).toBe('0');
		await page.getByTestId('card-title-0').hover();
		await expect.poll(() => reorderOpacity(page)).toBe('1');
	});

	test('a caret in the card reveals the pair, and leaving the editor drops it', async ({
		page
	}) => {
		await pm(page, 'prose-card0-body').click();
		await expect.poll(() => reorderOpacity(page)).toBe('1');

		// Focus out of the editor entirely, pointer parked off every card: the reveal
		// tracks where focus IS, so it does not rest on the last card edited.
		await page.mouse.move(0, 0);
		await page.getByTestId('doc-json').evaluate((el) => {
			(document.activeElement as HTMLElement | null)?.blur();
			el.scrollIntoView();
		});
		await expect.poll(() => reorderOpacity(page)).toBe('0');
	});

	/**
	 * Seed a second card, so card 0's move-DOWN is off its edge and can hold focus.
	 * The one-card seed disables both chevrons (first card and last at once), and a
	 * disabled button takes no focus — the reveal is checkable only past that edge.
	 */
	async function addSecondCard(page: Page): Promise<void> {
		await page.getByTestId('add-card-1').click();
		await expect.poll(async () => (await readDump(page)).cardCount).toBe(2);
		await page.mouse.move(0, 0);
		await page.getByTestId('card-0-down').evaluate((el) => (el as HTMLElement).blur());
		await expect.poll(() => reorderOpacity(page)).toBe('0');
	}

	test('the title holds the reveal, so tabbing on reaches a drawn chevron', async ({ page }) => {
		await addSecondCard(page);
		// The title's focus does not route through the editor's active-leaf tracking,
		// so this is the entry a card-state class keyed to that tracking misses.
		await page.getByTestId('card-title-0').focus();
		await expect.poll(() => reorderOpacity(page)).toBe('1');

		// Tab on: move-up is disabled on the first card, so the next stop is move-down.
		await page.keyboard.press('Tab');
		await expect(page.getByTestId('card-0-down')).toBeFocused();
		expect(await reorderOpacity(page)).toBe('1');
	});

	test('a focused chevron is drawn even with the pointer away', async ({ page }) => {
		// CardControls' own floor, independent of the card's rule.
		await addSecondCard(page);
		await page.getByTestId('card-0-down').focus();
		await page.mouse.move(0, 0);
		await expect.poll(() => reorderOpacity(page)).toBe('1');
	});
});
