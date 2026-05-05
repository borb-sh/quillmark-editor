# Program: Quivers Rewrite (`@quillmark/quiver`)

**Status:** Updated for upstream Quillmark Render API overhaul  
**Audience:** Senior engineer planning and executing V1  
**Scope:** This document applies only to the **Node/npm** package **`@quillmark/quiver`**: a smaller surface than `@quillmark/registry`, aligned with the **JavaScript/WASM** Quillmark bindings (not Python or other language bindings).

## Summary

V1 still introduces Quivers as the primary runtime abstraction, but one boundary changed materially upstream:

- Quillmark no longer owns a quill registry
- Rendering lives on `Quill` (`quill.render(...)`), not the engine
- Engine is now a backend registry + quill factory (`engine.quill(tree)` on the Quillmark WASM binding, typically `@quillmark/wasm`)

This means Quiver must own quill selection and lifecycle entirely. There is no engine `registerQuill`, `hasQuill`, or engine-level render hot path to optimize around.

---

## Core Decisions

### 1) One Authored Shape; A Build Output Derived From It

There is one user-facing shape: the **Source Quiver**.

- Human-authored, git-friendly
- Root `Quiver.yaml`
- Quills under `quills/<name>/<version>/Quill.yaml`
- Assets in normal source layout

A build step (`Quiver.build`) derives a **runtime artifact** from the source.
This artifact is not a peer "format" — it is the source layout's `dist/`
output, optimized for browser delivery (hashed manifest, per-quill bundle
zips, dehydrated shared font store, stable pointer file). Authors do not
version it, publish it, or check it into git.

Loaders are paired 1:1 with what they load:

- `Quiver.fromPackage(specifier)` and `Quiver.fromDir(path)` load the
  **source** layout (Node only).
- `Quiver.fromBuiltUrl(url)` loads the **build output** over HTTP/HTTPS
  (browser-safe; works in Node too).
- `Quiver.fromBuiltDir(path)` loads the **build output** from a local
  directory (Node only).

There is no auto-detection: each loader's name commits to what it expects.

**Naming decisions:**
- The verb is `build()`. Pairs with the `fromBuilt*` family (past participle
  = "the built one"). Avoids collision with `npm pack`, JS bundler
  vocabulary, and the internal "bundle zips" term.
- Loaders for source layouts are named by **where the source lives**
  (`Package` / `Dir`). Loaders for build output are named by **what** they
  load (`Built`) plus **where** they load it from (`Url` / `Dir`). The
  artifact type stays in the name; the transport disambiguates.
- Server-side runtime (Node) reads packed artifacts from disk via
  `fromBuiltDir`. This is the recommended shape when the runtime artifact
  ships in the deployment image: source quivers stay as devDependencies,
  there is no self-fetch over a load balancer / CDN, and serverless bundle
  sizes are minimised.

### 2) `Quiver.yaml` Is Required in Source Quivers

Source Quivers require root `Quiver.yaml` metadata.

Fields for V1:

- `name` (required) — runtime namespace identity; may differ from npm package name. Charset: alphanumeric only (`[A-Za-z0-9_-]+`).
- `description` (optional) — tooling-only metadata in V1; not consumed by runtime paths.

Unknown fields in `Quiver.yaml` are a **validation error** (`quiver_invalid`). Strict-by-default keeps forward compatibility explicit: any future field is additive and requires a schema bump.

`package.json.version` remains npm-channel identity; packed artifact identity remains hashed-manifest based.

### 3) `QuillSource` Becomes Quiver-Centric

