import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// One line of configuration, and it is the TypeScript in a `<script lang="ts">`
// block. Read by the Vite plugin and by `svelte-check` alike, so the app and its
// type gate compile the same source.
export default {
	preprocess: vitePreprocess()
};
