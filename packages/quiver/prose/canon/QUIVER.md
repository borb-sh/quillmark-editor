# Quiver

> **Implementation**: `src/` · `src/transports/`

## TL;DR

A quiver is a collection of quills, addressed by ref and resolved to a `Quill`. This package loads one from wherever it lives (an npm package, a directory, a URL, an in-hand manifest) and hands out quills. It never renders: `@quillmark/wasm` does that, and the handles pass to it untouched.

## One authored shape, four ways to consume it

Authors write **one** layout: `Quiver.yaml` at the package root, quills under `quills/<name>/<x.y.z>/`, published as an npm package or a git tag. The deployment-topology decision belongs to the consumer, not the author, so the author flow stays one command and the loaders fan out below it.

The loaders name exactly what they read; there is no auto-detection and no branching on artifact shape.

| Loader | Reads | Where |
| --- | --- | --- |
| `fromPackage(specifier)` | the source layout | Node |
| `fromDir(path)` | the source layout | Node |
| `fromBuiltDir(path)` | build output | Node |
| `fromBuiltUrl(url)` | build output | anywhere |
| `fromManifest(baseUrl, bytes)` | build output, pointer skipped | anywhere |

Browsers cannot read the source layout, so `build(src, out)` packs it at deploy time and the output is served as static assets. `fromBuiltDir` exists for the server that ships the packed artifact in its own image: it avoids the self-fetch round-trip `fromBuiltUrl` would force on a self-hosted deployment, and lets the source quiver stay a devDependency.

`build` owns `out` outright — it clears the directory before writing, so the previous generation never bleeds into the new one. An `out` that is, or contains, the source quiver or the working directory is refused rather than cleared: `--out .` and a slipped `--out ..` are one keystroke away and the deletion is unrecoverable. An `out` nested *inside* the source (`dist/` under the quiver root) is the ordinary layout and stays allowed — the scan reads the source before the first write.

## The pointer, and skipping it

`fromBuiltUrl` fetches `<url>/latest.json` first: a stable-named, non-content-addressed pointer to the current manifest. Everything behind it is content-addressed and safe to cache forever; that one filename is not. A CDN edge or a browser cache can serve a stale pointer after a release and silently pin the client to the old catalog, with no error, and per-host cache headers fix one serving layer at a time.

A consumer already holding the manifest bytes at build time (the SSR case: it reads the built artifact during its own build) seeds the catalog with `fromManifest` and never requests the pointer. Bundles and fonts are still fetched lazily, content-addressed, relative to `baseUrl`.

## getQuill is the seam

`quiver.getQuill(ref)` is the only way to obtain a quill from a quiver, and the only entry point a consumer needs. It accepts selector refs (`"memo"`, `"memo@1"`) and canonical ones (`"memo@1.0.0"`), resolves the selector, fetches the tree, materializes it through `Quill.fromTree`, and caches one instance per canonical ref for the quiver's lifetime. Concurrent calls for the same ref coalesce into a single load.

Reaching for `Quill.fromTree` inside a quiver consumer bypasses that cache and redoes the work. `Quill.fromTree` is for quills built **outside** a quiver: a server route receiving a raw tree over the network, a test fixture assembling one by hand.

Two narrower verbs sit beside it: `resolve(ref)` returns the canonical ref without materializing anything, and `warm()` prefetches every quill's tree without materializing or needing an engine (a later `getQuill` is then microseconds).

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
