# Changelog

`@quillmark/quiver`. An entry is written into `## Unreleased` by the change that earns it; a release promotes that body to its own version section.

## Unreleased

`Quiver.warm()` is removed. It prefetched every quill's tree so a later `getQuill` would be microseconds, and it was the only reason the quiver held a tree cache beside its quill cache; call `getQuill` for the refs you want ahead of time instead. The quill cache is untouched — one instance per canonical ref, concurrent calls coalescing — and a retry after a `Quill.fromTree` throw now refetches rather than reusing the retained tree.

The Node factories become free functions: `import { fromDir, fromPackage, fromBuiltDir, build, buildPackage } from '@quillmark/quiver/node'`, replacing the statics `/node` installed on the shared `Quiver` class. The class is browser-pure, the package has no side effects, and `Quiver._fromLoader` is gone from the public surface. `Quiver.fromBuiltUrl` and `Quiver.fromManifest` are unchanged.

`fromPackage` and `buildPackage` take a `from` argument — pass `import.meta.url`. Without it resolution runs from this package's own install location, so a consumer's quiver was unreachable under an isolated `node_modules` layout.

`build` refuses an output directory that is, or contains, the source quiver or the working directory, rather than clearing it.

Build output moves from MD5 to SHA-256 — 12 hex chars in bundle and manifest names, full width for font store keys — and the loader now verifies fetched bytes against the digest in their name, raising `transport_error` on a mismatch. `latest.json` is fetched `no-cache`. Artifacts built by an earlier version must be rebuilt.

`BuildOptions` is removed; it reserved nothing an optional trailing parameter cannot add back.

The `/preview` subpath is removed, along with `renderQuiverSamples`, its HTML gallery and the CLI's `preview` verb. `build` and `test` are now the whole of what this package gives a quill author.

It answered "let me look at it" with one seeded example per quill, rendered once to a file beside a hand-written gallery. Studio answers the same question live, with a document the author controls and a schema they can feel, so a file writer and an HTML gallery inside a loader package have nothing left to survive on.

The `/testing` subpath is removed, along with `runQuiverTests`. `quiver test` is the gate, and one door leaves the loop and the engine contract one home each rather than two answering differently under a single name: a caller-supplied engine gated nothing about the discovery the bin does. An author on vitest, jest or `node:test` spawns the bin (`execFileSync('quiver', ['test'])`), which the README shows under the gate section.

The flat "this package never renders" claim narrows to the loaders: the gate compiles and renders every quill, because proving a quill renders is what a gate for quills is.

`Quiver#resolve` is sync: `quiver.resolve(ref)` returns the canonical ref rather than a promise for one. Resolution reads the in-memory catalog every loader materializes when the quiver is built, and `QuiverLoader` carries one verb, `loadTree`, which it never reaches — so the promise priced I/O the design does not admit, and `quillNames()` / `versionsOf()` were already sync. Drop the `await`; a caller catching `invalid_ref` or `quill_not_found` catches a throw instead of a rejection. `getQuill` is unchanged.

The `@quillmark/wasm` peer floor is `>=0.101.0-0`. The prose leaf reads its corpus through `reader.getContent`, which decodes a content field by its declared type: a `plaintext` field keeps the markdown characters its author typed.

The author-side gate instantiates the core before it renders. Every `@quillmark/wasm` export throws `runtime::not_initialized` until `init()` resolves and `new Engine()` is lazy, so `quiver test` reported an uninitialized runtime as a failing quill and gated nothing.

`getQuill`'s returned quill is documented as **borrowed**: it is cached per canonical ref and handed to every caller for the quiver's lifetime, so `free()`ing it leaves the next caller holding a freed handle. Code that wants a quill of its own mints it from `(await quiver.getQuill(ref)).toTree()`.

The `file://` refusals from `Quiver.fromBuiltUrl` and `Quiver.fromManifest` name a factory that exists: `import { fromBuiltDir } from '@quillmark/quiver/node'`, not the `Quiver.fromBuiltDir` static removed when the Node factories became free functions.

The license is Apache-2.0, not MIT. The workspace's `LICENSE` was Apache-2.0 while every `package.json` declared MIT; the declaration now matches the text, and the tarball carries a copy of it alongside a `NOTICE` naming the copyright holder, Nibs.

Package metadata points at the `quillmark-js` monorepo and the subdirectory the package lives in.
