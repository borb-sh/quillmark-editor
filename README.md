# quillmark-js

The JavaScript tier downstream of the [`@quillmark/wasm`](https://github.com/borb-sh/quillmark) artifact.

| Package                                |                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------- |
| [`@quillmark/svelte`](packages/svelte) | Editing, live-preview and source surfaces over a session.                                    |
| [`@quillmark/quiver`](packages/quiver) | Collections of quills, resolved and loaded.                                                  |
| [`playground`](packages/playground)    | The app that composes them, for a developer reading the library; deployed as the Pages site. |
| [`@quillmark/studio`](packages/studio) | The app that composes them, for an author working on a quill; published as a static client.  |

A package whose JS a consumer imports peers `@quillmark/wasm` and never depends on it, so the consumer supplies the one copy whose linear memory the handles index into; a bundled terminal, imported by nobody, contains it instead. `check:deps` holds that and the rest of the graph ([DEPENDENCIES.md](prose/canon/DEPENDENCIES.md)).

## Development

```sh
npm install                # one install, every package
npm run dev                # the playground at :5173
npm run dev:studio         # studio at :5173
npm run build              # quiver → ui → the apps, in that order
npm test                   # every package's suite
npm run check              # types, per package
npm run lint               # prettier, over the repo
npm run check:canon        # the canon spine, every tier
npm run check:style        # the closed `--_qm-*` / `--pg-*` / `--st-*` scales
npm run check:deps         # the dependency law
```

Everything runs against the one reference quill, [`fixtures/quills/usaf_memo/0.2.0`](fixtures/quills/usaf_memo), a dev fixture at the workspace root, never published.

## Canon

The settled systems, per tier: the [workspace's](prose/canon/INDEX.md) (dependencies, release), [`svelte`'s](packages/svelte/prose/canon/INDEX.md), [`quiver`'s](packages/quiver/prose/canon/INDEX.md), [the playground's](packages/playground/prose/canon/INDEX.md), [studio's](packages/studio/prose/canon/INDEX.md). Work that is not settled lives in GitHub issues.
