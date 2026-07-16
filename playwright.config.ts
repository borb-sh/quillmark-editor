import { defineConfig } from '@playwright/test';

// The second test tier (phases INDEX): scripted browser checks stand in for a
// human pass over what unit tests cannot reach — canvas paint, scroll
// virtualization, DPR, the click round-trip. Specs live in `e2e/` (top-level) so
// Vitest's `tests/**` glob never sees them. The browser is the preinstalled
// Chromium; `executablePath` pins it so the @playwright/test version gap forces no
// download (`playwright install` is never run in this environment).
const CHROMIUM = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

export default defineConfig({
	testDir: 'e2e',
	timeout: 60_000,
	fullyParallel: false,
	use: {
		baseURL: 'http://localhost:5173',
		launchOptions: { executablePath: CHROMIUM, args: ['--no-sandbox'] }
	},
	webServer: {
		command: 'npm run dev -- --port 5173 --strictPort',
		url: 'http://localhost:5173',
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
