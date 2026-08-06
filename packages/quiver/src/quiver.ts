/**
 * Quiver — primary runtime abstraction for a collection of quills.
 *
 * Polymorphism via composition: internally stores a pluggable loader
 * (either source-backed or build-output-backed).
 *
 * This module is browser-safe: only `fromBuiltUrl`, `fromManifest`, and the
 * instance API live here. The filesystem factories are free functions in
 * `./node.js`; the class is the same either way.
 */

import { QuiverError } from './errors.js';
import { Quill } from '@quillmark/wasm';
import { parseQuillRef } from './ref.js';
import { matchesSemverSelector, chooseHighestVersion } from './semver.js';

/** Loader strategy: source or build output. Package-internal. */
export interface QuiverLoader {
	loadTree(name: string, version: string): Promise<Map<string, Uint8Array>>;
}

/**
 * The private constructor's only door, closed over by the static block below.
 * Exported as `createQuiver` for this package's loaders and reachable from no
 * entry in `exports`, so a consumer holds the factories and nothing else.
 */
let create!: (name: string, catalog: Map<string, string[]>, loader: QuiverLoader) => Quiver;

export class Quiver {
	readonly name: string;

	readonly #catalog: ReadonlyMap<string, readonly string[]>;
	readonly #loader: QuiverLoader;

	/**
	 * Cache of materialized quills, keyed by canonical ref. A `Quill` is now
	 * engine-free, portable data (`Quill.fromTree`), so one instance per ref is
	 * shared across every engine. Promise values so concurrent getQuill calls
	 * coalesce into a single materialization.
	 */
	readonly #quillCache: Map<string, Promise<Quill>> = new Map();

	/**
	 * Private constructor. A Quiver comes from a factory (`Quiver.fromBuiltUrl`,
	 * `Quiver.fromManifest`, or `fromDir` / `fromPackage` / `fromBuiltDir` from
	 * `@quillmark/quiver/node`), which is what names the thing being read.
	 */
	private constructor(name: string, catalog: Map<string, string[]>, loader: QuiverLoader) {
		this.name = name;
		this.#catalog = new Map(catalog);
		this.#loader = loader;
	}

	static {
		create = (name, catalog, loader) => new Quiver(name, catalog, loader);
	}

	/**
	 * Browser-safe factory. Loads build output from an HTTP/HTTPS URL.
	 *
	 * Origin-relative URLs (e.g. `/quivers/foo/`) are accepted in browser
	 * environments. `file://` URLs are rejected — to load build output from
	 * disk in Node, use `fromBuiltDir(path)` from `@quillmark/quiver/node`.
	 *
	 * Throws `transport_error` on network/HTTP failure, `quiver_invalid`
	 * on format errors.
	 */
	static async fromBuiltUrl(url: string): Promise<Quiver> {
		if (url.startsWith('file://')) {
			throw new QuiverError(
				'transport_error',
				`Quiver.fromBuiltUrl requires an http(s):// or origin-relative URL; got "${url}". For local build output, use import { fromBuiltDir } from '@quillmark/quiver/node'.`
			);
		}
		const { HttpTransport } = await import('./transports/http-transport.js');
		const { loadBuiltQuiver } = await import('./built-loader.js');
		const transport = new HttpTransport(url);
		return loadBuiltQuiver(transport);
	}

	/**
	 * Browser-safe factory. Seeds the catalog from caller-provided manifest
	 * bytes — never fetches `latest.json` — then fetches bundles lazily and
	 * content-addressed, relative to `baseUrl`, like `fromBuiltUrl`. For SSR
	 * consumers that already hold the manifest at build time.
	 *
	 * Throws `quiver_invalid` on malformed manifest bytes, `transport_error`
	 * on a `file://` baseUrl or a later bundle fetch failure.
	 */
	static async fromManifest(baseUrl: string, manifestBytes: Uint8Array): Promise<Quiver> {
		if (baseUrl.startsWith('file://')) {
			throw new QuiverError(
				'transport_error',
				`Quiver.fromManifest requires an http(s):// or origin-relative baseUrl; got "${baseUrl}". For local build output, use import { fromBuiltDir } from '@quillmark/quiver/node'.`
			);
		}
		const { HttpTransport } = await import('./transports/http-transport.js');
		const { seedBuiltQuiver } = await import('./built-loader.js');
		const transport = new HttpTransport(baseUrl);
		return seedBuiltQuiver(transport, manifestBytes);
	}

