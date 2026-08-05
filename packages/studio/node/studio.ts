/**
 * The Node half, whole: pack the source quiver, watch it, serve what a client reads,
 * and say when a generation landed. Nothing renders here — the WASM boundary and the
 * paint loop are browser concerns (STUDIO §"The two halves").
 *
 * One module rather than a Vite plugin, because the published half has no Vite to
 * hang on. What the plugin keeps is the adapter: it mounts this middleware and the
 * client cannot tell which side of the publish it is talking to.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { packer } from './pack.js';
import { channel, pathnameOf, sendFile, withImportMap, within, type Middleware } from './serve.js';
import { watchTree } from './watch.js';
import { WASM_MOUNT, type AuthorWasm } from './wasm.js';

/** The client subscribes here in both modes, so `import.meta.hot` reaches no client
 *  code and a repack means the same thing built as it does under a dev server. */
const EVENTS = '/__studio/events';
/** Where the built quiver is read from, matching the client's `document.baseURI`-
 *  relative `quiver/`. */
const QUIVER = '/quiver/';
const REPACKED = 'repacked';

export interface StudioOptions {
	/** The quiver root to pack: the author's cwd, or this repo's fixtures. */
	source: string;
	/** Where generations are staged and served from. On the source's filesystem, so
	 *  the swap is a rename. */
	home: string;
	/** The prebuilt client, when this half serves it. Absent under a dev server, which
	 *  serves the client itself and has a bundler to resolve bare specifiers with. */
	client?: string;
	/** The author's artifact, mounted for the client's externalized imports. */
	wasm?: AuthorWasm;
	/** A pack that failed after the first. Every generation but the current one is
	 *  a log line: a quiver mid-edit is invalid as often as not. */
	onError?: (err: unknown) => void;
}

export interface Studio {
	middleware: Middleware;
	/** The first pack. Rejects if the source is not a quiver at all. */
	ready: Promise<void>;
	close(): void;
}

export function createStudio(options: StudioOptions): Studio {
	const { source, home, client, wasm, onError } = options;
	const pack = packer(source, home);
	const signal = channel();

	const ready = pack.run();
	const stop = watchTree(source, () => {
		pack.run().then(
			() => signal.send(REPACKED),
			// A failed pack never reaches the swap, so the last good generation stays
			// served and the author reads the failure where they are already looking.
			(err) => onError?.(err)
		);
	});

	async function serveIndex(req: Parameters<Middleware>[0], res: Parameters<Middleware>[1]) {
		if (!client || !wasm) return false;
		let html: string;
		try {
			html = await readFile(join(client, 'index.html'), 'utf8');
		} catch {
			return false;
		}
		const body = withImportMap(html, wasm.imports);
		res.setHeader('Content-Type', 'text/html; charset=utf-8');
		res.setHeader('Cache-Control', 'no-store');
		res.writeHead(200);
		res.end(req.method === 'HEAD' ? undefined : body);
		return true;
	}

	const middleware: Middleware = (req, res, next) => {
		if (req.method !== 'GET' && req.method !== 'HEAD') return next();
		const path = pathnameOf(req.url);
		if (path === null) return next();

		if (path === EVENTS) return signal.subscribe(req, res);

		void (async () => {
			try {
				if (path.startsWith(QUIVER)) {
					// A read waits for quiet rather than racing the swap: the rename is
					// atomic, but a client that opened between two of them would pair a
					// new pointer with a manifest that is already gone.
					await pack.settled();
					const file = within(pack.dir, path.slice(QUIVER.length));
					if (file && (await sendFile(req, res, file))) return;
				} else if (wasm && path.startsWith(`/${WASM_MOUNT}/`)) {
					const file = within(wasm.root, path.slice(WASM_MOUNT.length + 2));
					if (file && (await sendFile(req, res, file))) return;
				} else if (client) {
					if (path !== '/') {
						const file = within(client, path);
						if (file && (await sendFile(req, res, file))) return;
					}
					// One screen and no router, so anything left is the document.
					if (await serveIndex(req, res)) return;
				}
				next();
			} catch (err) {
				onError?.(err);
				if (!res.headersSent) {
					res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
					res.end('studio: ' + (err instanceof Error ? err.message : String(err)));
				} else {
					res.end();
				}
			}
		})();
	};

	return {
		middleware,
		ready,
		close() {
			stop();
			signal.close();
		}
	};
}