- Re-express `QuillSource` concepts around Quivers
- Four loaders, each with one input shape and one shape-of-thing-loaded:
  - `Quiver.fromPackage(specifier)` — Node-only; resolves an npm specifier
    against `node_modules` and loads the source layout at the package root
  - `Quiver.fromDir(path)` — Node-only; loads source layout from a local
    directory. Also accepts `import.meta.url`-style `file://` URLs as a
    convenience for tests (the URL's parent directory is used)
  - `Quiver.fromBuiltUrl(url)` — browser-safe; loads build output from an
    `http(s)://` or origin-relative URL
  - `Quiver.fromBuiltDir(path)` — Node-only; loads build output from a
    local directory (the output of `Quiver.build`)
- "Transport" is not a first-class concept; HTTP fetching is an internal
  detail of `fromBuiltUrl`, filesystem access is an internal detail of
  `fromBuiltDir`

### 4) Single-Quiver Scope (V1)

V1 has no multi-quiver composition layer. Each `Quiver` instance is
independent: consumers load one quiver and call `resolve` / `getQuill` /
`warm` directly on it. There is no `QuiverRegistry`.

If composition becomes a real use case, the additive path is a thin
`Quiver.compose([a, b, ...])` factory that returns a quiver-shaped
composite — it is intentionally out of scope for V1.

### 5) Semver Selector Rules Are Strict and Small

Supported forms:

- `name` (highest version in first-winning quiver)
- `name@x.y.z` exact
- `name@x.y` highest `x.y.*`
- `name@x` highest `x.*.*`

Not supported in V1:

- ranges (`>=`, `<`, etc.)
- npm operators (`^`, `~`)
- wildcards (`*`)
- prerelease/build metadata

Canonical version format:

- `x.y.z` only
- applies to quill version directories (`quills/<name>/<version>/`)
- non-canonical versions on disk are validation errors

Canonicalization:

- resolve selector to canonical ref once per call to `getQuill`
- key the tree cache by canonical ref; key the quill cache by (engine, canonical-ref)

### 6) Warm/Prefetch Is Purely a Quiver Concern

`warm()` is the network prefetch step. It fetches every quill's tree and
populates the per-quiver tree cache. It does **not** materialize Quill
instances and does **not** require an engine — `engine.quill(tree)` is
microseconds and runs lazily inside `getQuill`. A subsequent `getQuill`
reuses the cached tree, so the network fetch isn't paid twice.

Tree cache lifecycle:

- `warm()` populates the tree cache.
- First `getQuill(ref, { engine })` reads the tree, materializes the
  Quill via `engine.quill(tree)`, then evicts the tree so its bytes can
  be GC'd. The materialized Quill is what's kept (per engine).
- If `engine.quill` throws, the tree is retained so a retry skips the
  network.
- Repeated `getQuill` on the same engine hits the per-engine quill cache
  — no tree access at all.
- A subsequent `getQuill` for a different engine refetches the tree
  (single-engine apps never pay this cost).

Other invariants:

- `resolve()` works whether or not anything is warmed.
- Warm semantics are identical for source-loaded and built-output-loaded
  quivers; the loader hides the difference.

### 7) Engine Boundary: New Canonical Contract (Node / JS–WASM only)

Quillmark integration for `@quillmark/quiver` is:

1. Initialize engine once (`new Quillmark()` from `@quillmark/wasm`)
2. When quill bytes are ready, build a render-ready quill with `engine.quill(tree)` (`Map<string, Uint8Array>`)
3. Render through the returned quill: `quill.render(doc, opts?)` (`Document` — built via `Document.fromMarkdown(...)`)

Important implications:

- No engine quill registry in the JS binding; no `registerQuill`, `hasQuill`, or engine-level `render(doc)` in Quiver’s flow
- Quiver owns mapping from canonical ref → in-memory tree → `Quill` instance
- Cache optimization is in-process reuse of `Quill` instances, not registration checks
- Path-based loading (`quill_from_path`) exists in **other** bindings only; in Node, Quiver reads files and assembles `tree` for `engine.quill(tree)` (see the upstream `@quillmark/wasm` JS/WASM API docs)

For advanced dynamic-asset behavior, defer to Quillmark’s JS/WASM docs; the default integration path here is `engine.quill` + `quill.render`.

### 8) Markdown and Ref Parsing Boundary

- Markdown parsing does not require a quill registry: `Document.fromMarkdown(markdown)`
- Quiver owns ref parsing and selector resolution for its own API (`resolve`, `getQuill`, `warm`, validation)
- QUILL field is informational at render time; Quiver routes to the intended quill explicitly without mutating the parsed document in V1

Upstream behavior note:

- If rendering a parsed document whose `quill_ref` differs from selected quill name, render proceeds with warning `quill::ref_mismatch`
- Quiver should surface that warning, not suppress it. In V1, this is an intentional loud footgun detector for ref/selection drift.

### 9) Distribution Strategy

**Source-first distribution.** The published artifact is the **Source
Quiver** — an npm package whose root contains `Quiver.yaml`. Consumers
choose how to consume it:

- **Node consumers** load the source layout directly:
  ```ts
  const quiver = await Quiver.fromPackage("@org/my-quiver");
  ```
- **Browser consumers** run a build step against the resolved source dir
  and serve the output as static assets:
  ```ts
  // build step (Node)
  await Quiver.build("./node_modules/@org/my-quiver", "./public/quivers/my-quiver");
  // browser runtime
  const quiver = await Quiver.fromBuiltUrl("/quivers/my-quiver/");
  ```
- **Node server-side runtime consumers** also run the build step, ship the
  packed artifact in their deployment image, and load it from disk:
  ```ts
  await Quiver.build("./node_modules/@org/my-quiver", "./static/quills/my-quiver");
  // server runtime
  const quiver = await Quiver.fromBuiltDir("./static/quills/my-quiver");
  ```
  This keeps source quivers as devDependencies and avoids self-fetching
  through the deployment's load balancer / CDN.

Rationale:

- Author release pipeline is `npm publish` (or `git tag`). No second
  artifact, no CDN, no hash bookkeeping outside the npm tarball.
- Deployment topology is the consumer's concern, not the author's.
- The runtime artifact is a build output of the source, not a peer
  distribution shape (see §1).

**Pre-built distribution as a published artifact is supported but not
the default.** Authors who need to ship runtime-ready output directly
(e.g. their consumers cannot run a Node build step) may publish
`Quiver.build(...)` output to a CDN and instruct consumers to use
`Quiver.fromBuiltUrl(<cdn-url>)`. Treated as the exception.

Validation responsibility shifts left: authors should run
`Quiver.fromDir` and `Quiver.build` in CI so `quiver_invalid` errors
surface on publish, not on the consumer's build. The bundled
`@quillmark/quiver/testing` harness covers this.

---

## Carryover Matrix (What We Keep)

V1 intentionally retains:

1. Font dehydration as a build-output property
2. Consumer validation tooling for source layouts (+ optional build-parity checks)
3. Manifest pointer resolution for build output
4. HTTP/HTTPS loading via `Quiver.fromBuiltUrl`
5. Filesystem loading of build output via `Quiver.fromBuiltDir` for Node
   server-side runtimes
6. Source layout loading as first-class dev loop (`fromPackage` / `fromDir`)
7. Typed errors (`QuiverError`) with quiver/source context
8. Concurrency coalescing for in-flight loads
9. Preload/fail-fast helpers where they still add value

Removed from carryover assumptions:

- Any engine-registration cache fast path (`register`/`has`) because upstream removed the capability
- "Transport" as a user-facing concept (folded into `fromBuiltUrl` /
  `fromBuiltDir` internals)

---

## Explicit Trims (Surface Reduction)

V1 should trim public API where behavior can stay internal:

- Drop internal-only utility exports
- Keep engine payload and loader internals opaque
- Consolidate validation exports
- Avoid duplicate entry points for equivalent validation workflows
- Do not expose internal quill-object cache mechanisms as public contract

---

## Error Model

Single `QuiverError` class with `code: string` + contextual payload (ref, version, quiver name, underlying cause where applicable). No subclasses. Fail-fast: operations throw on first failure; no aggregate/partial-success results in V1.

V1 code catalog (closed set):

| Code | Fires when |
|---|---|
| `invalid_ref` | Malformed ref string at `resolve()`/`warm()` boundary (fails `parseQuillRef`) |
| `quill_not_found` | Selector did not match any quill in the quiver |
| `quiver_invalid` | `Quiver.yaml` or hashed manifest malformed, unknown field, non-canonical version on disk, or font/bundle hash mismatch |
| `transport_error` | I/O failure: missing path, HTTP non-2xx, network error, permission error. Wraps underlying cause. |

Notes:
- `quill_not_found` is selector-resolution failure within a quiver's catalog.
- `transport_error` is artifact access failure (filesystem/HTTP/network/permissions), including missing packed files and HTTP 404.
- Legacy categories such as `manifest_invalid`, `quill_load_failed`, and `backend_not_found` are folded into `quiver_invalid` or `transport_error` in V1.

Errors must include offending ref/version/quiver identifiers when available.

---

## Runtime + Build Model

V1 runtime loading paths:

1. `Quiver.fromPackage(specifier)` — npm package resolution; loads source
   (authoring/dev/Node runtime)
2. `Quiver.fromDir(path)` — local directory; loads source (Node)
3. `Quiver.fromBuiltUrl(url)` — HTTP(S); loads build output (browser; also
   works in Node)
4. `Quiver.fromBuiltDir(path)` — local directory; loads build output
   (Node server-side runtime)

V1 build behavior:

- `Quiver.build(srcDir, outDir)` produces the runtime artifact from a
  source layout
- output includes pointer + hashed manifest + bundles + dehydrated font store
  (see "Runtime Artifact Format" below)

Execution behavior:

- Quiver resolves selector -> canonical ref
- Quiver loads/creates a render-ready `Quill` via engine factory
- Quiver reuses loaded quill objects by canonical ref
- Quiver renders through `quill.render(...)`

Caching scope:

- In V1, loaded-quill object reuse is in scope
- Cache eviction policy is out of scope for V1 (can be added as an additive lifecycle control later)

---

## Source Quiver Layout (normative)

```
<root>/
  Quiver.yaml
  quills/
    <name>/
      <version>/           # canonical x.y.z
        Quill.yaml
        ...                # quill-local templates, partials, assets, fonts
```

- All assets (including fonts) are **quill-local**. No quiver-level shared asset directory in V1.
- Non-canonical version directories are a validation error (`quiver_invalid`).
- Dedup of identical fonts across quills happens at pack time (into `store/<md5>`), not at the source layer.

## Runtime Artifact Format (normative)

Produced by `Quiver.build()`. Authors do not author this layout; consumers
do not need to inspect it. It is an implementation detail of build output,
specified here only because loaders must agree on its shape.

```
<root>/
  Quiver.json                              # stable pointer, always this filename
  manifest.<md5>.json                      # hashed manifest, content-addressed
  <name>@<version>.<md5>.zip               # one bundle per quill, content-addressed
  store/
    <md5>                                  # raw font bytes, no extension
```

**Hash:** MD5 prefix-6, computed with `node:crypto` at `build()` time only (dev/tooling; not browser runtime).

**Pointer** `Quiver.json`:
```json
{ "manifest": "manifest.abc123.json" }
```

**Hashed manifest** `manifest.<md5>.json`:
```json
{
  "version": 1,
  "name": "<quiver-name>",
  "quills": [
    {
      "name": "usaf_memo",
      "version": "1.2.3",
      "bundle": "usaf_memo@1.2.3.def456.zip",
      "fonts": { "fonts/roboto.ttf": "md5abc", "fonts/arial.ttf": "md5def" }
    }
  ]
}
```

**Bundle zips** contain pure quill content (`Quill.yaml` + templates + partials + non-font assets). Fonts are dehydrated at build time: their bytes live only in `store/<md5>`; their path→hash mapping lives only in the hashed manifest. Bundles do **not** embed a `fonts.json`.

Rehydration on load: the loader fetches the pointer → hashed manifest → required bundle(s) → required `store/<md5>` blobs; library reconstructs the full in-memory tree and builds a render-ready quill via `engine.quill(tree)`.

## API Surface (V1)

Single class, four loaders + one builder. Each loader has one input
shape and one shape-of-thing-loaded; no auto-detection.

```ts
class Quiver {
  // Node-only loader: resolve an npm specifier against node_modules and
  // load the source layout at the package root.
  // (From `@quillmark/quiver/node`.)
  static fromPackage(specifier: string): Promise<Quiver>;

  // Node-only loader: load source layout from a local directory.
  // Also accepts `import.meta.url`-style `file://` URLs (the URL's parent
  // directory is used) as a convenience for tests.
  // (From `@quillmark/quiver/node`.)
  static fromDir(pathOrFileUrl: string): Promise<Quiver>;

  // Browser-safe loader: load build output from an http(s):// or
  // origin-relative URL. Throws `transport_error` on file:// inputs.
  // (From `@quillmark/quiver` main.)
  static fromBuiltUrl(url: string): Promise<Quiver>;

  // Node-only loader: load build output from a local directory (the
  // output of Quiver.build). No network. Use for server-side runtime
  // when the packed artifact ships in the deployment image.
  // (From `@quillmark/quiver/node`.)
  static fromBuiltDir(dirPath: string): Promise<Quiver>;

  // Node-only tooling: produce the runtime artifact from a source layout.
  // (From `@quillmark/quiver/node`.)
  static build(sourceDir: string, outDir: string, opts?: BuildOptions): Promise<void>;

  readonly name: string; // from Quiver.yaml

  // Read-only introspection and lazy tree access; also used internally by
  // resolve/getQuill/warm.
  quillNames(): string[];                                              // sorted lex
  versionsOf(name: string): string[];                                  // sorted desc
  loadTree(name: string, version: string): Promise<Map<string, Uint8Array>>;

  // Selector ref -> canonical ref. Throws invalid_ref / quill_not_found.
  resolve(ref: string): Promise<string>;

  // Selector or canonical ref -> render-ready quill handle (materialized via
  // engine.quill(tree), cached per (engine, canonical-ref)).
  getQuill(ref: string, opts: { engine: Quillmark }): Promise<Quill>;

  // Prefetches every quill tree (network-only; engine not required).
  // Subsequent getQuill calls reuse the cached tree. Fail-fast.
  warm(): Promise<void>;
}

