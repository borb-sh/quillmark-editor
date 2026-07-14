import adapter from '@sveltejs/adapter-auto';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// The playground app (src/routes) is dev-only; the published surface is
		// src/lib, packaged by svelte-package.
		adapter: adapter()
	}
};

export default config;
