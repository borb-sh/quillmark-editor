# @quillmark/studio

The quill author's surface, as a static client: pick a quill, edit, watch it paint, read the errors. `quillkit test` answers _does it work_; studio answers _what is it like to use_.

The package is **the client and nothing else**. `dist` is what `vite build` produced, with `@quillmark/svelte`, `@quillmark/quiver` and `@quillmark/wasm` bundled in. It has no runtime dependencies, no importable entry and no bin: it is served rather than imported or run, and [`quillkit`](../quillkit#readme) is what serves it.

## The local loop

```sh
npm install --save-dev quillkit @quillmark/studio @quillmark/quiver @quillmark/wasm
npx quillkit studio
```

`quillkit studio` packs your collection, serves this client over it and repacks when you save; reload the page to pick up a repack. `quillkit site --out <dir>` lays out the same arrangement a deploy serves. Both resolve this package out of your own `node_modules`, or take `--client <dir>` naming one directly. Neither instantiates an engine; nothing renders on the server.

## Deploying a quiver to GitHub Pages

The workflow below builds your quiver, lays the client over it and uploads the Pages artifact; the deploy stays yours, so nothing outside your repository holds `pages: write`.

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

Inputs, all optional: `quiver-dir` (default `.`), `studio-package` (default `@quillmark/studio@latest`), `quillkit-package` (default `quillkit@latest`), `node-version` (default `22`), and `upload` (default `true`), which this repository's own CI sets false to assemble and assert the site without minting an artifact.

Nothing else is configured. The workflow runs `quillkit site`, which packs files and instantiates nothing, so the deploy installs no wasm; when your repository already has `@quillmark/quiver` installed, that copy is the one it packs with.

## Serving it anywhere else

The client resolves its quiver against `document.baseURI` and its assets relatively, so any static host works and no rebuild is needed per URL. `quillkit site --out <dir>` produces the arrangement and asserts it; the arrangement itself is two rules:

- The client's files at some base, and a built quiver at `quiver/` under that same base.
- The client carries no quiver of its own. One packed inside it would occupy the URL the built one is served from.

## What it is not

A Typst IDE: studio shows a quill, it does not edit the plate or the schema. Not a CMS: no auth, no persistence, no multi-document management. Not a gate: `quillkit test` is blocked on, studio is looked at.

A deployed quiver is frozen at a commit, so the repack loop — save a plate, watch the document carry into whatever came out — is the local one, over a working tree.

## The engine it renders through

The head names the `@quillmark/wasm` the client was built with. Your `quillkit test` runs whatever your own tree holds, and nothing at runtime reconciles the two: the gate is authoritative, studio is advisory.

## License

Apache-2.0
