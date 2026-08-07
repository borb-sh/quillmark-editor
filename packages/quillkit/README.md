# quillkit

The quill author's toolchain: one command over the whole loop. Gate a quiver, pack it, look at it, ship it.

## Install

```sh
npm install --save-dev quillkit @quillmark/quiver @quillmark/wasm
```

quillkit carries neither of the other two. It resolves both out of your collection's own `node_modules`, so the versions you pin are the format your quiver is packed in and the wasm your gate renders through. The studio client is the one thing it does carry: `studio` and `site` serve it out of the tool's own `dist/client`, so there is nothing to install for it and nothing to keep in step.

## The verbs

| Verb              | What it does                                                       |
| ----------------- | ------------------------------------------------------------------ |
| `quillkit test`   | the gate: every quill's example document compiles and renders      |
| `quillkit build`  | pack the source layout into a servable artifact                    |
| `quillkit studio` | the local loop: pack, serve, repack on save                        |
| `quillkit site`   | the deploy layout: the client at a root, a built quiver beneath it |

Every verb takes `--quiver <dir>`, the collection root where `Quiver.yaml` lives, defaulting to the working directory. `build`, `studio` and `site` take `--out <dir>`; `studio` and `site` take `--client <dir>` to serve a client other than the one this package ships.

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

`studio` is what you **look at**: it packs your source, serves the studio client over it, and repacks whenever you save. Nothing fails a build on its verdict.

```sh
npx quillkit studio
```

Pick a quill, edit, watch it paint, read the errors. `quillkit test` answers _does it work_; studio answers _what is it like to use_. The document it holds is the blueprint's own, so what the gate renders is what you judge. Reload the page to pick up a repack.

It shows a quill rather than editing one: no plate editing, no schema editing, no auth, and nothing it holds outlives the tab.

The client renders through the `@quillmark/wasm` it was built against, and the head names it; your `quillkit test` runs whatever your own tree holds, and nothing at runtime reconciles the two. The gate is authoritative, studio is advisory.

## Shipping it

`site` writes the arrangement a deploy serves (the client at the root, a built quiver at `quiver/` beneath it, which is where the client looks) and asserts both halves of it.

```sh
npx quillkit site --out ./site
```

The client resolves its quiver against `document.baseURI` and its assets relatively, so any static host works and no rebuild is needed per URL. The arrangement itself is two rules: the client's files at some base with a built quiver at `quiver/` under that same base, and no quiver inside the client, since one packed there would occupy the URL the built one is served from.

For GitHub Pages, call the reusable workflow rather than restating the layout. It builds your quiver, lays the client over it and uploads the Pages artifact; the deploy stays yours, so nothing outside your repository holds `pages: write`.

```yaml
# .github/workflows/studio.yml
name: Studio
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  build:
    uses: borb-sh/quillmark-js/.github/workflows/studio-pages.yml@main
    with:
      quiver-dir: .
  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Inputs, all optional: `quiver-dir` (default `.`), `quillkit-package` (default `quillkit@latest`), `node-version` (default `22`), and `upload` (default `true`), which this repository's own CI sets false to assemble and assert the site without minting an artifact. Nothing else is configured. The workflow runs `quillkit site`, which packs files and instantiates nothing, so the deploy installs no wasm; when your repository already has `@quillmark/quiver` installed, that copy is the one it packs with.

A deployed quiver is frozen at a commit, so the repack loop is the local one, over a working tree.

## Refusals

`build` and `site` clear what they write, so an `--out` that is, or contains, your collection or the working directory is refused rather than deleted. `build` assembles each generation beside its output and moves it in whole, so a client reading mid-pack sees the previous one and a failed pack leaves it serving.
