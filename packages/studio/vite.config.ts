import { fileURLToPath } from 'node:url';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import { createStudio } from './node/studio.js';

// THE DEV ADAPTER, and nothing more. The Node half is a plain module (`node/`), so a
// published studio can run it with no Vite behind it; here the plugin mounts that
// module's middleware and Vite serves the client. The client cannot tell the two
// apart: same routes, same repack signal (STUDIO §"The two halves").

/** The workspace's source quiver, which is what studio launches against in this repo.
 *  From a tarball the source is the author's cwd, and the bin passes that instead. */
const SOURCE = fileURLToPath(new URL('../../fixtures', import.meta.url));
/** Where generations are staged and served from. Under `node_modules`, which is what
 *  the watch already ignores, and on the source's filesystem, so the swap is a rename. */
const HOME = fileURLToPath(new URL('node_modules/.studio', import.meta.url));

function quiverSource(): Plugin {
	return {
		name: 'studio:quiver-source',
		// Dev alone. `vite build` emits the client and no quiver: what a built client
		// reads is the author's quiver, packed by the bin against their cwd.
		apply: 'serve',
		configureServer(server) {
			const log = (err: unknown): void =>
				server.config.logger.error(`[studio] ${err instanceof Error ? err.message : String(err)}`);
			const studio = createStudio({ source: SOURCE, home: HOME, onError: log });
			studio.ready.catch(log);
			// Ahead of Vite's own middleware, and it answers only `/quiver/` and the
			// event stream: the served tree lives outside the Vite root, so nothing
			// here depends on a public directory existing when the server is created.
			server.middlewares.use((req, res, next) => studio.middleware(req, res, next));
			server.httpServer?.on('close', () => studio.close());
		}
	};
}

export default defineConfig({
	// Relative asset URLs, and the client resolves the quiver off `document.baseURI`
	// for the same reason: the base is a runtime fact, so the built client serves from
	// wherever it is put (STUDIO §"Published, and built that way").
	base: './',
	// Nothing static of studio's own: the two trees a client reads, the quiver and the
	// artifact, are the Node half's to serve and neither belongs in the tarball.
	publicDir: false,
	plugins: [svelte(), quiverSource()],
	build: {
		// The tarball's two halves, side by side: `dist/client` here, `dist/node` from
		// `tsc`. The bin serves the first and is the second.
		outDir: 'dist/client',
		emptyOutDir: true,
		rollupOptions: {
			// The one specifier left BARE in the built client. A baked artifact would
			// render through a different copy than `quiver test` does, so the bin
			// resolves the author's and mints the import map that answers this
			// (STUDIO §"The author's wasm, or none").
			external: ['@quillmark/wasm']
		}
	},
	// @quillmark/wasm ships wasm-bindgen's web target: no `.wasm` import and no
	// top-level await, so a static import is safe and Vite resolves it unaided.
	// Dev-server pre-bundling is the one exception: it relocates the package away
	// from the binary `init()` resolves against, which surfaces as
	// `runtime::init_failed`, so the package stays unbundled.
	optimizeDeps: { exclude: ['@quillmark/wasm'] }
});