class QuiverError extends Error {
  code: "invalid_ref" | "quill_not_found" | "quiver_invalid" | "transport_error";
  // plus contextual payload fields
}
```

**No render wrapper.** Callers invoke `quill.render(doc, opts?)` (and `quill.open(doc)` when needed) after `getQuill()`. Quiver never mirrors Quillmark render APIs.

**Internal (not exported):** `BuiltManifest` (runtime shape), `parseQuillRef`, in-flight coalescing state, source-vs-built layout detection.

Hot-path flow:
```ts
const doc = Document.fromMarkdown(md);
const quill = await quiver.getQuill(doc.quillRef, { engine });
const result = quill.render(doc, { format: "pdf" });
```

## Package Structure

**Name:** `@quillmark/quiver`

**Entrypoints:**
- `@quillmark/quiver` (main, browser-safe): `Quiver` class with only
  `fromBuiltUrl` functional (Node-only loaders/builder throw
  `transport_error` if reached in browser), `QuiverError`,
  `QuillmarkLike`, `QuillLike`, shared types.
- `@quillmark/quiver/node`: adds `Quiver.fromPackage`, `Quiver.fromDir`,
  `Quiver.fromBuiltDir`, `Quiver.build` behaviors. Single `Quiver` class —
  Node-only factories fail fast outside Node.
- `@quillmark/quiver/testing` (Node-only): single export
  `runQuiverTests(metaUrlOrDir, engine)` built on `node:test` (zero
  external test-runner dependency). Optional convenience; users on other
  test runners wire their own loops against the main API.

**Dependencies:**
- Peer: `@quillmark/wasm@>=0.71.0` with `Quillmark`, `Document.fromMarkdown`, `engine.quill(tree)`, and `quill.render(doc, opts?)` APIs.
- Runtime: `fflate ^0.8.2` for zip read/write (Node + browser)
- Dev-only: `node:crypto` (MD5 hashing in `build()` — never reached at runtime)
- No test-runner peer dependency; `/testing` uses `node:test` (built-in)

---

## Out of Scope for V1

- Non-Node consumers of Quillmark (e.g. Python bindings, Rust CLI) as deliverables of this program — `@quillmark/quiver` is the Node/npm package only
- Quiver CLI (`quiver init`, etc.)
- prerelease semver support
- semver range expression support
- quiver-declared precedence/priority
- inter-quiver dependency graph in `Quiver.yaml`
- marketplace/discovery service
- advanced warm strategies beyond API-compatible hooks
- multi-quiver composition (single quiver per consumer in V1)

---

## Planner Questions — Resolved

All V1 planner questions resolved; implementation plan can proceed against the spec above.

1. ~~Final `Quiver` interface shape and transport factoring style~~ → Single `Quiver` class, four loaders (`fromPackage`, `fromDir`, `fromBuiltUrl`, `fromBuiltDir`) + one builder (`build`). Each loader names what it loads (source/built) and where it loads from (package/dir/url); no auto-detection.
2. ~~Final `Quiver.yaml` schema and unknown-field policy~~ → See §2: alphanumeric `name` and optional tooling-only `description`. Unknown fields are `quiver_invalid`.
3. ~~Canonical ref grammar and parser API contract~~ → Internal `parseQuillRef`, not exported. Selector syntax per §5. Throws `invalid_ref`.
4. ~~Exact warning policy for shadowed refs across quivers~~ → N/A in V1: no multi-quiver composition layer; each `Quiver` instance is independent (§4).
5. ~~Validation API shape consolidation~~ → No separate validation API. Validation errors surface as `QuiverError('quiver_invalid')` during load or `build()`.
6. ~~Build output directory structure~~ → See "Runtime Artifact Format (normative)".
7. ~~Node/browser entrypoint split~~ → See "Package Structure": main + `/node` subpath, single `Quiver` class.
8. ~~Final exported type names~~ → `Quiver`, `QuiverError`. Hot-path entry is `Quiver.getQuill(ref, { engine })`.

---

## Success Criteria

- A team can author and validate a Source Quiver locally with fast filesystem loops
- Build output can be loaded over HTTP/HTTPS with parity behavior in browser and Node
- Each loader names exactly what it loads — no auto-detection, no ambiguous return shape
- Multi-quiver resolution is deterministic and matches precedence hard-filter rules
- Selector behavior is predictable and explicitly documented
- Quiver (Node) integrates via `engine.quill(tree)` + `quill.render(...)` only (no engine quill registration path)
- Public API surface is smaller and clearer than `@quillmark/registry`
