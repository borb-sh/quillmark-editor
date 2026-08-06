# @quillmark/quiver

Load and build collections of quills for rendering with `@quillmark/wasm`.

## Install

```bash
npm install @quillmark/quiver @quillmark/wasm
```

## Loading a quiver

A quiver has one authored shape, the **source layout** (`Quiver.yaml` at the package root, quills under `quills/<name>/<x.y.z>/`), published as an npm package. Browsers cannot read that layout, so `build(src, out)` packs it at deploy time and the output is served as static assets. Each loader names exactly what it reads; there is no auto-detection.

| Loader                     | Reads                   | Import                   |
| -------------------------- | ----------------------- | ------------------------ |
| `fromDir(path)`            | the source layout       | `@quillmark/quiver/node` |
| `fromBuiltDir(path)`       | build output, off disk  | `@quillmark/quiver/node` |
| `Quiver.fromBuiltUrl(url)` | build output, over HTTP | `@quillmark/quiver`      |

The filesystem factories are free functions from `/node`; the one that reaches across HTTP is a static on `Quiver`. Importing `/node` adds nothing to the class, so a bundler drops the verbs you do not call.

## Consuming a quiver (Node)

A quiver installed from npm is a directory like any other. Resolve its root from your own module: your dependencies are reachable from your module, not from this package's install location.

```ts
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { Engine, Document } from '@quillmark/wasm';
import { fromDir } from '@quillmark/quiver/node';

const root = dirname(createRequire(import.meta.url).resolve('@org/my-quiver/Quiver.yaml'));
const quiver = await fromDir(root);
const engine = new Engine();

const doc = Document.fromMarkdown(markdownString);
const quill = await quiver.getQuill(doc.quillRef);
const result = await engine.render(quill, doc, { format: 'pdf' });
```

`getQuill(ref)` is the only way to obtain a quill from a quiver, and the only entry point most consumers need. It accepts selector refs (`"memo"`, `"memo@1"`) and canonical ones (`"memo@1.0.0"`), resolves the selector, materializes the quill via `Quill.fromTree`, and caches one instance per canonical ref for the quiver's lifetime; concurrent calls for the same ref coalesce into a single load.

That quill is **borrowed, not owned**: every caller asking for that ref gets the same instance, so `free()` on it hands the next caller a freed handle. Code that owns its quill mints one from `(await quiver.getQuill(ref)).toTree()` and frees that.

This package produces quills; `@quillmark/wasm` renders them. A quill from `getQuill` is engine-free portable data — schema inspection, validation, blueprint access, `seedDocument()` — and passes straight to `engine.render(quill, doc)`, which routes on `quill.backendId`, loads that backend, clones both handles into its memory, renders, and frees the clones. There is no boundary-crossing step to perform. `Engine.render`, `open`, `supportedFormats` and `supportsCanvas` are **async**. The canonical `Quill` / `Document` / `Engine` types are not re-exported here; import them from the `@quillmark/wasm` peer, their single source of truth.

One narrower verb sits beside `getQuill`: `resolve(ref)` returns the canonical ref without materializing anything, and is **sync** (the catalog is in memory from the moment the quiver is built).

```ts
const canonicalRef = quiver.resolve('memo'); // "memo@1.1.0"
```

## Consuming a quiver (browser)

Build at deploy time, serve the output as static files:

```ts
// build script (Node) — typically wired into your existing build pipeline
import { build } from '@quillmark/quiver/node';

await build('./node_modules/@org/my-quiver', './public/quivers/my-quiver');
```

`build` clears its output directory before writing, so it owns that path outright. An `outDir` that is, or contains, the source quiver or the working directory is refused with a `transport_error` rather than deleted.

```ts
// browser runtime
import { Engine, Document } from '@quillmark/wasm';
import { Quiver } from '@quillmark/quiver';

const quiver = await Quiver.fromBuiltUrl('/quivers/my-quiver/');
const engine = new Engine();

const doc = Document.fromMarkdown(markdownString);
const quill = await quiver.getQuill(doc.quillRef);
const result = await engine.render(quill, doc, { format: 'pdf' });
```

A CDN URL works the same way, for consumers who cannot run a Node build step of their own.

## Server-side runtime (Node, packed artifact on disk)

Where the packed artifact ships in the deployment image, `fromBuiltDir` reads it from disk, avoiding the self-fetch round-trip `fromBuiltUrl` would force on a self-hosted deployment and letting the source quiver stay a `devDependency`:

```ts
import { fromBuiltDir } from '@quillmark/quiver/node';

// Packed at build time, e.g. into ./static/quills/my-quiver
const quiver = await fromBuiltDir('./static/quills/my-quiver');
```

## The `latest.json` pointer

`Quiver.fromBuiltUrl(url)` first fetches `<url>/latest.json`, a stable-named pointer to the current manifest. Everything behind that pointer is content-addressed and checked against the digest in its name; the pointer itself is not, so a cache layer can serve a stale one and silently pin the client to the old catalog. It is therefore the one request fetched `no-cache` (revalidate with the origin; a 304 still serves from disk), which closes the browser-cache layer. A stale CDN edge is answered by that host's cache headers.

## Error handling

Every error is a `QuiverError` carrying a `code` from a closed set — `invalid_ref`, `quill_not_found`, `quiver_invalid`, `transport_error` — a human-readable `message`, and the offending `ref` where there is one.

```ts
import { QuiverError } from '@quillmark/quiver';

try {
	quiver.resolve('unknown_quill');
} catch (err) {
	if (err instanceof QuiverError) console.error(err.code, err.message, err.ref);
}
```

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

A consumer reaches an installed quiver by resolving `<specifier>/Quiver.yaml`, which goes through your `exports` map. A package that declares one must expose that subpath, or the quiver is unreachable however correct its layout; a package with no `exports` map needs nothing.

```jsonc
// package.json
{
	"files": ["Quiver.yaml", "quills"],
	"exports": {
		"./Quiver.yaml": "./Quiver.yaml"
	}
}
```

Gate the quiver in CI so a validation failure surfaces on publish rather than on a consumer's build. `quiver test` loads with `fromDir`, compiles every quill, and renders each quill's example document. One door, so what you run locally is what CI runs.

The CLI needs no file. Installing the package links `quiver` into `node_modules/.bin`, which npm puts on PATH for every script:

```sh
npm install --save-dev @quillmark/quiver @quillmark/wasm
```

```jsonc
// package.json
{
	"scripts": { "test": "quiver test" }
}
```

It finds the engine itself: a named `engine` export from `quiver.config.js` at the collection root, else `@quillmark/wasm` from your own `node_modules`. `quiver build [--out <dir>]` packs the same source into a servable artifact.

On vitest, jest or `node:test`, spawn the bin from a test rather than rebuilding the loop against the main API. The gate stays one implementation, and the case gates what CI gates:

```ts
// quiver.test.ts
import { execFileSync } from 'node:child_process';

it('gates the quiver', () => {
	execFileSync('quiver', ['test'], { stdio: 'inherit' });
});
```

It answers _does it work_, and that is the whole of what this package offers a quill author: _what is it like to use_ is answered by working a real document through the quill live, which is an app rather than a subpath.
