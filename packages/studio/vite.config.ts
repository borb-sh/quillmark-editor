import { mkdir, rename, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build } from '@quillmark/quiver/node';
import { defineConfig, type Plugin } from 'vite';

// THE NODE HALF, whole: pack the source quiver into the tree the dev server serves,
// and repack it when it changes. Nothing renders here: the WASM boundary and the paint
// loop are browser concerns (STUDIO §"The two halves").

/** The workspace's source quiver. A browser cannot read the source layout, so this
 *  pack is the step every browser consumer of a quiver performs. */
const SOURCE = fileURLToPath(new URL('../../fixtures', import.meta.url));
/** Vite's verbatim-copy tree, which is the dev server's alone: the built client
 *  carries no quiver, and `scripts/site.mjs` lays one beside it. Generated, and
 *  gitignored. */
const OUT = fileURLToPath(new URL('public/quiver', import.meta.url));
/** Where a pack is assembled, and where the tree it replaces waits to be deleted.
 *  Outside the served tree, so a half-written generation is never reachable and the
 *  public directory only ever holds the one that is current. */
const NEXT = fileURLToPath(new URL('node_modules/.studio/quiver-next', import.meta.url));
const PREV = fileURLToPath(new URL('node_modules/.studio/quiver-prev', import.meta.url));
/** The dev-only signal that a repack landed. The client answers it by minting a
 *  fresh `Quiver`; nothing on this side knows what a quill is. */
const REPACKED = 'studio:quiver-repacked';
/** One repack per settled burst: an editor's save arrives as several watcher events. */
const SETTLE_MS = 80;

/** The resolved `@quillmark/wasm`, read off the copy the bundle takes rather than off a
 *  declared range: the head names the engine that painted the page, and a client built
 *  for elsewhere carries that copy with it. The package exports only `.`, so the
 *  manifest is reached beside the entry rather than as a subpath. */
const WASM_VERSION = (() => {
	const entry = createRequire(import.meta.url).resolve('@quillmark/wasm');
	const manifest = new URL('../package.json', pathToFileURL(entry));
	return JSON.parse(readFileSync(manifest, 'utf8')).version as string;
})();

/**
 * Pack into a staging tree, then move it into place: a generation becomes visible in
 * one rename rather than over the length of a pack. `build` clears its output before
 * writing it, so packing straight into the served tree leaves a window where the
 * pointer is missing or torn, and a client that reads it there reports a broken quiver
 * for an edit that was fine.
 */
async function swapIn(): Promise<void> {
	await build(SOURCE, NEXT);
	await mkdir(dirname(OUT), { recursive: true });
	await rm(PREV, { recursive: true, force: true });
	if (existsSync(OUT)) await rename(OUT, PREV);
	await rename(NEXT, OUT);
	await rm(PREV, { recursive: true, force: true });
}

function quiverSource(): Plugin {
	// Serialized rather than concurrent: `build` owns its output directory and clears
	// it first, so two overlapping packs would race over the same tree.
	let packing: Promise<void> = Promise.resolve();
	const pack = (): Promise<void> => (packing = packing.then(swapIn));

	return {
		name: 'studio:quiver-source',
		// `configResolved` rather than `buildStart`, and the reason is the serving
		// layer: Vite mounts its static middleware only for a public directory that
		// EXISTS when the server is created, which is before any build hook runs. So
		// the first pack lands here, the one hook every mode awaits before that.
		// `serve` alone: a quiver inside the client would occupy the URL the deploy
		// writes the author's to.
		async configResolved(config) {
			if (config.command === 'serve') await pack();
		},
		configureServer(server) {
			// The source tree sits outside the Vite root, so the watcher is told about it
			// by hand. The packed output stays watched: Vite serves a public file only if
			// it is in the set the watcher maintains, and a file no module graph reaches
			// triggers no reload, so the page survives a repack.
			server.watcher.add(SOURCE);
			let settle: ReturnType<typeof setTimeout> | undefined;
			const repack = (path: string): void => {
				if (!path.startsWith(SOURCE)) return;
				clearTimeout(settle);
				settle = setTimeout(async () => {
					try {
						await pack();
						server.hot.send({ type: 'custom', event: REPACKED });
					} catch (err) {
						// A quiver mid-edit is invalid as often as not (a half-written
						// `Quill.yaml`). A failed pack never reaches the swap, so the last
						// good generation stays served and the failure is a log line.
						server.config.logger.error(
							`[studio] quiver pack failed: ${err instanceof Error ? err.message : String(err)}`
						);
					}
				}, SETTLE_MS);
			};
			for (const event of ['add', 'change', 'unlink', 'addDir', 'unlinkDir'] as const)
				server.watcher.on(event, repack);
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
