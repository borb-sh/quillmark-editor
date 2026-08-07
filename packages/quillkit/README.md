# quillkit

The quill author's toolchain: one command over the whole loop — gate a quiver, pack it, look at it, ship it.

## Install

```sh
npm install --save-dev quillkit @quillmark/quiver @quillmark/wasm
```

quillkit carries none of those three. It resolves them out of your collection's own `node_modules`, so the version you pin is the format your quiver is packed in, the wasm your gate renders through, and the client your reviewers read. That is also why installing it costs kilobytes rather than the client's tens of megabytes.

## The verbs

| Verb              | What it does                                                       |
| ----------------- | ------------------------------------------------------------------ |
| `quillkit test`   | the gate: every quill's example document compiles and renders      |
| `quillkit build`  | pack the source layout into a servable artifact                    |
| `quillkit studio` | the local loop: pack, serve, repack on save                        |
| `quillkit site`   | the deploy layout: the client at a root, a built quiver beneath it |

Every verb takes `--quiver <dir>`, the collection root where `Quiver.yaml` lives, defaulting to the working directory. `build`, `studio` and `site` take `--out <dir>`; `studio` and `site` take `--client <dir>` to serve a client other than the one your collection installs.

## Gating

`test` is what you are **blocked on**: it runs in CI, against your own wasm, and installs no app.

```jsonc
// package.json
{
	"scripts": { "test": "quillkit test" }
}
```

It loads the source layout with `fromDir`, then compiles and renders every quill's example document, seeded from the blueprint's `example:` values. It finds the engine itself: a named `engine` export from `quillkit.config.js` at the collection root, else `@quillmark/wasm` from your own `node_modules`.

On vitest, jest or `node:test`, spawn the bin rather than rebuilding the loop against the library. The gate stays one implementation, and the case gates what CI gates:

```ts
import { execFileSync } from 'node:child_process';

it('gates the quiver', () => {
	execFileSync('quillkit', ['test'], { stdio: 'inherit' });
});
```

## Looking at it

`studio` is what you **look at**: it packs your source, serves [`@quillmark/studio`](../studio#readme) over it, and repacks whenever you save. Nothing fails a build on its verdict.

```sh
npm install --save-dev @quillmark/studio
npx quillkit studio
```

The document it holds is the blueprint's own, so what the gate renders is what you judge. Reload the page to pick up a repack.

## Shipping it

`site` writes the arrangement a deploy serves — the client at the root, a built quiver at `quiver/` beneath it, which is where the client looks — and asserts both halves of it.

```sh
npx quillkit site --out ./site
```

For GitHub Pages, call the reusable workflow rather than restating the layout:

```yaml
jobs:
  build:
    uses: borb-sh/quillmark-js/.github/workflows/studio-pages.yml@main
    with:
      quiver-dir: .
```

## Refusals

`build` and `site` clear what they write, so an `--out` that is, or contains, your collection or the working directory is refused rather than deleted. `build` assembles each generation beside its output and moves it in whole, so a client reading mid-pack sees the previous one and a failed pack leaves it serving.
