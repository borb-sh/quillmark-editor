# Dependencies

> **Implementation**: `scripts/` (the gate) · `packages/` (the graph it reads)

## TL;DR

Who may depend on whom, and why exactly one copy of `@quillmark/wasm` is installed. Both rules are mechanized in `check:deps`, which states them in one place and fails CI on either; this doc is the reasoning behind them.

## The graph

```
@quillmark/wasm  (external, loose peer)
  ├── @quillmark/svelte    the Svelte binding: surfaces over a session
  ├── @quillmark/quiver    collections → quills
  ├── playground           the composing apps: the only nodes
  └── studio               with two inbound edges
```

`svelte ↛ quiver` and `quiver ↛ svelte`, both directions: siblings at one tier with no edge between them. Not `svelte` peer-depending on `quiver`, which is the opposite arrangement and the one the word invites.

The seam that keeps it true is the resolved `Quill` handle: a stored document names its quill (`doc.quillRef`), the host maps the ref to a `Quill` before mount, and `svelte` takes the handle as a prop. Resolution is host code — `svelte` calls no resolver, so one resolution per document holds by construction, with no second surface to double-load from. Quiver's `getQuill` is one implementation, caching per canonical ref for its lifetime; an app bundling its one template resolves nothing and pulls no registry client. Neither package knows the other exists.

The apps are where the two meet, and they are the demonstration rather than the exception: each loads its quill from a built quiver and hands the result to `svelte`'s surfaces, with no specifier crossing between the siblings in either direction. They compose the same pair for different readers: the playground for a developer reading the library ([PLAYGROUND.md](../../packages/playground/prose/canon/PLAYGROUND.md)), studio for an author working on a quill ([STUDIO.md](../../packages/studio/prose/canon/STUDIO.md)).

In a workspace the edge is one relative path away, so a gate holds the separation that distance cannot: `check:deps` reads declared dependencies **and** source specifiers, since either alone is half a check. An undeclared import resolves fine in a workspace, and a declared dependency nothing imports is still a promise.

Membership in this repo is "downstream of the wasm artifact". The Rust workspace stays where it is, and `crates/bindings/wasm/runtime/` is hand-written JS that stays with it: it ships *inside* the artifact rather than downstream of it.

## The wasm singleton

Every published package **peers** `@quillmark/wasm` and none depends on it. The handles cross the package boundary (a `Quill` minted by `svelte` is handed to quiver's loader, a `Document` seeded by quiver is opened by `svelte`'s session), and a handle is an index into one wasm instance's linear memory. Two installed copies are two linear memories, so a handle from one is foreign to the other. The runtime refuses it at every door that takes one, as a `QuillmarkError` coded `runtime::foreign_handle` naming the cause and the `npm ls @quillmark/wasm` that diagnoses it: the failure is loud at the first crossing rather than a wrong render later. The consumer supplies the one copy; the check reports the breach, it does not repair it.

The range is loose (`>=0.101.0-0`, one `>=` comparator) until wasm 1.0 makes compatibility predictable enough to claim a narrow one honestly. Its floor is a claim, not a formality: it names the release that first carries every verb the packages call, and it rises with the first call to a newer one.

The non-obvious half: **loose ranges do not prevent two installs, they permit them.** Two wide ranges overlapping is exactly when npm is free to resolve twice. So the published claim stays wide and the developed-against version is exactly one, pinned by root `overrides` with the root devDependency installing it. Under loose ranges the range half of `check:deps` is weak (the override satisfies everything) and starts earning its keep on the same clock as the range.

## The /preview weight

`svelte`'s `/preview` subpath reaches no ProseMirror and no editing surface, transitively. Each subpath is its own module root, so a bundler pulls only what the imported entry reaches; this rule is what makes that claim true for the one surface whose audience is not editing. A viewer, a share page, a CI screenshot imports `/preview` and pays for the paint loop alone.

`check:deps` walks preview's import graph within `src/lib`, not its direct imports: one relative hop into the codec pulls all of ProseMirror, and no direct scan would see it.
