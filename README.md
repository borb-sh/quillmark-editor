# @quillmark/quiver

Load and build collections of quills for rendering with `@quillmark/wasm`.

## Install

```bash
npm install @quillmark/quiver @quillmark/wasm
```

## Distribution model

A Quiver has one authored shape: the **source layout** (`Quiver.yaml` at the
package root, quills under `quills/<name>/<x.y.z>/`). Authors publish it as
an npm package. Consumers decide how to consume it:

- **Node consumers** load the source layout directly with `Quiver.fromPackage`,
  or load a packed (build-output) artifact from disk with
  `Quiver.fromBuiltDir`.
- **Browser consumers** run `Quiver.build(...)` as a build step and serve the
  output as static assets, loading it with `Quiver.fromBuiltUrl`.

Each loader names exactly what it loads. Source: `fromPackage(specifier)`,
`fromDir(path)`. Build output: `fromBuiltUrl(url)` (HTTP/HTTPS, browser-safe),
`fromBuiltDir(path)` (filesystem, Node-only). No auto-detection, no branching
on artifact shape.

This keeps the author flow to a single command (`npm publish` or `git tag`)
and puts the deployment-topology decision where it belongs: with the
consumer.

## The render model

`@quillmark/quiver` produces quills; `@quillmark/wasm` renders them.

- `quiver.getQuill(ref)` returns a core `Quill` — engine-free, portable data,
  good for schema inspection, validation, blueprint access, and seeding. It is
  the **only** way to obtain a quill from a quiver.
- `const engine = new Engine()` (from the `@quillmark/wasm` root) renders it:
  `await engine.render(quill, doc, opts?)`. The Engine routes on
  `quill.backendId`, lazily loads that backend, clones the quill and document
  into the backend's WASM memory, renders, and frees the clones — so a core
  `Quill` passes straight to `engine.render` with no boundary-crossing step.

`Engine.render`, `open`, `supportedFormats`, and `supportsCanvas` are all
**async** — always `await` them. The canonical `Quill`/`Document`/`Engine`
types are not re-exported from `@quillmark/quiver`; import them straight from
the `@quillmark/wasm` peer dependency, which is the single source of truth.

## Authoring a quiver

Lay out the source per the spec, then publish to npm (or push a git tag):

```
my-quiver/
  Quiver.yaml
  quills/
    <name>/<x.y.z>/
      Quill.yaml
      ...
  package.json
```

Recommended CI: use the bundled `@quillmark/quiver/testing` harness — it
loads with `Quiver.fromDir`, compiles every quill, and renders each quill's
example document so validation errors surface on publish, not on the
consumer's build. The harness uses `node:test` (built into Node 18+); no extra
test-runner dependency required. If you prefer vitest/jest/mocha, write a
12-line loop against the main API instead.

```ts
// quiver.test.ts — run with: node --test
import { Engine } from "@quillmark/wasm";
import { runQuiverTests } from "@quillmark/quiver/testing";

runQuiverTests(import.meta.url, new Engine());
```

## Manual validation (rendering samples)

The CI harness proves every quill _compiles_; it does not produce output a
human can look at. To eyeball real renders, run the
`@quillmark/quiver/preview` helper:

```ts
// scripts/preview.ts — run with: node --experimental-strip-types scripts/preview.ts
import { Engine } from "@quillmark/wasm";
import { renderQuiverSamples } from "@quillmark/quiver/preview";

await renderQuiverSamples(import.meta.url, {
  engine: new Engine(),
});
// → writes ./preview/<name>@<version>.<fmt> + index.html
```

It renders every quill's illustrative example document (seeded via
`quill.seedDocument()` — a fully filled-out, always-renderable sample; the
blueprint itself carries `<must-fill>` sentinels and is not directly
renderable), writes the artifacts
to `outDir` (default `preview/`), and emits an `index.html`
gallery. A `.gitignore` is written into `outDir` so the generated artifacts
are never accidentally committed. A quill that throws is recorded as failed —
with every diagnostic, not just the first — without aborting the run, so one
broken quill never hides the rest.

To iterate on a subset, pass `include` / `exclude` (each entry matches a
quill name or canonical ref):

```ts
await renderQuiverSamples(import.meta.url, {
  engine: new Engine(),
  exclude: ["broken-quill"], // or: include: ["memo@1.0.0"]
});
```

> **Linking the source repo?** `@quillmark/quiver/preview` resolves to
> `./dist/preview.js`, which only exists after `npm install && npm run build`
> in the `@quillmark/quiver` checkout. If you `npm link` it and see
> `Cannot find module './dist/preview.js'`, build the linked package first.

## Consuming a quiver (Node)

```ts
import { Engine, Document } from "@quillmark/wasm";
import { Quiver } from "@quillmark/quiver/node";

const quiver = await Quiver.fromPackage("@org/my-quiver");
const engine = new Engine();

const doc = Document.fromMarkdown(markdownString);
const quill = await quiver.getQuill(doc.quillRef);
const result = await engine.render(quill, doc, { format: "pdf" });
```

