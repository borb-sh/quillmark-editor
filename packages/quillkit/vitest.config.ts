// Node, no environment shim, and no wasm imported here: every verb resolves what it
// needs out of a collection, so the suite builds collections rather than mocking a
// resolver. `helpers/collection.ts` copies the workspace's reference quiver somewhere
// writable with the workspace's `node_modules` symlinked beside it, which is what a
// consumer's tree looks like from a resolver's point of view.
//
// `cli.integration.test.ts` spawns the built bin, so the suite needs `dist/`: `npm ci`
// builds it through `prepare`, and the gate builds before it tests.

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/__tests__/**/*.test.ts']
	}
});
