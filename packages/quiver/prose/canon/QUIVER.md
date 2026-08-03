# Quiver

> **Implementation**: `src/` · `src/transports/`

## TL;DR

A quiver is a collection of quills, addressed by ref and resolved to a `Quill`. This package loads one from wherever it lives (an npm package, a directory, a URL, an in-hand manifest) and hands out quills. It never renders: `@quillmark/wasm` does that, and the handles pass to it untouched.

## One authored shape, four ways to consume it

Authors write **one** layout: `Quiver.yaml` at the package root, quills under `quills/<name>/<x.y.z>/`, published as an npm package or a git tag. The deployment-topology decision belongs to the consumer, not the author, so the author flow stays one command and the loaders fan out below it.

The loaders name exactly what they read; there is no auto-detection and no branching on artifact shape.

| Loader | Reads | Where |
| --- | --- | --- |
| `fromPackage(specifier, from?)` | the source layout | `/node` |
| `fromDir(path)` | the source layout | `/node` |
| `fromBuiltDir(path)` | build output | `/node` |
| `Quiver.fromBuiltUrl(url)` | build output | anywhere |
| `Quiver.fromManifest(baseUrl, bytes)` | build output, pointer skipped | anywhere |

The `/node` factories are free functions, not statics: the class stays browser-pure, the entry that reads a filesystem imports nothing onto it, and a bundler drops the verbs a consumer does not call. Construction itself is sealed: `Quiver` has a private constructor and the loader seam is reachable from no entry in `exports`. There is no public transport API (auth headers, custom fetch, `AbortSignal`) and no consumer story asking for one; a sealed seam keeps that option clean, a half-open one lets dependents grow on an unsupported surface.

