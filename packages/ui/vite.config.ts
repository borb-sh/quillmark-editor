import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

// @quillmark/wasm ships wasm-bindgen's "bundler" target, which imports its
// .wasm binaries as ESM modules (`import * as wasm from "./x_bg.wasm"`).
// Vite has no native support for that import form; wasm() + topLevelAwait()
// are required for both `vite dev` and `vite build` to resolve it.
export default defineConfig({
	plugins: [wasm(), topLevelAwait(), sveltekit()],
	// Every file under `fixtures/` is quill input, served verbatim as a `?url`
	// asset — mark the tree so Vite never runs import-analysis over it (the fonts'
	// extensionless `LICENSE` files are not JS, and parsing them as such errors).
	assetsInclude: ['**/fixtures/**'],
	server: {
		fs: {
			// The reference quill lives at the workspace root (a dev fixture, never in
			// `static/`, never published). SvelteKit narrows `fs.allow` to the app
			// source, so the playground's `?url` asset glob over `fixtures/**` 403s
			// without this — they stay bundled `?url` inputs, not a served directory.
			allow: [fileURLToPath(new URL('../../fixtures', import.meta.url))]
		}
	}
});
