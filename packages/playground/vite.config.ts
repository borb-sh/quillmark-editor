import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

// @quillmark/wasm ships wasm-bindgen's "bundler" target, which imports its
// .wasm binaries as ESM modules (`import * as wasm from "./x_bg.wasm"`).
// Vite has no native support for that import form; wasm() + topLevelAwait()
// are required for both `vite dev` and `vite build` to resolve it.
//
// The reference quill is not a bundler input at all: it is packed into
// `static/quiver/` before dev and build, and fetched at runtime. So nothing here
// reaches outside the app root.
export default defineConfig({
	plugins: [wasm(), topLevelAwait(), sveltekit()]
});