`fromPackage` and `buildPackage` resolve `<specifier>/Quiver.yaml` from `from`: pass `import.meta.url`. The default (this package's own location) finds only what is hoisted beside `@quillmark/quiver`; under an isolated `node_modules` layout the caller's dependencies are reachable from the caller alone. The resolution also goes through the target's `exports` map, so a quiver published as a package exposes `./Quiver.yaml` there or is unreachable however correct its layout.

Browsers cannot read the source layout, so `build(src, out)` packs it at deploy time and the output is served as static assets. `fromBuiltDir` exists for the server that ships the packed artifact in its own image: it avoids the self-fetch round-trip `fromBuiltUrl` would force on a self-hosted deployment, and lets the source quiver stay a devDependency.

`build` owns `out` outright: it clears the directory before writing, so the previous generation never bleeds into the new one. An `out` that is, or contains, the source quiver or the working directory is refused rather than cleared: `--out .` and a slipped `--out ..` are one keystroke away and the deletion is unrecoverable. An `out` nested *inside* the source (`dist/` under the quiver root) is the ordinary layout and stays allowed, since the scan reads the source before the first write.

## The pointer, and skipping it

`fromBuiltUrl` fetches `<url>/latest.json` first: a stable-named, non-content-addressed pointer to the current manifest. Everything behind it is content-addressed and safe to cache forever; that one filename is not. A CDN edge or a browser cache can serve a stale pointer after a release and silently pin the client to the old catalog, with no error, and per-host cache headers fix one serving layer at a time. The pointer is therefore the one request fetched `no-cache` (revalidate with the origin, a 304 still serving from disk), which closes the browser-cache layer and nothing above it.

A consumer already holding the manifest bytes at build time (the SSR case: it reads the built artifact during its own build) seeds the catalog with `fromManifest` and never requests the pointer. Bundles and fonts are still fetched lazily, content-addressed, relative to `baseUrl`.

## Content addressing is checked, not asserted

Every name but the pointer carries the SHA-256 of what it names, and the loader hashes what arrives before using it: a manifest against the digest in the pointer's filename, a bundle against the digest in the manifest's, a font against its full-width store key. That check is what turns "safe to cache forever" into a property: it catches a corrupted CDN object, a partial sync, and a name reused across releases, and it reports `transport_error`, so the caches that evict on error let a retry succeed. Where no digest primitive exists (`crypto.subtle` is secure-context-only, so a page served over plain `http` to something other than localhost has none) the fetch passes through unchecked rather than failing.

Bundle and manifest names carry 12 hex chars, 48 bits: enough that a new manifest name colliding with a prior release's, which under immutable CDN caching would serve the old catalog forever, is not a birthday problem within any release count a quiver will see. Store keys are the full 64, because the store is keyed by hash and two distinct fonts sharing a prefix would merge into one entry.

One thing the addressing does not yet buy: `build` clears its output, so a client pinned to a stale pointer gets 404s rather than a stale-but-working catalog. An append-only store with garbage collection is the answer, and it only matters once artifacts and clients deploy independently.

## getQuill is the seam

`quiver.getQuill(ref)` is the only way to obtain a quill from a quiver, and the only entry point a consumer needs. It accepts selector refs (`"memo"`, `"memo@1"`) and canonical ones (`"memo@1.0.0"`), resolves the selector, fetches the tree, materializes it through `Quill.fromTree`, and caches one instance per canonical ref for the quiver's lifetime. Concurrent calls for the same ref coalesce into a single load.

Reaching for `Quill.fromTree` inside a quiver consumer bypasses that cache and redoes the work. `Quill.fromTree` is for quills built **outside** a quiver: a server route receiving a raw tree over the network, a test fixture assembling one by hand.

Two narrower verbs sit beside it: `resolve(ref)` returns the canonical ref without materializing anything, and `warm()` prefetches every quill's tree without materializing or needing an engine (a later `getQuill` is then microseconds).

`resolve` is **sync**, and so are `quillNames()` and `versionsOf()`: the catalog is materialized as the quiver is built (`fromBuiltUrl` fetches `latest.json`, `fromDir` scans the source tree), and `QuiverLoader` carries one verb, `loadTree`, which resolution never reaches. A promise there would price I/O the design does not admit.

## The render boundary

This package produces quills; `@quillmark/wasm` renders them. A quill from `getQuill` is engine-free portable data (schema inspection, validation, blueprint access, seeding) and passes straight to `engine.render(quill, doc)`, which routes on `quill.backendId`, lazily loads that backend, clones both handles into its memory, renders, and frees the clones. There is no boundary-crossing step to perform.

The canonical `Quill` / `Document` / `Engine` types are **not** re-exported here. They come from the `@quillmark/wasm` peer, which is their single source of truth and, per the [workspace's dependency law](../../../../prose/canon/DEPENDENCIES.md), the one installed copy whose linear memory every handle indexes into.

`Engine.render`, `open`, `supportedFormats` and `supportsCanvas` are async.

## Errors

Every error is a `QuiverError` carrying a `code`, a human-readable `message`, and the offending `ref` where there is one. The codes are a closed set: `invalid_ref`, `quill_not_found`, `quiver_invalid`, `transport_error`, so a consumer branches on `code` rather than parsing text.

## Author-side harnesses

Two subpaths exist for quiver authors rather than quiver consumers, so a validation failure surfaces on publish instead of on someone else's build.

`/testing` runs `runQuiverTests(import.meta.url, engine)`: it loads with `fromDir`, compiles every quill, and renders each quill's example document. It uses `node:test`, so it adds no test-runner dependency.

`/preview` runs `renderQuiverSamples(import.meta.url, { engine })`: the same sweep, but writing artifacts a human can look at, one rendered file per quill plus an `index.html` gallery, into `outDir` (default `preview/`, with a `.gitignore` written into it so the output is never committed). Samples are seeded with `quill.seedDocument()`, since the blueprint carries `<must-fill>` sentinels and is not directly renderable. A quill that throws is recorded as failed with every diagnostic and the run continues, so one broken quill never hides the rest. `include` / `exclude` narrow the sweep by quill name or canonical ref.
