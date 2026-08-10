/**
 * The static server `studio` serves the loop over. It composes two roots rather than
 * copying one into the other: the client out of this package, the packed quiver out of
 * the tree the packer swaps. A repack replaces a directory the server reads per
 * request, so nothing here is told a pack happened.
 *
 * Two things a general-purpose static server gets wrong for this, which is why this one
 * is written rather than borrowed: `.wasm` must be served as `application/wasm`, and a
 * path escaping its root must be refused.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve } from 'node:path';
import { within } from './paths.js';

/**
 * What the two roots hold: the client `vite build` emits, and a packed quiver's pointer,
 * manifests and bundles. Fonts carry no type because they carry no extension either,
 * being dehydrated into `store/<sha256>`; anything unlisted falls back to
 * `application/octet-stream`, which is right for opaque bytes.
 *
 * `.wasm` is the one that is not a nicety: `@quillmark/wasm` ships wasm-bindgen's web
 * target, which instantiates by streaming, and `WebAssembly.instantiateStreaming`
 * refuses a response of any other type.
 */
const TYPES: Record<string, string> = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.ico': 'image/x-icon',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.wasm': 'application/wasm',
	'.zip': 'application/zip'
};

export interface Mount {
	/** URL prefix, leading slash and no trailing one. `''` is the root mount. */
	prefix: string;
	root: string;
}

/** The file a request names, or null when it names none it may have. */
export function fileFor(mounts: Mount[], url: string): string | null {
	let path: string;
	try {
		path = decodeURIComponent(new URL(url, 'http://localhost').pathname);
	} catch {
		// A malformed escape names no file; refusing beats guessing at the intent.
		return null;
	}
	if (path.includes('\0')) return null;

	// Longest prefix first, so `/quiver/…` reaches the pack rather than the client.
	const mount = [...mounts]
		.sort((a, b) => b.prefix.length - a.prefix.length)
		.find((m) => m.prefix === '' || path === m.prefix || path.startsWith(`${m.prefix}/`));
	if (mount === undefined) return null;

	const rest = path.slice(mount.prefix.length).replace(/^\/+/, '');
	const root = resolve(mount.root);
	// One screen, no router: the root is the client's `index.html` and nothing else
	// falls back to it, so a missing asset is a 404 rather than a page.
	const at = resolve(root, rest === '' ? 'index.html' : rest);

	// The escape refusal, checked on the resolved path: `%2e%2e`, a doubled separator and
	// a plain `..` all collapse into one answer here, where a check against the request
	// text would have to anticipate each spelling.
	if (!within(root, at)) return null;
	if (!existsSync(at) || !statSync(at).isFile()) return null;
	return at;
}

/**
 * A server over `mounts`. Nothing is cached: this is a loop an author repacks under,
 * and a dev server that answered from a cache would be answering about the last
 * generation.
 */
export function createStaticServer(mounts: Mount[]): Server {
	return createServer((req: IncomingMessage, res: ServerResponse) => {
		if (req.method !== 'GET' && req.method !== 'HEAD') {
			res.writeHead(405, { allow: 'GET, HEAD' }).end();
			return;
		}

		const at = fileFor(mounts, req.url ?? '/');
		if (at === null) {
			res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found\n');
			return;
		}

		res.writeHead(200, {
			'content-type': TYPES[extname(at).toLowerCase()] ?? 'application/octet-stream',
			'content-length': statSync(at).size,
			'cache-control': 'no-store'
		});
		if (req.method === 'HEAD') {
			res.end();
			return;
		}
		createReadStream(at).pipe(res);
	});
}

/** Listen, and resolve with the port actually bound (`0` asks the OS for a free one). */
export function listen(server: Server, port: number, host: string): Promise<number> {
	return new Promise((ok, no) => {
		server.once('error', no);
		server.listen(port, host, () => {
			const address = server.address();
			ok(typeof address === 'object' && address !== null ? address.port : port);
		});
	});
}
