/**
 * The serving layer: static trees, and the one channel the client listens on.
 *
 * Written out rather than delegated, because the Node half runs in two places. In
 * this repo it is a Vite plugin's middleware; from a tarball it is the whole server,
 * where a dev server's static handling is not there to borrow. The client cannot tell
 * the two apart: same routes, same signal.
 */

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, resolve, sep } from 'node:path';

export type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

const TYPES: Record<string, string> = {
	'.css': 'text/css; charset=utf-8',
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.map': 'application/json; charset=utf-8',
	'.otf': 'font/otf',
	'.pdf': 'application/pdf',
	'.png': 'image/png',
	'.svg': 'image/svg+xml',
	'.ttf': 'font/ttf',
	'.txt': 'text/plain; charset=utf-8',
	// The MIME type `WebAssembly.instantiateStreaming` insists on: served wrong, the
	// glue falls back to a slower path and says so in the console.
	'.wasm': 'application/wasm',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2'
};

/** The path a request names, decoded and query-free, or null when it climbs out. */
export function pathnameOf(url: string | undefined): string | null {
	if (!url) return null;
	try {
		return decodeURIComponent(new URL(url, 'http://studio.invalid').pathname);
	} catch {
		return null;
	}
}

/** A file under `root`, or null when the path escapes it. The guard is on the
 *  RESOLVED path: `..` survives decoding, and a served tree is the author's disk. */
export function within(root: string, rel: string): string | null {
	const abs = resolve(root, rel.replace(/^\/+/, ''));
	return abs === root || abs.startsWith(root + sep) ? abs : null;
}

/**
 * Send `file`, or return false when it is not one. Validated with an ETag rather than
 * cached by age: everything here is a file the author is editing or a generation that
 * swaps under a stable name, and a reload should cost a request, not a re-download of
 * the backend's several megabytes.
 */
export async function sendFile(
	req: IncomingMessage,
	res: ServerResponse,
	file: string
): Promise<boolean> {
	let size: number;
	let mtime: number;
	try {
		const info = await stat(file);
		if (!info.isFile()) return false;
		size = info.size;
		mtime = info.mtimeMs;
	} catch {
		return false;
	}

	const etag = `W/"${size.toString(16)}-${Math.round(mtime).toString(16)}"`;
	res.setHeader('Cache-Control', 'no-cache');
	res.setHeader('ETag', etag);
	res.setHeader('Content-Type', TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream');
	if (req.headers['if-none-match'] === etag) {
		res.writeHead(304);
		res.end();
		return true;
	}
	res.setHeader('Content-Length', size);
	if (req.method === 'HEAD') {
		res.writeHead(200);
		res.end();
		return true;
	}
	res.writeHead(200);
	createReadStream(file).pipe(res);
	return true;
}

export interface Channel {
	/** Hold `res` open as a subscriber. */
	subscribe(req: IncomingMessage, res: ServerResponse): void;
	send(event: string): void;
	close(): void;
}

/** Server-sent events: one direction, no dependency, and a client that reconnects on
 *  its own. The repack signal is the only traffic it carries. */
export function channel(): Channel {
	const open = new Set<ServerResponse>();
	// A proxy or a sleeping laptop drops a silent connection; a comment keeps it.
	const beat = setInterval(() => {
		for (const res of open) res.write(': beat\n\n');
	}, 30_000);
	beat.unref?.();

	return {
		subscribe(req, res) {
			res.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-store',
				Connection: 'keep-alive'
			});
			res.write('retry: 1000\n\n');
			open.add(res);
			req.on('close', () => open.delete(res));
		},
		send(event) {
			for (const res of open) res.write(`event: ${event}\ndata: {}\n\n`);
		},
		close() {
			clearInterval(beat);
			for (const res of open) res.end();
			open.clear();
		}
	};
}

/**
 * The import map, in the document that resolves through it. It goes first in `<head>`
 * because a map has to precede the module script whose specifiers it answers.
 */
export function withImportMap(html: string, imports: Record<string, string>): string {
	const map = `<script type="importmap">${JSON.stringify({ imports })}</script>`;
	return html.replace(/<head(\s[^>]*)?>/i, (head) => `${head}\n\t\t${map}`);
}