	/** Returns all known quill names, sorted lexicographically. */
	quillNames(): string[] {
		return [...this.#catalog.keys()].sort();
	}

	/**
	 * Returns all canonical versions for a given quill name, sorted descending.
	 * Returns an empty array if the quill name is not in the catalog.
	 */
	versionsOf(name: string): string[] {
		return [...(this.#catalog.get(name) ?? [])];
	}

	/**
	 * Resolves a selector ref → canonical ref (e.g. "memo" → "memo@1.1.0").
	 *
	 * Selector forms: `name`, `name@x`, `name@x.y`, `name@x.y.z`. Picks the
	 * highest matching version in this quiver.
	 *
	 * Sync, and in-memory by construction rather than by implementation: every
	 * loader materializes the catalog as the quiver is built, and `QuiverLoader`
	 * carries one verb, `loadTree`, which resolution never reaches.
	 *
	 * Throws:
	 *   - `invalid_ref` if ref fails parseQuillRef
	 *   - `quill_not_found` if no version matches
	 */
	resolve(ref: string): string {
		const parsed = parseQuillRef(ref);
		const versions = this.#catalog.get(parsed.name);

		if (versions && versions.length > 0) {
			const candidates =
				parsed.selector === undefined
					? [...versions]
					: versions.filter((v) => matchesSemverSelector(v, parsed.selector!));

			if (candidates.length > 0) {
				// chooseHighestVersion returns null only for empty arrays; candidates is non-empty.
				const winner = chooseHighestVersion(candidates)!;
				return `${parsed.name}@${winner}`;
			}
		}

		throw new QuiverError(
			'quill_not_found',
			`No quill found for ref "${ref}" in quiver "${this.name}".`,
			{ ref, quiverName: this.name }
		);
	}

	/**
	 * Returns a `Quill` for a ref (selector or canonical).
	 *
	 * The returned quill is materialized from the `@quillmark/wasm` root export
	 * — it is engine-free, portable data suitable for schema inspection,
	 * validation, blueprint access, and document seeding.
	 *
	 * A core `Quill` renders directly: pass it to `engine.render(quill, doc)`.
	 *
	 * Selector refs (e.g. `"memo"`, `"memo@1"`) are resolved to canonical form
	 * first. Materializes once and caches per canonical ref — concurrent calls
	 * coalesce into a single load.
	 *
	 * BORROWED, not handed over: the quill is the quiver's, shared with every
	 * other caller for the same ref, and lives as long as the quiver. Do not
	 * `free()` it: the next `getQuill` for that ref would hand out a freed
	 * handle. A caller wanting one of its own mints it from `.toTree()`.
	 *
	 * Throws:
	 *   - `invalid_ref` if ref is malformed
	 *   - `quill_not_found` if ref does not match any version in this quiver
	 *   - propagates I/O errors from the loader unchanged
	 *   - propagates validation errors from Quill.fromTree() unchanged
	 */
	async getQuill(ref: string): Promise<Quill> {
		const canonicalRef = this.resolve(ref);

		let entry = this.#quillCache.get(canonicalRef);
		if (entry === undefined) {
			entry = this.#materializeQuill(canonicalRef).catch((err) => {
				this.#quillCache.delete(canonicalRef);
				throw err;
			});
			this.#quillCache.set(canonicalRef, entry);
		}
		return entry;
	}

	/**
	 * Internal: load the tree + construct via Quill.fromTree. Errors propagate.
	 *
	 * The tree is held only for the length of this call: the quill cache holds the
	 * materialized result, and it is the one cache. A second tree cache beside it
	 * would buy a retry after a `Quill.fromTree` throw its refetch, which is a
	 * saved round-trip on the path where the quill is broken.
	 *
	 * Every caller arrives through `resolve` or the catalog itself, so the ref is
	 * catalog-backed by construction and the loader needs no gate.
	 */
	async #materializeQuill(canonicalRef: string): Promise<Quill> {
		const at = canonicalRef.indexOf('@');
		const tree = await this.#loader.loadTree(canonicalRef.slice(0, at), canonicalRef.slice(at + 1));
		return Quill.fromTree(tree);
	}
}

export { create as createQuiver };
