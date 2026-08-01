# quillmark-js

The JavaScript tier downstream of the [`@quillmark/wasm`](https://github.com/borb-sh/quillmark) artifact. Membership is that sentence: the wasm crate and its hand-written runtime stay in the Rust repo, since they ship _inside_ the artifact rather than downstream of it.

| Package                                |           |                                                           |
| -------------------------------------- | --------- | --------------------------------------------------------- |
| [`@quillmark/svelte`](packages/svelte) | published | Editing, live-preview and source surfaces over a session. |
| [`@quillmark/quiver`](packages/quiver) | published | Collections of quills, resolved and loaded.               |
| [`playground`](packages/playground)    | private   | The app that composes them, deployed as the Pages site.   |

`svelte` and `quiver` are siblings with no edge between them, in either direction; the playground is the only node with two inbound edges. Every published package peers `@quillmark/wasm` and none depends on it, so a consumer supplies the one copy whose linear memory the handles index into. Both rules are gated by `check:deps` and reasoned out in [`prose/canon/DEPENDENCIES.md`](prose/canon/DEPENDENCIES.md).

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

Everything runs against the one reference quill, [`fixtures/quills/usaf_memo/0.2.0`](fixtures/quills/usaf_memo), a dev fixture at the workspace root, never published. `fixtures/` is a source quiver, which is how the playground loads it.

## Canon

The settled systems, per tier: the [workspace's](prose/canon/INDEX.md) (dependencies, release), [`svelte`'s](packages/svelte/prose/canon/INDEX.md), [`quiver`'s](packages/quiver/prose/canon/INDEX.md), [the playground's](packages/playground/prose/canon/INDEX.md). Work that is not settled lives in GitHub issues.
