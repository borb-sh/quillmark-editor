import { expect, type Page } from '@playwright/test';

// Prose-leaf gestures shared by the browser-tier specs. Not a spec itself —
// Playwright's default `testMatch` collects only `*.spec.ts`, so this file is
// imported, never run.

/** The contenteditable inside a prose leaf, by its container testid. */
export function pm(page: Page, leafTestid: string) {
	return page.locator(`[data-testid="${leafTestid}"] .ProseMirror`);
}

/**
 * Expand a card's `ui.group` accordion section, so the fields inside it are
 * REACHABLE the way a user reaches them.
 *
 * The main card opens all-collapsed by design (`initialExpandedGroup`: many groups
 * plus a body leaf → the body carries the card), and a collapsed panel is an 8px
 * `overflow: hidden` window its fields overflow. A field inside one still reports a
 * full `getBoundingClientRect`, and Playwright will scroll the hidden box to reach
 * it — so a gesture against a collapsed field APPEARS to work while landing on a
 * few visible pixels, and whether it lands at all is a function of the leaf's
 * height. Selection is where that bites: the popover raises on a non-empty PM
 * selection, and a click that misses the sliver leaves focus on `<body>`, where
 * ctrl+A selects the page and raises nothing.
 *
 * Opening the section first is not a workaround for that — it is the only state in
 * which a user can select text in these fields at all.
 */
export async function openGroup(page: Page, base: string, group: string): Promise<void> {
	const header = page.getByTestId(`group-${base}-${group}`);
	if ((await header.getAttribute('aria-expanded')) === 'true') return;
	await header.click();
	await expect(header).toHaveAttribute('aria-expanded', 'true');
}

/** Replace a prose leaf's whole content with `text` (select-all + type). */
export async function replaceProse(page: Page, leafTestid: string, text: string): Promise<void> {
	const el = pm(page, leafTestid);
	await el.click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type(text);
}

/**
 * Select a prose leaf's whole (single-line) content and hold until the
 * formatting popover is raised over it.
 *
 * The raise is `requestAnimationFrame`-deferred by design (FormatPopover
 * §SELECTION OBSERVATION: one "select all" gesture fires several transient
 * `selectionchange` events, EMPTY in between, before the final range lands), so
 * the gesture returning is NOT the popover having settled. What retries here is
 * the SELECTION, not just the assertion: a bare `toBeVisible()` already polls,
 * and polling only covers a late frame — it cannot recover a gesture that
 * settled on one of those empty states, which raises nothing at all. A bare
 * assertion passes or fails by how warm the browser is, making the tier's
 * failures a function of what ran before them (issue #90).
 */
export async function selectAndAwaitPopover(page: Page, leafTestid: string): Promise<void> {
	await expect(async () => {
		await pm(page, leafTestid).click();
		await page.keyboard.press('ControlOrMeta+a');
		await expect(page.getByTestId('format-popover')).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 15_000 });
}
