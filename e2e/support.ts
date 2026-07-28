import { expect, type Page } from '@playwright/test';

// Prose-leaf gestures shared by the browser-tier specs. Not a spec itself —
// Playwright's default `testMatch` collects only `*.spec.ts`, so this file is
// imported, never run.

/** The contenteditable inside a prose leaf, by its container testid. */
export function pm(page: Page, leafTestid: string) {
	return page.locator(`[data-testid="${leafTestid}"] .ProseMirror`);
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

/**
 * Open a playground route and wait out the first compile. The Typst backend is
 * 26 MB and compiles on the first `open`, so the wait is generous — one number,
 * because every spec in this tier pays it.
 */
export async function openPlayground(page: Page, route: string): Promise<void> {
	await page.goto(route);
	await expect(page.getByTestId('status')).toHaveText('Session open.', { timeout: 60_000 });
}

/**
 * Click the centre of `field`'s first preview field box. The overlay is
 * `pointer-events: none`, so this is a geometry oracle: the click lands on the page
 * canvas beneath and resolves through the bridge, exactly as a click on the ink does.
 */
export async function clickFieldBox(page: Page, field: string): Promise<void> {
	const box = page.locator(`[data-qm-field="${field}"]`).first();
	await expect(box).toBeVisible();
	const rect = await box.boundingBox();
	if (!rect) throw new Error(`overlay box for ${field} has no bounding box`);
	await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2);
}
