import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

const lib = fileURLToPath(new URL('./src/lib', import.meta.url));

// A standalone Vitest config — NOT the SvelteKit `vite.config.ts`, whose
// `sveltekit()` plugin needs the app's routing context Vitest has no use for.
// `@quillmark/wasm` ships wasm-bindgen's bundler target (`.wasm` imported as an
// ESM module), so the same wasm() + topLevelAwait() pair the playground uses is
// required for Vitest to resolve it — and it does resolve under the `node`
// environment (verified: the Typst backend compiles and renders in Node), so the
// core tier tests the real render + geometry + corpus edits, not just pure logic.
export default defineConfig({
	plugins: [wasm(), topLevelAwait()],
	// Tests live under `tests/` (not colocated) so `src/lib` stays pure package
	// source for `svelte-package`; the `$lib` alias mirrors SvelteKit so a test
	// imports the surface the way a consumer does.
	resolve: { alias: { $lib: lib } },
	test: {
		environment: 'node',
		include: ['tests/**/*.{test,spec}.ts'],
		// The 26 MB Typst backend compiles lazily on the first `Engine.open`; the
		// first test that opens a session pays it, so the budget is generous.
		testTimeout: 30000,
		hookTimeout: 30000
	}
});
