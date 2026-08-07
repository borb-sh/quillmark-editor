/**
 * The static server `dev` serves the loop over. It composes two roots rather than
 * copying one into the other: the client out of this package, the packed quiver out of
 * the tree the packer swaps. A repack replaces a directory the server reads per
 * request, so nothing here is told a pack happened.
 *
 * Two things a general-purpose static server gets wrong for this, and they are the
 * reason a consumer had to write their own: `.wasm` must be served as
 * `application/wasm`, and a path that escapes its root must be refused.
 */

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, resolve } from 'node:path';
import { within } from './pack.js';

/**
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
	'.map': 'application/json; charset=utf-8',
	'.otf': 'font/otf',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.ttf': 'font/ttf',
	'.txt': 'text/plain; charset=utf-8',
	'.wasm': 'application/wasm',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.zip': 'application/zip'
};

export interface Mount {
	/** URL prefix, leading slash and no trailing one. `''` is the root mount. */
	prefix: string;
	/** The directory it is served from. */
	root: string;
}

/** The file a request names, or null when it names none it is allowed to. */
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

	// The escape refusal, and it is checked on the RESOLVED path: `%2e%2e`, a doubled
	// separator and a symlink-free `..` all collapse into the same answer here, where
	// a check against the request text would have to anticipate each spelling.
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