`getQuill` accepts both selector refs (`"memo"`, `"memo@1"`) and canonical
refs (`"memo@1.0.0"`). It resolves the selector, materializes the quill via
`Quill.fromTree(tree)` (engine-free), and caches one instance per canonical
ref for the lifetime of the `Quiver`. Concurrent calls for the same ref
coalesce into a single load.

The returned quill lives in the core build's WASM memory and is suitable for
schema inspection, validation, blueprint access, and seeding. To render it,
hand it straight to `engine.render(quill, doc)` — the Engine clones both
handles into the backend on demand, so no separate boundary-crossing step is
needed:

```ts
// Editor path — core only, ~0.66 MB gzip
const coreQuill = await quiver.getQuill(ref);
coreQuill.schema; // ✓ schema, validate, blueprint, seed — all fine
const doc = coreQuill.seedDocument(); // a fully-filled example document

// Render path — the same core handles render directly.
const result = await engine.render(coreQuill, doc, { format: "pdf" });
```

If you only need the canonical ref (without materializing), use `resolve`:

```ts
const canonicalRef = await quiver.resolve("memo"); // "memo@1.1.0"
```

If you need the raw file tree (e.g. to drive a backend binary directly), call
`(await quiver.getQuill(ref)).toTree()` on the core `Quill` — it is I/O-free
once the quill is materialized.

## Consuming a quiver (browser)

Browsers cannot read the source layout directly, so build at deploy time and
serve the output as static files:

```ts
// build script (Node) — typically wired into your existing build pipeline
import { Quiver } from "@quillmark/quiver/node";

await Quiver.build(
  "./node_modules/@org/my-quiver",
  "./public/quivers/my-quiver",
);
```

```ts
// browser runtime
import { Engine, Document } from "@quillmark/wasm";
import { Quiver } from "@quillmark/quiver";

const quiver = await Quiver.fromBuiltUrl("/quivers/my-quiver/");
const engine = new Engine();

const doc = Document.fromMarkdown(markdownString);
const quill = await quiver.getQuill(doc.quillRef);
const result = await engine.render(quill, doc, { format: "pdf" });
```

## Server-side runtime (Node, packed artifact on disk)

For server-side rendering where the packed artifact ships in the deployment
image, use `Quiver.fromBuiltDir` to read it from disk. This avoids the
self-fetch / load-balancer round-trip that `fromBuiltUrl` would force on a
self-hosted deployment, and lets the source quiver stay in
`devDependencies`:

```ts
import { Quiver } from "@quillmark/quiver/node";

// Packed at build time, e.g. into ./static/quills/my-quiver
const quiver = await Quiver.fromBuiltDir("./static/quills/my-quiver");
```

## Advanced: pre-built distribution to a CDN

If you need to ship the runtime artifact directly (e.g. consumers cannot run
a Node build step), publish `Quiver.build` output to a CDN and have
consumers point `fromBuiltUrl` at the CDN URL:

```ts
import { Quiver } from "@quillmark/quiver/node";

await Quiver.build("./my-quiver", "./dist/my-quiver");
// upload ./dist/my-quiver to https://cdn.example.com/quivers/my-quiver/
const quiver = await Quiver.fromBuiltUrl("https://cdn.example.com/quivers/my-quiver/");
```

## Warm (prefetch all quill trees)

```ts
await quiver.warm();
```

`warm()` is I/O-only: it loads every quill's tree (over the network for
`fromBuiltUrl`, off the filesystem for `fromPackage` / `fromDir` /
`fromBuiltDir`) and caches them. It does not require an engine and does
not materialize Quill instances — that happens lazily on the first
`getQuill` call, which is microseconds. A subsequent `getQuill` reuses
the cached tree, skipping the load.

## Error handling

All errors are instances of `QuiverError` with a `code` field.

```ts
import { QuiverError } from "@quillmark/quiver";

try {
  await quiver.resolve("unknown_quill");
} catch (err) {
  if (err instanceof QuiverError) {
    console.error(err.code);    // e.g. "quill_not_found"
    console.error(err.message); // human-readable description
    console.error(err.ref);     // offending ref, when available
  }
}
```

Error codes: `invalid_ref`, `quill_not_found`, `quiver_invalid`, `transport_error`.

## Using `getQuill` vs calling `Quill.fromTree` directly

`getQuill(ref)` is the correct entry point for any code that loads a quill
through a `Quiver`. It handles ref resolution, tree fetching, `Quill.fromTree`
construction, and per-ref caching in one call. Do **not** reach for
`Quill.fromTree` directly inside a Quiver consumer:

```ts
import { Quill } from "@quillmark/wasm";

// wrong — bypasses Quiver's cache; duplicates work getQuill already does
const tree = new Map<string, Uint8Array>();
tree.set("Quill.yaml", new TextEncoder().encode("name: memo\n..."));
// ...assemble the rest of the file tree by hand...
const quill = Quill.fromTree(tree);

// right
const quill = await quiver.getQuill(ref);
```

`Quill.fromTree` is for code that builds quills **outside** of a Quiver (e.g.
a server route that receives a raw file tree over the network, or a test
fixture that constructs a quill from a hand-rolled in-memory tree).
