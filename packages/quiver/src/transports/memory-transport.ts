/**
 * MemoryTransport — built-quiver transport over bytes the caller already holds,
 * falling through to another transport for what the map does not carry.
 * Internal; not exported from index.ts.
 *
 * Browser-safe: no `node:` imports at any level.
 */

import { QuiverError } from '../errors.js';
import type { BuiltTransport, FetchOptions } from '../built-loader.js';

/**
 * Keys are artifact-relative, as `build` writes them and the loader asks for
 * them: `latest.json`, `manifest.<digest>.json`, `<name>@<x.y.z>.<digest>.zip`,
 * `store/<hash>`. A leading `./` or `/` is stripped, so a map assembled from a
 * directory walk needs no reshaping.
 */
function normalizeKeys(files: ReadonlyMap<string, Uint8Array>): Map<string, Uint8Array> {
	const out = new Map<string, Uint8Array>();
	for (const [key, bytes] of files) {
		out.set(key.replace(/^\.?\//, ''), bytes);
	}
	return out;
}

export class MemoryTransport implements BuiltTransport {
	private readonly files: Map<string, Uint8Array>;

	constructor(
		files: ReadonlyMap<string, Uint8Array>,
		private readonly fallback?: BuiltTransport
	) {
		this.files = normalizeKeys(files);
	}

	/**
	 * The map answers first. `FetchOptions` reaches only the fallback: a held
	 * byte has no cache above it to revalidate against, which is the whole point
	 * of holding it.
	 */
	async fetchBytes(relativePath: string, opts?: FetchOptions): Promise<Uint8Array> {
		const bytes = this.files.get(relativePath);
		if (bytes !== undefined) return bytes;

		if (this.fallback === undefined) {
			throw new QuiverError(
				'transport_error',
				`No bytes held for "${relativePath}". A quiver loaded from files alone carries the whole artifact: the pointer, the manifest, every bundle, and every store entry. To hold part of it and fetch the rest, pass the map as the \`seed\` option to Quiver.fromBuiltUrl.`
			);
		}

		return this.fallback.fetchBytes(relativePath, opts);
	}
}
