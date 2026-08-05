import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { build } from '@quillmark/quiver/node';
import { defineConfig, type Plugin } from 'vite';

// THE NODE HALF, whole: pack the source quiver into the tree the dev server serves,
// and repack it when it changes. Nothing renders here — the WASM boundary and the
// paint loop are browser concerns (STUDIO §"The two halves").

/** The workspace's source quiver. A browser cannot read the source layout, so this
 *  pack is the step every browser consumer of a quiver performs. */
const SOURCE = fileURLToPath(new URL('../../fixtures', import.meta.url));
/** Vite's verbatim-copy tree, so one output serves `vite dev` and the build alike.
 *  Generated, and gitignored. */
const OUT = fileURLToPath(new URL('public/quiver', import.meta.url));
/** The dev-only signal that a repack landed. The client answers it by minting a
 *  fresh `Quiver`; nothing on this side knows what a quill is. */
const REPACKED = 'studio:quiver-repacked';
/** One repack per settled burst: an editor's save arrives as several watcher events,
 *  and a `build` clears its output before writing it. */
const SETTLE_MS = 80;

function quiverSource(): Plugin {
	// Serialized rather than concurrent: `build` owns its output directory and clears
	// it first, so two overlapping packs would race over the same tree.
	let packing: Promise<void> = Promise.resolve();
	const pack = (): Promise<void> => (packing = packing.then(() => build(SOURCE, OUT)));

	return {
		name: 'studio:quiver-source',
		// `configResolved` rather than `buildStart`, and the reason is the serving
		// layer: Vite mounts its static middleware only for a public directory that
		// EXISTS when the server is created, which is before any build hook runs. So
		// the first pack lands here, the one hook every mode awaits before that.
		async configResolved() {
			await pack();
		},
		configureServer(server) {
			// The source tree sits outside the Vite root, so the watcher is told about
			// it by hand; the packed output sits inside the root and is ignored there
			// (`server.watch.ignored` below).
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
						// `Quill.yaml`), so a failed pack is reported and the last good
						// one stays served rather than the tree being left cleared.
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
	// wherever it is put (STUDIO §"Built as though it publishes").
	base: './',
	plugins: [svelte(), quiverSource()],
	// @quillmark/wasm ships wasm-bindgen's web target: no `.wasm` import and no
	// top-level await, so a static import is safe and Vite resolves it unaided.
	// Dev-server pre-bundling is the one exception: it relocates the package away
	// from the binary `init()` resolves against, which surfaces as
	// `runtime::init_failed`, so the package stays unbundled.
	optimizeDeps: { exclude: ['@quillmark/wasm'] }
});
