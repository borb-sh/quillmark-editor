# Dependencies

> **Implementation**: `scripts/` (the gate) · `packages/` (the graph it reads)

## TL;DR

Who may depend on whom, and why exactly one copy of `@quillmark/wasm` is installed. Both rules are mechanized in `check:deps`, which states them in one place and fails CI on either; this doc is the reasoning behind them.

## The graph

```
@quillmark/wasm  (external, loose peer — a build-time dependency of the apps)
  ├── @quillmark/svelte    the Svelte binding: surfaces over a session
  ├── @quillmark/quiver    collections → quills
  ├── playground           the composing apps: the only nodes
  └── @quillmark/studio    with two inbound edges
```

`svelte ↛ quiver` and `quiver ↛ svelte`, both directions: siblings at one tier with no edge between them. Not `svelte` peer-depending on `quiver`, which is the opposite arrangement and the one the word invites.

The seam that keeps it true is the resolved `Quill` handle: a stored document names its quill (`doc.quillRef`), the host maps the ref to a `Quill` before mount, and `svelte` takes the handle as a prop. Resolution is host code — `svelte` calls no resolver, so one resolution per document holds by construction, with no second surface to double-load from. Quiver's `getQuill` is one implementation, caching per canonical ref for its lifetime; an app bundling its one template resolves nothing and pulls no registry client. Neither package knows the other exists.

The apps are where the two meet, and they are the demonstration rather than the exception: each loads its quill from a built quiver and hands the result to `svelte`'s surfaces, with no specifier crossing between the siblings in either direction. They compose the same pair for different readers: the playground for a developer reading the library ([PLAYGROUND.md](../../packages/playground/prose/canon/PLAYGROUND.md)), studio for an author working on a quill ([STUDIO.md](../../packages/studio/prose/canon/STUDIO.md)).

In a workspace the edge is one relative path away, so a gate holds the separation that distance cannot: `check:deps` reads declared dependencies **and** source specifiers, since either alone is half a check. An undeclared import resolves fine in a workspace, and a declared dependency nothing imports is still a promise.

Membership in this repo is "downstream of the wasm artifact". The Rust workspace stays where it is, and `crates/bindings/wasm/runtime/` is hand-written JS that stays with it: it ships *inside* the artifact rather than downstream of it.

## The wasm singleton

A package whose JS a consumer imports **peers** `@quillmark/wasm` and never depends on it. The handles cross the package boundary (a `Quill` minted by `svelte` is handed to quiver's loader, a `Document` seeded by quiver is opened by `svelte`'s session), and a handle is an index into one wasm instance's linear memory. Two installed copies are two linear memories, so a handle from one is foreign to the other. The runtime refuses it at every door that takes one, as a `QuillmarkError` coded `runtime::foreign_handle` naming the cause and the `npm ls @quillmark/wasm` that diagnoses it: the failure is loud at the first crossing rather than a wrong render later. The consumer supplies the one copy; the check reports the breach, it does not repair it.

The range is loose (one `>=` comparator) until wasm 1.0 makes compatibility predictable enough to claim a narrow one honestly. The floor is a claim rather than a formality, and it is per package: it names the release that first carries every verb *that* package calls, and it rises with the first call to a newer one. `svelte` sits at `>=0.102.0-0`, where the promise-returning `init` and `doc.overwrite` land; `quiver` at `>=0.101.0-0`, which carries everything it reaches. A floor is verified by installing it and running the package's own `check` and suite against it, since nothing in the gate resolves anything but the pin.

The rule is the crossing rather than the publishing, and `studio` is where the two come apart. A **bundled terminal** exports no JS — no entry, no subpath map, no bin — so nothing imports it, no handle crosses out of it, and there is no second copy for one to be foreign to. It depends on the artifact like any consumer, at build time, and its tarball declares no runtime dependencies at all: what a client bundles must not be installed a second time beside a tarball that already contains it. `check:deps` discriminates on exactly that, a package's own manifest saying which it is.

What that costs is the pin. A bundled client renders through the copy baked in at publish time while an author's `quiver test` runs their own, and nothing at runtime reconciles them — the gate is authoritative and studio is advisory, so the disagreement is a caveat rather than a defect. The client states its version on screen, that being what a reader who cannot run `npm ls` has instead.

The non-obvious half: **loose ranges do not prevent two installs, they permit them.** Two wide ranges overlapping is exactly when npm is free to resolve twice. So the published claim stays wide and the developed-against version is exactly one, pinned by root `overrides` with the root devDependency installing it. Under loose ranges the range half of `check:deps` is weak (the override satisfies everything) and starts earning its keep on the same clock as the range.

## The /preview weight

`svelte`'s `/preview` subpath reaches no ProseMirror and no editing surface, transitively. Each subpath is its own module root, so a bundler pulls only what the imported entry reaches; this rule is what makes that claim true for the one surface whose audience is not editing. A viewer, a share page, a CI screenshot imports `/preview` and pays for the paint loop alone.

`check:deps` walks preview's import graph within `src/lib`, not its direct imports: one relative hop into the codec pulls all of ProseMirror, and no direct scan would see it.
