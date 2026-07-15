import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

// @quillmark/wasm ships wasm-bindgen's "bundler" target, which imports its
// .wasm binaries as ESM modules (`import * as wasm from "./x_bg.wasm"`).
// Vite has no native support for that import form; wasm() + topLevelAwait()
// are required for both `vite dev` and `vite build` to resolve it.
export default defineConfig({
	plugins: [wasm(), topLevelAwait(), sveltekit()]
});
