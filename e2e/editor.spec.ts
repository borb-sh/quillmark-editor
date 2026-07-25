import { test, expect, type Page } from '@playwright/test';

// Phase 5 exit criterion (browser tier): the /editor split-pane shell is the full
// reference harness — one LiveSession, the VisualEditor and Preview over one
// document, the caret bridge round-tripping BOTH ways, the preview following
// edits, diagnostics inline, and the read-only source view. All through the
// public subpath API (no reach-through). See src/routes/editor/+page.svelte.

/** The contenteditable inside an editor prose leaf, by its container testid. */
function pm(page: Page, leafTestid: string) {
	return page.locator(`[data-testid="${leafTestid}"] .ProseMirror`);
}

test.describe('editor shell', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/editor');
		// The Typst backend (26 MB) compiles on the first open; give it room.
		await expect(page.getByTestId('status')).toHaveText('Session open.', { timeout: 60_000 });
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
		const subjectBox = page.locator('[data-qm-field="main.subject"]').first();
		await expect(subjectBox).toBeVisible();
		const rect = await subjectBox.boundingBox();
		if (!rect) throw new Error('subject overlay box has no bounding box');
		await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);

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
		await pm(page, 'prose-main-subject').click();
		await expect(page.getByTestId('last-focus')).toContainText('"field":"main.subject"');
	});

	test('(d) the preview follows an edit (dirtyPages repaint)', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (e) => errors.push(String(e)));

		await expect(page.getByTestId('last-change')).toHaveText('none');
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
		await page.getByTestId('main-classification').click();
		expect(await resolves('.qm-select-content'), 'the enum listbox').not.toBe('');
		expect(await font('.qm-select-content'), 'the enum listbox font').toContain('ui-sans-serif');
		await page.keyboard.press('Escape');

		await pm(page, 'prose-main-subject').click();
		await page.keyboard.press('ControlOrMeta+a');
		await expect(page.getByTestId('format-popover')).toBeVisible();
		expect(await resolves('.qm-format-popover'), 'the format popover').not.toBe('');
		expect(await font('.qm-format-popover'), 'the popover font').toContain('ui-sans-serif');
	});

	test('(h) the shipped dark default inverts the scale, and a consumer dial beats it', async ({
		page
	}) => {
		// Dark mode is a two-value swap with no JS: the poles carry the dials as
		// FALLBACKS, so `prefers-color-scheme` retunes the default while a consumer's
		// own value still wins. Only a browser can check both halves — a media query
		// and the cascade are exactly what static analysis cannot see.
		const surface = () =>
			page
				.locator('.qm-editor')
				.evaluate((el) => getComputedStyle(el).getPropertyValue('--_qm-surface').trim());

		await page.emulateMedia({ colorScheme: 'light' });
		const light = await surface();
		await page.emulateMedia({ colorScheme: 'dark' });
		const dark = await surface();
		expect(dark, 'the dark default does not differ from light').not.toBe(light);

		// A dial set on an ancestor of the root wins in BOTH schemes.
		await page
			.locator('.qm-editor')
			.evaluate((el) =>
				(el.parentElement as HTMLElement).style.setProperty('--qm-bg', 'rgb(7, 8, 9)')
			);
		expect(await surface(), 'the consumer dial loses to the dark default').toBe('rgb(7, 8, 9)');
		await page.emulateMedia({ colorScheme: 'light' });
		expect(await surface(), 'the consumer dial loses in light').toBe('rgb(7, 8, 9)');
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

		await page.getByTestId('main-classification').click();
		const list = page.locator('.qm-select-content').first();
		await list.waitFor({ state: 'visible' });
		expect(await surface('.qm-select-content'), 'the enum listbox').toBe('rgb(0, 0, 40)');
		// The lift is only worth having if the list still lands over its trigger.
		expect(await list.boundingBox()).not.toBeNull();
		await page.keyboard.press('Escape');

		await pm(page, 'prose-main-subject').click();
		await page.keyboard.press('ControlOrMeta+a');
		await expect(page.getByTestId('format-popover')).toBeVisible();
		expect(await surface('.qm-format-popover'), 'the format popover').toBe('rgb(0, 0, 40)');
	});
});
