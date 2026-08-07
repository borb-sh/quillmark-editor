# quillmark-js

The JavaScript tier downstream of the [`@quillmark/wasm`](https://github.com/borb-sh/quillmark) artifact.

| Package                                |                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`@quillmark/svelte`](packages/svelte) | Editing, live-preview and source surfaces over a session.                                              |
| [`@quillmark/quiver`](packages/quiver) | Collections of quills, resolved and loaded.                                                            |
| [`quillkit`](packages/quillkit)        | The quill author's toolchain: one bin over gate, pack, look at, ship.                                  |
| [`playground`](packages/playground)    | The app that composes them, for a developer reading the library; deployed as the Pages site.           |
| [`@quillmark/studio`](packages/studio) | The surface for an author working on a quill; published as the static client `quillkit studio` serves. |

A quill author types one name, `quillkit`, and pins the rest: the tool resolves the loader, the engine and the client out of the collection's own `node_modules`, so the versions a collection depends on decide what packs it, renders it and draws it.

A package whose JS a consumer imports peers `@quillmark/wasm` and never depends on it, so the consumer supplies the one copy whose linear memory the handles index into; a bundled terminal, imported by nobody, contains it instead. `check:deps` holds that and the rest of the graph (`scripts/check-deps.mjs`).

## Development

```sh
npm install                # one install, every package
npm run dev                # the playground at :5173
npm run dev:studio         # studio at :5173
npm run build              # quiver → svelte → quillkit and the apps, in that order
npm run site               # the fixture quiver as a deploy serves it, into packages/studio/site
npm test                   # every package's suite
npm run check              # types, per package
npm run lint               # prettier, over the repo
npm run check:canon        # the canon spine, every tier
npm run check:style        # the closed `--_qm-*` / `--pg-*` / `--st-*` scales
npm run check:deps         # the dependency law
```

Everything runs against the one reference quill, [`fixtures/quills/usaf_memo/0.2.0`](fixtures/quills/usaf_memo), a dev fixture at the workspace root, never published.

## Canon

The settled systems, per tier: [`svelte`'s](packages/svelte/prose/canon/INDEX.md), [`quiver`'s](packages/quiver/prose/canon/INDEX.md), [`quillkit`'s](packages/quillkit/prose/canon/INDEX.md), [the playground's](packages/playground/prose/canon/INDEX.md), [studio's](packages/studio/prose/canon/INDEX.md). Work that is not settled lives in GitHub issues.
