import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Two artifacts from one repo: `svelte-package` emits the published library
		// from src/lib; `vite build` emits the deployed playground (src/routes) as a
		// static SPA. `+layout.ts` already sets ssr=false/prerender=false, so the
		// fallback below is the whole app — no per-route prerender, no server.
		// Root-relative (no paths.base): the deploy target is the owner's call and a
		// project-subpath host only needs paths.base set here.
		adapter: adapter({ fallback: 'index.html' })
	}
};

export default config;
