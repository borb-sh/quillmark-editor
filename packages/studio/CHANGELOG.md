# Changelog

`@quillmark/studio`. An entry is written into `## Unreleased` by the change that earns it; a release promotes that body to its own version section.

## Unreleased

The first published shape: a static client, not an application. The tarball carries `dist` and nothing else — no bin, no server, no watcher — with `@quillmark/svelte`, `@quillmark/quiver` and `@quillmark/wasm` bundled into it, so it has no runtime dependencies and exports no JS.

The client takes its base at runtime off `document.baseURI`, so one build serves a dev server, a subpath and a deploy unchanged, and it carries no quiver: one is laid beside it at `quiver/`, which is where it looks.

The head names the `@quillmark/wasm` the client was built with. A gate runs whatever its own tree holds and nothing at runtime reconciles the two, so the version is stated rather than left to an `npm ls` a reader cannot run.

`.github/workflows/studio-pages.yml` is the reusable workflow that builds a quiver, lays the client over it and uploads the Pages artifact.
