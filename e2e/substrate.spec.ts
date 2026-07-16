import { test, expect } from '@playwright/test';

// Phase 1 exit criterion (browser tier): the playground loads usaf_memo, seeds a
// Document, opens a LiveSession, and reports pageCount / supportsCanvas /
// warnings — proving the WASM boundary live in a real browser (headless Chromium).
test('substrate chain proves the WASM boundary in the browser', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(String(e)));

	await page.goto('/');

	// The Typst backend (26 MB) compiles on the first open; give it room.
	await expect(page.getByTestId('status')).toHaveText('Session open.', { timeout: 60_000 });
	await expect(page.getByTestId('pageCount')).toHaveText(/^[1-9][0-9]*$/);
	await expect(page.getByTestId('supportsCanvas')).toHaveText('true');
	await expect(page.getByTestId('warnings')).toHaveText(/^[0-9]+$/);

	expect(errors, errors.join('\n')).toEqual([]);
});
