# Changelog

`@quillmark/quiver`. An entry is written into `## Unreleased` by the change that earns it; a release promotes that body to its own version section.

## Unreleased

**A runtime whose packed artifact is not on a path it can read has a loader.** `Quiver.fromBuiltFiles(files)` reads build output from a `Map` of artifact-relative path to bytes, fetching nothing: a serverless function whose deployment bundle carries the artifact, a bundler that inlines it, a test. It spares that runtime the self-fetch over its own load balancer that `fromBuiltDir` spares one with the artifact on disk.

`Quiver.fromBuiltUrl(url, { seed })` is the partial case: the map answers first, the URL serves what it does not carry. A deployment that ships `latest.json` settles which catalog the process reads at deploy time rather than at cache-revalidation time. Seeded bytes are checked against the digest in their name exactly as fetched bytes are.

[`MIGRATION.md`](MIGRATION.md) covers 0.16 → 0.19, leading with the removals whose only signal is a runtime `TypeError`: `buildPackage`, `fromPackage`, `warm`, `fromManifest`, and `resolve` becoming sync.

**The `@quillmark/wasm` peer floor is `>=0.103.0-0`, and `getQuill` awaits the gate itself.** `init()` is the only door to `Quill` at that pin, so the materialization awaits it beside the tree load rather than leaving it a precondition of the call. The gate is memoized, so this is one instantiation shared with every other caller, overlapped with the fetch that pays for it.

## v0.19.0 - 2026-08-08

**The bin is gone.** `quillmark-quiver test` and `quillmark-quiver build` are `quillkit test` and `quillkit build`, in a package of its own. This is a library: it loads a quiver and packs one, and a collection that depends on it pins the format its quiver is written in rather than a version tooling releases move. `quiver.config.js` is `quillkit.config.js`.

**`build` lands a generation whole.** It assembles in `<out>.stage` and moves the tree in, so a reader fetching mid-build gets the previous generation rather than a missing pointer or a manifest whose bundles have not landed, and a build that throws leaves the previous one serving. The destructive-write refusals now cover the staging siblings, which are named off `out` and cleared with it.

## v0.18.1 - 2026-08-07

## v0.18.0 - 2026-08-07

The bin is `quillmark-quiver`. A bin is the one name this package writes into a namespace it shares — a consumer's `node_modules/.bin`, and their PATH when it is installed globally — and `quiver` is too plain a word to hold there. The verbs are untouched, so a `scripts` entry becomes `quillmark-quiver test` and a runner spawning the gate names the bin it links (`execFileSync('quillmark-quiver', ['test'])`).

## v0.17.0 - 2026-08-07

`Quiver.warm()` is removed. It prefetched every quill's tree so a later `getQuill` would be microseconds, and it was the only reason the quiver held a tree cache beside its quill cache; call `getQuill` for the refs you want ahead of time instead. The quill cache is untouched — one instance per canonical ref, concurrent calls coalescing — and a retry after a `Quill.fromTree` throw now refetches rather than reusing the retained tree.

The Node factories become free functions: `import { fromDir, fromBuiltDir, build } from '@quillmark/quiver/node'`, replacing the statics `/node` installed on the shared `Quiver` class. The class is browser-pure, the package has no side effects, and `Quiver._fromLoader` is gone from the public surface. `Quiver.fromBuiltUrl` is unchanged, and is the class's one factory.

Three loaders, not five. `fromPackage` and `buildPackage` are gone: an npm-installed quiver is a directory, and `dirname(createRequire(import.meta.url).resolve('<pkg>/Quiver.yaml'))` handed to `fromDir` or `build` is the line, written where the resolution base belongs to the caller. `Quiver.fromManifest` is gone with them: it closed a stale-pointer layer above the browser cache the pointer's `no-cache` fetch already closes, for an SSR consumer that does not exist. A published quiver still exposes `./Quiver.yaml` from its `exports` map or is unreachable.

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

The `file://` refusal from `Quiver.fromBuiltUrl` names a factory that exists: `import { fromBuiltDir } from '@quillmark/quiver/node'`, not the `Quiver.fromBuiltDir` static removed when the Node factories became free functions.

The license is Apache-2.0, not MIT. The workspace's `LICENSE` was Apache-2.0 while every `package.json` declared MIT; the declaration now matches the text, and the tarball carries a copy of it alongside a `NOTICE` naming the copyright holder, Nibs.

Package metadata points at the `quillmark-js` monorepo and the subdirectory the package lives in.
