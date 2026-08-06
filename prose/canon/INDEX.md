# Workspace Canon Index

Canonical documentation for `quillmark-js` itself: the rules that span packages and therefore have no home inside one.

- [DEPENDENCIES.md](DEPENDENCIES.md): the dependency graph, the `@quillmark/wasm` singleton, and the preview subpath's weight rule.
- [RELEASE.md](RELEASE.md): independent versions, the release PR, and the one gate.

Each package carries its own canon for what it is:

- [`packages/svelte`](../../packages/svelte/prose/canon/INDEX.md): the editing, preview and source surfaces over a session.
- [`packages/quiver`](../../packages/quiver/prose/canon/INDEX.md): collections of quills, resolved and loaded.
- [`packages/playground`](../../packages/playground/prose/canon/INDEX.md): the app that composes them, for a developer reading the library.
- [`packages/studio`](../../packages/studio/prose/canon/INDEX.md): the app that composes them, for an author working on a quill, published as a static client.

Work that is not settled lives in GitHub issues.
