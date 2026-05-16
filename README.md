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
loads with `Quiver.fromDir` and exercises every quill so validation errors
surface on publish, not on the consumer's build. The harness uses
`node:test` (built into Node 18+); no extra test-runner dependency
required. If you prefer vitest/jest/mocha, write a 12-line loop against
the main API instead.

## Manual validation (rendering samples)

The CI harness proves every quill _compiles_; it does not produce output a
human can look at. To eyeball real renders, drop an `example.md` next to a
quill's template (`quills/<name>/<x.y.z>/example.md`) and run the
`@quillmark/quiver/preview` helper:

```ts
// scripts/preview.ts — run with: node --experimental-strip-types scripts/preview.ts
import { Quillmark, Document } from "@quillmark/wasm";
import { renderQuiverSamples } from "@quillmark/quiver/preview";

await renderQuiverSamples(import.meta.url, {
  engine: new Quillmark(),
  Document,
});
// → writes ./preview/<name>@<version>.<fmt> + index.html
```

It renders every quill's `example.md`, writes the artifacts to `outDir`
(default `preview/`), and emits an `index.html` gallery. A `.gitignore` is
written into `outDir` so the generated artifacts are never accidentally
committed. Quills without an `example.md` are skipped; a quill that throws
is recorded as failed — with every diagnostic, not just the first —
without aborting the run, so one broken quill never hides the rest.

To iterate on a subset, pass `include` / `exclude` (each entry matches a
quill name or canonical ref):

```ts
await renderQuiverSamples(import.meta.url, {
  engine: new Quillmark(),
  Document,
  exclude: ["broken-quill"], // or: include: ["memo@1.0.0"]
});
```

> **Linking the source repo?** `@quillmark/quiver/preview` resolves to
> `./dist/preview.js`, which only exists after `npm install && npm run build`
> in the `@quillmark/quiver` checkout. If you `npm link` it and see
> `Cannot find module './dist/preview.js'`, build the linked package first.

## Consuming a quiver (Node)

```ts
import { Quillmark, Document } from "@quillmark/wasm";
import { Quiver } from "@quillmark/quiver/node";

const engine = new Quillmark();
const quiver = await Quiver.fromPackage("@org/my-quiver");

const doc = Document.fromMarkdown(markdownString);
const quill = await quiver.getQuill(doc.quillRef, { engine });
const result = quill.render(doc, { format: "pdf" });
```

`getQuill` accepts both selector refs (`"memo"`, `"memo@1"`) and canonical
refs (`"memo@1.0.0"`). It resolves the selector, materializes the quill via
`engine.quill(tree)`, and caches per (engine, canonical-ref). Concurrent
calls for the same ref share a single load.

If you only need the canonical ref (without materializing), use `resolve`:

```ts
const canonicalRef = await quiver.resolve("memo"); // "memo@1.1.0"
```

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
import { Quiver } from "@quillmark/quiver";

const quiver = await Quiver.fromBuiltUrl("/quivers/my-quiver/");
const quill = await quiver.getQuill(doc.quillRef, { engine });
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
`fromBuiltDir`) and caches
them. It does not require an engine and does not materialize Quill
instances — that happens lazily on the first `getQuill` call, which is
microseconds. A subsequent `getQuill` reuses the cached tree, skipping
the load.

Once a tree has been turned into a Quill, the cached tree is dropped so
its bytes can be GC'd — the materialized Quill is the runtime artifact.
Calling `warm()` again refills the tree cache.

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

## Full specification

See [PROGRAM.md](./PROGRAM.md) for the complete API surface, runtime artifact format specification, and design decisions.
