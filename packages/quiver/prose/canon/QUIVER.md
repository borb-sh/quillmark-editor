# Quiver

> **Implementation**: `src/` · `src/transports/`

## TL;DR

A quiver is a collection of quills, addressed by ref and resolved to a `Quill`. This package loads one from wherever it lives (a source directory, a packed artifact on disk, a URL) and hands out quills. The **loaders** never render: `@quillmark/wasm` does that, and the handles pass to it untouched. The author-side gate is the one thing here that does, since proving a quill renders is what a gate for quills is.

## One authored shape, three ways to consume it

Authors write **one** layout: `Quiver.yaml` at the package root, quills under `quills/<name>/<x.y.z>/`, published as an npm package or a git tag. The deployment-topology decision belongs to the consumer, not the author, so the author flow stays one command and the loaders fan out below it.

The loaders name exactly what they read; there is no auto-detection and no branching on artifact shape.

| Loader | Reads | Where |
| --- | --- | --- |
| `fromDir(path)` | the source layout | `/node` |
| `fromBuiltDir(path)` | build output | `/node` |
| `Quiver.fromBuiltUrl(url)` | build output | anywhere |

Three rows is what a consumer chooses among, and each names a topology someone runs. Reaching a quiver installed from npm is not a fourth: `dirname(createRequire(import.meta.url).resolve('<pkg>/Quiver.yaml'))` handed to `fromDir` or `build` is one line at the call site, where the resolution base belongs to the caller and the `exports`-map subpath it lands on is visible rather than a rule this package documents and holds.

**Every export names `default` beside `import`.** A tool resolving this package from a consumer's tree walks the exports map under CJS conditions whatever its own module system, so a subpath offering `import` alone is invisible to it. Studio's bin resolves this package that way, to pack with the author's own copy rather than one it carries; `@quillmark/wasm` already names both, which is why the engine discovery in `test` works at all.

The `/node` factories are free functions, not statics: the class stays browser-pure, the entry that reads a filesystem imports nothing onto it, and a bundler drops the verbs a consumer does not call. `fromBuiltUrl` is the only static, so `Quiver` is a class a consumer constructs one way. Construction itself is sealed: `Quiver` has a private constructor and the loader seam is reachable from no entry in `exports`. There is no public transport API (auth headers, custom fetch, `AbortSignal`) and no consumer story asking for one; a sealed seam keeps that option clean, a half-open one lets dependents grow on an unsupported surface.

Browsers cannot read the source layout, so `build(src, out)` packs it at deploy time and the output is served as static assets. `fromBuiltDir` exists for the server that ships the packed artifact in its own image: it avoids the self-fetch round-trip `fromBuiltUrl` would force on a self-hosted deployment, and lets the source quiver stay a devDependency. It carries `transports/fs-built-transport.ts` and the path-escape validation reading manifest-named files off a disk needs.

`build` owns `out` outright: it clears the directory before writing, so the previous generation never bleeds into the new one. An `out` that is, or contains, the source quiver or the working directory is refused rather than cleared: `--out .` and a slipped `--out ..` are one keystroke away and the deletion is unrecoverable. An `out` nested *inside* the source (`dist/` under the quiver root) is the ordinary layout and stays allowed, since the scan reads the source before the first write.

## The pointer

`fromBuiltUrl` fetches `<url>/latest.json` first: a stable-named, non-content-addressed pointer to the current manifest. Everything behind it is content-addressed and safe to cache forever; that one filename is not. A CDN edge or a browser cache can serve a stale pointer after a release and silently pin the client to the old catalog, with no error, and per-host cache headers fix one serving layer at a time. The pointer is therefore the one request fetched `no-cache` (revalidate with the origin, a 304 still serving from disk), which closes the browser-cache layer and nothing above it.

**The pointer states the format, and is the one document here that reads past what it knows.** Skew is the ordinary case rather than the broken one: a collection is packed by whatever copy of this package the author's CI installs, and read by the copy frozen inside whichever client is laid over it. `latest.json` is what a reader of any age fetches first, so it is where a format change announces itself — which works only if unknown keys pass through, since a pointer parsed strictly refuses the announcement along with everything else. A `format` above the reader's is named as such, with the upgrade named too; absent means a build from before the marker, which is format 1. The manifest behind it stays closed, carrying its own `version` and rejecting fields it does not know: it is reached only once the format is agreed.

The fetch is unconditional: there is no door that seeds the catalog from manifest bytes a consumer already holds. It would close one layer above the one `no-cache` closes, for an SSR consumer that does not exist, and the shape is recoverable from `fromBuiltUrl` when one does.

## Content addressing is checked, not asserted

