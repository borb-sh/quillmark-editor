import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import { SETTLE_MS, createPacker, settle, type Packer } from './src/node/pack.js';

// THE NODE HALF, as this repository runs it on itself. The loop is `src/node/pack.ts`,
// the same one `quillmark-studio dev` drives, so the staged swap a client depends on
// is written once. What is left here is the two things a dev server adds and a bin has
// no use for: the first pack lands before the server is created, and a repack is
// signalled over the existing socket (STUDIO §"The two halves").

/** The workspace's source quiver. A browser cannot read the source layout, so this
 *  pack is the step every browser consumer of a quiver performs. */
const SOURCE = fileURLToPath(new URL('../../fixtures', import.meta.url));
/** Vite's verbatim-copy tree, which is the dev server's alone: the built client
 *  carries no quiver, and `quillmark-studio site` lays one beside it. Generated, and
 *  gitignored. */
const OUT = fileURLToPath(new URL('public/quiver', import.meta.url));
/** Outside the served tree, so a half-written generation is never reachable. */
const STAGE = fileURLToPath(new URL('node_modules/.studio/stage', import.meta.url));
/** The dev-only signal that a repack landed. The client answers it by minting a
 *  fresh `Quiver`; nothing on this side knows what a quill is. */
const REPACKED = 'studio:quiver-repacked';

/** The resolved `@quillmark/wasm`, read off the copy the bundle takes rather than off a
 *  declared range: the head names the engine that painted the page, and a client built
 *  for elsewhere carries that copy with it. The package exports only `.`, so the
 *  manifest is reached beside the entry rather than as a subpath. */
const WASM_VERSION = (() => {
	const entry = createRequire(import.meta.url).resolve('@quillmark/wasm');
	const manifest = new URL('../package.json', pathToFileURL(entry));
	return JSON.parse(readFileSync(manifest, 'utf8')).version as string;
})();

function quiverSource(): Plugin {
	let packer: Packer | undefined;

	return {
		name: 'studio:quiver-source',
		// `configResolved` rather than `buildStart`, and the reason is the serving
		// layer: Vite mounts its static middleware only for a public directory that
		// EXISTS when the server is created, which is before any build hook runs. So
		// the first pack lands here, the one hook every mode awaits before that.
		// `serve` alone: a quiver inside the client would occupy the URL the deploy
		// writes the author's to.
		async configResolved(config) {
			if (config.command !== 'serve') return;
			packer = await createPacker({ collection: SOURCE, out: OUT, stage: STAGE });
			await packer.pack();
		},
		configureServer(server) {
			// The source tree sits outside the Vite root, so the watcher is told about it
			// by hand. The packed output stays watched: Vite serves a public file only if
			// it is in the set the watcher maintains, and a file no module graph reaches
			// triggers no reload, so the page survives a repack.
			server.watcher.add(SOURCE);
			const repack = settle(SETTLE_MS, () => {
				void packer?.pack().then(
					() => server.hot.send({ type: 'custom', event: REPACKED }),
					// A quiver mid-edit is invalid as often as not (a half-written
					// `Quill.yaml`). A failed pack never reaches the swap, so the last
					// good generation stays served and the failure is a log line.
					(err: unknown) =>
						server.config.logger.error(
							`[studio] quiver pack failed: ${err instanceof Error ? err.message : String(err)}`
						)
				);
			});
			for (const event of ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const)
				server.watcher.on(event, (path: string) => {
					if (path.startsWith(SOURCE)) repack();
				});
		}
	};
}

export default defineConfig({
	// Relative asset URLs, and the client resolves the quiver off `document.baseURI`
	// for the same reason: the base is a runtime fact, so a built studio serves from
	// wherever it is put (STUDIO §"The two halves").
	base: './',
	plugins: [svelte(), quiverSource()],
	// The client is the whole output and it carries no quiver, so a public directory
	// left behind by a dev run cannot ride into it.
	build: { copyPublicDir: false },
	define: { __WASM_VERSION__: JSON.stringify(WASM_VERSION) },
	// @quillmark/wasm ships wasm-bindgen's web target: no `.wasm` import and no
	// top-level await, so a static import is safe and Vite resolves it unaided.
	// Dev-server pre-bundling is the one exception: it relocates the package away
	// from the binary `init()` resolves against, which surfaces as
	// `runtime::init_failed`, so the package stays unbundled.
	optimizeDeps: { exclude: ['@quillmark/wasm'] }
});
