// Node, and the Node half alone. Nothing in this package's suite renders: the browser
// half is a paint loop over a session, which is what the playground exists to drive by
// hand, and what a jsdom assertion over chrome would only restate. What is testable
// here is the half that packs, lays out and serves — the half a consumer reaches
// through a bin, where being wrong is silent.
//
// The reference quiver (`fixtures/`) is the input throughout, packed into temp
// directories the way a consumer's collection is.

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/__tests__/**/*.test.ts']
	}
});
