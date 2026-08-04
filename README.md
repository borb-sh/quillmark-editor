# quillmark-js

The JavaScript tier downstream of the [`@quillmark/wasm`](https://github.com/borb-sh/quillmark) artifact.

| Package                                |           |                                                           |
| -------------------------------------- | --------- | --------------------------------------------------------- |
| [`@quillmark/svelte`](packages/svelte) | published | Editing, live-preview and source surfaces over a session. |
| [`@quillmark/quiver`](packages/quiver) | published | Collections of quills, resolved and loaded.               |
| [`playground`](packages/playground)    | private   | The app that composes them, deployed as the Pages site.   |

Every published package peers `@quillmark/wasm` and none depends on it, so a consumer supplies the one copy whose linear memory the handles index into. `check:deps` holds that and the rest of the graph ([DEPENDENCIES.md](prose/canon/DEPENDENCIES.md)).

## Development

```sh
npm install                # one install, all three packages
npm run dev                # the playground at :5173
npm run build              # quiver → ui → playground, in that order
npm test                   # every package's suite
npm run check              # types, per package
npm run lint               # prettier, over the repo
npm run check:canon        # the canon spine, every tier
npm run check:style        # the closed `--_qm-*` / `--pg-*` scales
npm run check:deps         # the dependency law
```

Everything runs against the one reference quill, [`fixtures/quills/usaf_memo/0.2.0`](fixtures/quills/usaf_memo), a dev fixture at the workspace root, never published.

## Canon

The settled systems, per tier: the [workspace's](prose/canon/INDEX.md) (dependencies, release), [`svelte`'s](packages/svelte/prose/canon/INDEX.md), [`quiver`'s](packages/quiver/prose/canon/INDEX.md), [the playground's](packages/playground/prose/canon/INDEX.md). Work that is not settled lives in GitHub issues.