Every name but the pointer carries the SHA-256 of what it names, and the loader hashes what arrives before using it: a manifest against the digest in the pointer's filename, a bundle against the digest in the manifest's, a font against its full-width store key. That check is what turns "safe to cache forever" into a property: it catches a corrupted CDN object, a partial sync, and a name reused across releases, and it reports `transport_error`, so the caches that evict on error let a retry succeed. Where no digest primitive exists (`crypto.subtle` is secure-context-only, so a page served over plain `http` to something other than localhost has none) the fetch passes through unchecked rather than failing.

Bundle and manifest names carry 12 hex chars, 48 bits: enough that a new manifest name colliding with a prior release's, which under immutable CDN caching would serve the old catalog forever, is not a birthday problem within any release count a quiver will see. Store keys are the full 64, because the store is keyed by hash and two distinct fonts sharing a prefix would merge into one entry.

One thing the addressing does not yet buy: `build` clears its output, so a client pinned to a stale pointer gets 404s rather than a stale-but-working catalog. An append-only store with garbage collection is the answer, and it only matters once artifacts and clients deploy independently.

## getQuill is the seam

`quiver.getQuill(ref)` is the only way to obtain a quill from a quiver, and the only entry point a consumer needs. It accepts selector refs (`"memo"`, `"memo@1"`) and canonical ones (`"memo@1.0.0"`), resolves the selector, fetches the tree, materializes it through `Quill.fromTree`, and caches one instance per canonical ref for the quiver's lifetime. Concurrent calls for the same ref coalesce into a single load.

Reaching for `Quill.fromTree` inside a quiver consumer bypasses that cache and redoes the work. `Quill.fromTree` is for quills built **outside** a quiver: a server route receiving a raw tree over the network, a test fixture assembling one by hand.

One narrower verb sits beside it: `resolve(ref)` returns the canonical ref without materializing anything.

The quill cache is the only one. A fetched tree lives for the length of the materialization that consumes it and no longer: a second cache holding trees would buy a retry after a `Quill.fromTree` throw its refetch, which is a round-trip saved on the path where the quill is broken, against a cache to evict, coalesce and reason about on every path where it is not.

`resolve` is **sync**, and so are `quillNames()` and `versionsOf()`: the catalog is materialized as the quiver is built (`fromBuiltUrl` fetches `latest.json`, `fromDir` scans the source tree), and `QuiverLoader` carries one verb, `loadTree`, which resolution never reaches. A promise there would price I/O the design does not admit.

## The render boundary

This package produces quills; `@quillmark/wasm` renders them. A quill from `getQuill` is engine-free portable data (schema inspection, validation, blueprint access, seeding) and passes straight to `engine.render(quill, doc)`, which routes on `quill.backendId`, lazily loads that backend, clones both handles into its memory, renders, and frees the clones. There is no boundary-crossing step to perform.

The canonical `Quill` / `Document` / `Engine` types are **not** re-exported here. They come from the `@quillmark/wasm` peer, which is their single source of truth: the one installed copy whose linear memory every handle indexes into (`check:deps`).

`Engine.render`, `open`, `supportedFormats` and `supportsCanvas` are async.

## Errors

Every error is a `QuiverError` carrying a `code`, a human-readable `message`, and the offending `ref` where there is one. The codes are a closed set: `invalid_ref`, `quill_not_found`, `quiver_invalid`, `transport_error`, so a consumer branches on `code` rather than parsing text.

## The author-side gate

One verb exists for quiver authors rather than quiver consumers, so a validation failure surfaces on publish instead of on someone else's build.

**`quiver test`** is that verb, the `bin` npm links into `node_modules/.bin`. It loads with `fromDir`, then compiles and renders every quill's example document, seeded with `quill.seedDocument()` since the blueprint carries `<must-fill>` sentinels and is not directly renderable. An author names it once in `scripts` and writes no file. It discovers the engine itself: a named `engine` export from `quiver.config.js` at the collection root, else `@quillmark/wasm` resolved from the collection's own `node_modules`. `quiver build [--out <dir>]` is the other verb, and the two are the whole of the bin.

**One door, so the loop and the engine contract have one home each.** A second entry onto the same verdict copies both, and a caller-supplied engine gates nothing about the discovery the bin does, so the two answer differently under one name. An author on vitest, jest or another runner spawns the bin (`execFileSync('quiver', ['test'])`) and gates what CI gates. The suite spawns it against the reference quiver, since nothing that imports a module proves a surface reached through a linked bin.

**The gate instantiates the core.** Every `@quillmark/wasm` export throws `runtime::not_initialized` until `init()` resolves, and `new Engine()` is lazy, so a gate that skips it reports an uninitialized runtime as a failing quill.

`build` and `test` are the whole of what this package gives a quill author. The gate is what an author is **blocked on**: it runs in their CI, against their own wasm, and installs a loader rather than an app. Looking at rendered output needs a browser, a paint loop and chrome, so it is an app on top of this package rather than a subpath inside it ([STUDIO.md](../../../studio/prose/canon/STUDIO.md)).
