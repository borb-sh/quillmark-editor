import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
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
// `svelte()` compiles the `.svelte` sources so a test can MOUNT a surface, which
// is what the remount contract needs to be checked rather than asserted: whether a
// `doc` swap re-keys is a fact about the mounted tree and about which handle its
// leaves commit to, and neither is reachable from the pure modules. `browser: false`
// keeps the client build, which is what jsdom runs; the mounting tests declare
// `@vitest-environment jsdom` per file, as the codec's already do.
export default defineConfig({
	plugins: [svelte({ compilerOptions: { hmr: false } }), wasm(), topLevelAwait()],
	// Tests live under `tests/` (not colocated) so `src/lib` stays pure package
	// source for `svelte-package`; the `$lib` alias mirrors SvelteKit so a test
	// imports the surface the way a consumer does.
	// `browser` picks svelte's CLIENT build, without which `mount()` resolves to the
	// server entry and throws. Safe across the whole suite rather than scoped to the
	// jsdom files: `@quillmark/wasm` declares no `browser` condition, so the one
	// import that would be sensitive to it resolves identically either way.
	resolve: { alias: { $lib: lib }, conditions: ['browser'] },
	test: {
		environment: 'node',
		include: ['tests/**/*.{test,spec}.ts'],
		// The 26 MB Typst backend compiles lazily on the first `Engine.open`; the
		// first test that opens a session pays it, so the budget is generous.
		testTimeout: 30000,
		hookTimeout: 30000
	}
});
