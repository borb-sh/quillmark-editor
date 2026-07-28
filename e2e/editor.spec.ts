import { test, expect, type Page } from '@playwright/test';
import {
	pm,
	reveal,
	selectAndAwaitPopover,
	openPlayground,
	clickFieldBox,
	declareScheme
} from './support.js';

// Phase 5 exit criterion (browser tier): the /editor split-pane shell is the full
// reference harness — one LiveSession, the VisualEditor and Preview over one
// document, the caret bridge round-tripping BOTH ways, the preview following
// edits, diagnostics inline, and the read-only source view. All through the
// public subpath API (no reach-through). See src/routes/editor/+page.svelte.

test.describe('editor shell', () => {
	test.beforeEach(async ({ page }) => {
		await openPlayground(page, '/editor');
	});

	test('(a) both panes mount over one session', async ({ page }) => {
		// The editor's subject prose leaf and the preview's first canvas both live.
		await expect(pm(page, 'prose-main-subject')).toBeVisible();
		await expect(page.locator('canvas.qm-page-canvas').first()).toBeVisible();
	});

	test('(b) preview → editor: clicking preview ink focuses the field in the editor', async ({
		page
	}) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(String(e)));

		// Click the subject field's ink in the PREVIEW overlay (the only place
		// `[data-qm-field]` exists — the preview surface). The overlay keys on the
		// canonical DocPath address (`main.subject`), as `regions()` reports it.
		await clickFieldBox(page, 'main.subject');

		// The hit surfaced (its `field` is the canonical DocPath), and setCaret
		// focused the editor's subject leaf — so the editor emitted its own `Addr`
		// (`{field:"subject"}`) as the active address (the bridge landed).
		await expect(page.getByTestId('last-hit')).toContainText('"field":"main.subject"');
		await expect(page.getByTestId('active-addr')).toContainText('"field":"subject"');
		expect(errors, errors.join('\n')).toEqual([]);
	});

	test('(c) editor → preview: a caret move in the editor drives preview.focusPosition', async ({
		page
	}) => {
		// Click into the editor's subject leaf (an editor-origin caret move, not via
		// the preview) → onCaretMove → focusPosition with the canonical DocPath address.
		await reveal(page, 'prose-main-subject');
		await pm(page, 'prose-main-subject').click();
		await expect(page.getByTestId('last-focus')).toContainText('"field":"main.subject"');
	});

	test('(d) the preview follows an edit (dirtyPages repaint)', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(String(e)));

		await expect(page.getByTestId('last-change')).toHaveText('none');
		await reveal(page, 'prose-main-subject');
		await pm(page, 'prose-main-subject').click();
		await page.keyboard.type('SHELLEDIT');

		// The debounced recompile applies and hands the ChangeSet to preview.refresh;
		// the subject edit dirties at least one page.
		await expect
			.poll(async () => (await page.getByTestId('last-change').textContent()) ?? '', {
				timeout: 15_000
			})
			.toMatch(/\[\s*\d/);
		expect(errors, errors.join('\n')).toEqual([]);
	});

	test('(e) an injected diagnostic routes inline against its field', async ({ page }) => {
		await page.getByTestId('inject-diagnostics').click();
		await expect(page.getByTestId('diag-main-subject')).toBeVisible();
		await expect(page.getByTestId('diag-main-subject')).toContainText('External test warning');
	});

	test('(f) the debug source view renders canonical markdown and tracks edits', async ({
		page
	}) => {
		await page.getByTestId('toggle-source').click();
		await expect(page.getByTestId('source-drawer')).toBeVisible();

		const mirror = page.locator('.qm-source .qm-source-text');
		await expect(mirror).toBeVisible();
		// Canonical Quillmark markdown carries the `$quill:` front-matter header.
		await expect(mirror).toContainText('usaf_memo');

		// Edit the subject; the source view refreshes on the recompile tick.
		await reveal(page, 'prose-main-subject');
		await pm(page, 'prose-main-subject').click();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('SOURCEVIEWEDIT');
		await expect
			.poll(async () => (await mirror.textContent()) ?? '', { timeout: 15_000 })
			.toContain('SOURCEVIEWEDIT');
	});

	test('(g) every detached root resolves the derived scale and the baseline font', async ({
		page
	}) => {
		// The derivation applies per DETACHED root (core/theme.css) — a subtree that
		// does not descend from another root, so it inherits the public dials from
		// the consumer's cascade but none of the rungs. `check:style` gates where
		// `--_qm-*` is DEFINED; nothing static can gate that a root CARRIES the
		// marker, so this walks them. A new root that forgets `data-qm-root` renders
		// with every rung unresolved — `1px solid var(--_qm-border)` collapses to
		// `currentColor`, paddings go to zero — and fails here rather than in review.
		//
		// `font-family` rides the same rule, so it is the same walk — and the same
		// failure: a root without the marker takes the page's font, not `--qm-font`.
		const resolves = (selector: string) =>
			page
				.locator(selector)
				.first()
				.evaluate((el) => getComputedStyle(el).getPropertyValue('--_qm-ink').trim());
		const font = (selector: string) =>
			page
				.locator(selector)
				.first()
				.evaluate((el) => getComputedStyle(el).fontFamily);

		await page.getByTestId('toggle-source').click();
		await expect(page.getByTestId('source-drawer')).toBeVisible();
		for (const root of ['.qm-editor', '.qm-preview', '.qm-source']) {
			expect(await resolves(root), `${root} carries no derived scale`).not.toBe('');
			expect(await font(root), `${root} carries no baseline font`).toContain('ui-sans-serif');
		}

		// The two that PORTAL to document.body, and so escape the editor's subtree.
		await reveal(page, 'main-classification');
		await page.getByTestId('main-classification').click();
		expect(await resolves('.qm-select-content'), 'the enum listbox').not.toBe('');
		expect(await font('.qm-select-content'), 'the enum listbox font').toContain('ui-sans-serif');
		await page.keyboard.press('Escape');

		await selectAndAwaitPopover(page, 'prose-main-subject');
		expect(await resolves('.qm-format-popover'), 'the format popover').not.toBe('');
		expect(await font('.qm-format-popover'), 'the popover font').toContain('ui-sans-serif');
	});

	test('(h) the default follows the HOST scheme, not the OS, and a consumer dial beats both', async ({
		page
	}) => {
		// Dark is a two-value swap with no JS: the poles carry the dials as FALLBACKS
		// over `light-dark()`, so the scheme the host DECLARES retunes the default
		// while a consumer's own value still wins. Only a browser can check this —
		// inheritance, `light-dark()` and the cascade are what static analysis cannot
		// see, and `--_qm-ink` reads back as the unresolved `light-dark(…)` token in
		// either scheme, so every assertion is on a USED property: `color`, which the
		// root rule sets to the ink pole and so resolves it exactly.
		const ink = () => page.locator('.qm-editor').evaluate((el) => getComputedStyle(el).color);
		const declare = (scheme: string) => declareScheme(page, scheme);

		// The OS says dark throughout: nothing below may move with it.
		await page.emulateMedia({ colorScheme: 'dark' });
		await declare('light');
		const light = await ink();
		await declare('dark');
		const dark = await ink();
		expect(dark, 'the host-declared scheme does not retune the poles').not.toBe(light);

		// An undeclared host takes the light pole, matching the page's own unstyled
		// text: the OS preference is not a signal the package reads.
		await declare('normal');
		expect(await ink(), 'an undeclared host follows the OS').toBe(light);

		// A dial set on an ancestor of the root wins under EITHER declaration.
		await page
			.locator('.qm-editor')
			.evaluate((el) =>
				(el.parentElement as HTMLElement).style.setProperty('--qm-fg', 'rgb(7, 8, 9)')
			);
		await declare('dark');
		expect(await ink(), 'the consumer dial loses to the dark default').toBe('rgb(7, 8, 9)');
		await declare('light');
		expect(await ink(), 'the consumer dial loses in light').toBe('rgb(7, 8, 9)');
	});

	test('(h2) the shell inverts with the surface it hosts', async ({ page }) => {
		// The divergence the scheme contract exists to close: the host's chrome and
		// the mounted surface reading two different signals, so one inverts and the
		// other does not. The shell derives its `--pg-*` from the same declaration
		// (`routes/playground.css`), so the two poles stay on the same side of their
		// page in BOTH schemes — which a literal in either place breaks.
		//
		// A rung off a `color-mix` computes to `oklab(…)`, so each reading rasterises
		// through a 2D context, which takes any CSS colour and returns the sRGB bytes
		// that reach the screen. Luma against mid-grey: every pole sits far from it,
		// so the claim is which side a value landed on, not its exact tone.
		const reading = () =>
			page.evaluate(() => {
				const ctx = document.createElement('canvas').getContext('2d')!;
				const luma = (css: string): number => {
					ctx.clearRect(0, 0, 1, 1);
					ctx.fillStyle = css;
					ctx.fillRect(0, 0, 1, 1);
					const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
					return 0.2126 * r + 0.7152 * g + 0.0722 * b;
				};
				const of = (sel: string, prop: 'color' | 'backgroundColor') =>
					luma(getComputedStyle(document.querySelector(sel)!)[prop]);
				return {
					shellInk: of('main', 'color'),
					shellPane: of('.editor-pane', 'backgroundColor'),
					// The card, not `.qm-editor`: the editor root paints nothing, so the
					// surface rung reaches the pixels one level in.
					surface: of('.qm-card', 'backgroundColor')
				};
			});

		for (const [scheme, dark] of [
			['light', false],
			['dark', true]
		] as const) {
			await declareScheme(page, scheme);
			const r = await reading();
			expect(r.shellPane < 128, `the shell's pane under ${scheme}`).toBe(dark);
			expect(r.surface < 128, `the surface inside it under ${scheme}`).toBe(dark);
			expect(r.shellInk < 128, `the shell's ink under ${scheme}`).toBe(!dark);
		}
	});
	test('(i) a pane-scoped dial reaches the portaled surfaces', async ({ page }) => {
		// The popover and the enum listbox portal out of the leaf's DOM. Landing them
		// on `document.body` would put them outside the consumer's wrapper, so a
		// palette scoped to ONE PANE — the documented "set them on any ancestor" case —
		// reached every surface except these two: a light popover over a dark editor.
		// They portal into the nearest `[data-qm-root]` instead. Test (g) cannot catch
		// this: it asserts each root resolves SOME scale, which passed precisely
		// because the portaled roots resolved the DEFAULT one.
		await page
			.locator('.qm-editor')
			.evaluate((el) =>
				(el.parentElement as HTMLElement).style.setProperty('--qm-bg', 'rgb(0, 0, 40)')
			);
		const surface = (selector: string) =>
			page
				.locator(selector)
				.first()
				.evaluate((el) => getComputedStyle(el).getPropertyValue('--_qm-surface').trim());

		expect(await surface('.qm-editor')).toBe('rgb(0, 0, 40)');

		await reveal(page, 'main-classification');
		await page.getByTestId('main-classification').click();
		const list = page.locator('.qm-select-content').first();
		await list.waitFor({ state: 'visible' });
		expect(await surface('.qm-select-content'), 'the enum listbox').toBe('rgb(0, 0, 40)');
		// The lift is only worth having if the list still lands over its trigger.
		expect(await list.boundingBox()).not.toBeNull();
		await page.keyboard.press('Escape');

		await selectAndAwaitPopover(page, 'prose-main-subject');
		expect(await surface('.qm-format-popover'), 'the format popover').toBe('rgb(0, 0, 40)');
	});
});
