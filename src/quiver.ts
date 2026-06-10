/**
 * Quiver — primary runtime abstraction for a collection of quills.
 *
 * Polymorphism via composition: internally stores a pluggable loader
 * (either source-backed or build-output-backed).
 *
 * This module is browser-safe: only `fromBuiltUrl` and the instance API live
 * here. Node-only factories (`fromDir`, `fromPackage`, `fromBuiltDir`,
 * `build`) are installed on this class by `./node.js`, which is the
 * consumer's explicit opt-in to the Node API surface.
 */

import { QuiverError } from "./errors.js";
import { Quill } from "@quillmark/wasm";
import { parseQuillRef } from "./ref.js";
import { matchesSemverSelector, chooseHighestVersion } from "./semver.js";

/** @internal Internal loader strategy: source or build output. */
export interface QuiverLoader {
  loadTree(name: string, version: string): Promise<Map<string, Uint8Array>>;
}

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
   * Cache of fetched trees, keyed by canonical ref. Populated by `warm()`
   * and on first `getQuill` for a ref; an entry is evicted once its quill
   * materializes successfully. Promise values so concurrent fetches coalesce.
   */
  readonly #treeCache: Map<string, Promise<Map<string, Uint8Array>>> = new Map();

  /**
   * Private constructor — use static factory methods (`Quiver.fromBuiltUrl`,
   * or the Node-only `Quiver.fromDir` / `Quiver.fromPackage` /
   * `Quiver.fromBuiltDir` installed by `@quillmark/quiver/node`). TS prevents
   * external `new Quiver(...)` at compile time.
   */
  private constructor(
    name: string,
    catalog: Map<string, string[]>,
    loader: QuiverLoader,
  ) {
    this.name = name;
    this.#catalog = new Map(catalog);
    this.#loader = loader;
  }

  /**
   * @internal Construction escape hatch around the private constructor. Used
   * by `loadBuiltQuiver` and by the Node entry (`./node.js`) when installing
   * `fromDir` / `fromPackage`. Not part of the public API.
   */
  static _fromLoader(
    name: string,
    catalog: Map<string, string[]>,
    loader: QuiverLoader,
  ): Quiver {
    return new Quiver(name, catalog, loader);
  }

  /**
   * Browser-safe factory. Loads build output from an HTTP/HTTPS URL.
   *
   * Origin-relative URLs (e.g. `/quivers/foo/`) are accepted in browser
   * environments. `file://` URLs are rejected — to load build output from
   * disk in Node, use `Quiver.fromBuiltDir(path)` from
   * `@quillmark/quiver/node`.
   *
   * Throws `transport_error` on network/HTTP failure, `quiver_invalid`
   * on format errors.
   */
  static async fromBuiltUrl(url: string): Promise<Quiver> {
    if (url.startsWith("file://")) {
      throw new QuiverError(
        "transport_error",
        `Quiver.fromBuiltUrl requires an http(s):// or origin-relative URL; got "${url}". For local build output, use Quiver.fromBuiltDir from @quillmark/quiver/node.`,
      );
    }
    const { HttpTransport } = await import("./transports/http-transport.js");
    const { loadBuiltQuiver } = await import("./built-loader.js");
    const transport = new HttpTransport(url);
    return loadBuiltQuiver(transport);
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
   * Throws:
   *   - `invalid_ref` if ref fails parseQuillRef
   *   - `quill_not_found` if no version matches
   */
  async resolve(ref: string): Promise<string> {
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
      "quill_not_found",
      `No quill found for ref "${ref}" in quiver "${this.name}".`,
      { ref, quiverName: this.name },
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
   * Throws:
   *   - `invalid_ref` if ref is malformed
   *   - `quill_not_found` if ref does not match any version in this quiver
   *   - propagates I/O errors from the loader unchanged
   *   - propagates validation errors from Quill.fromTree() unchanged
   */
  async getQuill(ref: string): Promise<Quill> {
    const canonicalRef = await this.resolve(ref);

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
   * Internal: load tree (cached) + construct via Quill.fromTree. Errors
   * propagate. On success the tree is evicted from `#treeCache` (the quill
   * cache now holds the materialized result), so the tree is not retained
   * past materialization. On `Quill.fromTree` failure the tree stays cached,
   * so a retry skips the refetch.
   */
  async #materializeQuill(canonicalRef: string): Promise<Quill> {
    const entry = this.#getTreeCached(canonicalRef);
    const tree = await entry;
    const quill = Quill.fromTree(tree);
    // Evict by identity: only drop the entry if it is still the promise this
    // materialization consumed (a concurrent refetch may have replaced it).
    if (this.#treeCache.get(canonicalRef) === entry) {
      this.#treeCache.delete(canonicalRef);
    }
    return quill;
  }

  /**
   * Internal: tree cache reader. On miss, fetches via `#loadTree` and stores
   * the in-flight Promise. On rejection, evicts so a retry can succeed.
   */
  #getTreeCached(canonicalRef: string): Promise<Map<string, Uint8Array>> {
    let entry = this.#treeCache.get(canonicalRef);
    if (entry === undefined) {
      const at = canonicalRef.indexOf("@");
      const name = canonicalRef.slice(0, at);
      const version = canonicalRef.slice(at + 1);
      entry = this.#loadTree(name, version).catch((err) => {
        this.#treeCache.delete(canonicalRef);
        throw err;
      });
      this.#treeCache.set(canonicalRef, entry);
    }
    return entry;
  }

  /**
   * Internal: validates name/version against the catalog, then delegates to
   * the loader. Returns `Map<string, Uint8Array>` suitable for
   * `Quill.fromTree(tree)`. Does NOT cache — caching lives in `#getTreeCached`.
   *
   * Throws `transport_error` if name/version not in catalog or I/O fails.
   */
  async #loadTree(
    name: string,
    version: string,
  ): Promise<Map<string, Uint8Array>> {
    const versions = this.#catalog.get(name);
    if (!versions || !versions.includes(version)) {
      throw new QuiverError(
        "transport_error",
        `Quill "${name}@${version}" not found in quiver "${this.name}"`,
        { quiverName: this.name, version, ref: `${name}@${version}` },
      );
    }
    return this.#loader.loadTree(name, version);
  }

  /**
   * Prefetches the tree for every quill version in this quiver. Fail-fast.
   *
   * Network-bound only — does not materialize Quill instances and does not
   * require an engine. Subsequent `getQuill` calls reuse the cached trees,
   * skipping the fetch (the tree then evicts as its quill materializes).
   * Rejects on the first fetch failure.
   */
  async warm(): Promise<void> {
    const promises: Promise<unknown>[] = [];
    for (const name of this.quillNames()) {
      for (const version of this.versionsOf(name)) {
        promises.push(this.#getTreeCached(`${name}@${version}`));
      }
    }
    await Promise.all(promises);
  }
}
