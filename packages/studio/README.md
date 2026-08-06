# @quillmark/studio

The quill author's surface, as a static client: pick a quill, edit, watch it paint, read the errors. `quiver test` answers _does it work_; studio answers _what is it like to use_.

The package is a **static client rather than an application**. It carries `dist` and nothing else — no bin, no server, no watcher — with `@quillmark/svelte`, `@quillmark/quiver` and `@quillmark/wasm` bundled in. It has no runtime dependencies and exports no JS, so it is served rather than imported.

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

Inputs, all optional: `quiver-dir` (default `.`), `studio-package` (default `@quillmark/studio@latest`), `node-version` (default `22`), and `upload` (default `true`), which this repository's own CI sets false to assemble and assert the site without minting an artifact.

Nothing else is configured. `quiver build` packs files and instantiates nothing, so the deploy installs no wasm; when your repository already has `@quillmark/quiver` installed, the workflow uses that copy rather than fetching one.

## Serving it anywhere else

The client resolves its quiver against `document.baseURI` and its assets relatively, so any static host works and no rebuild is needed per URL. Two rules:

- Serve the client's files at some base, and a built quiver at `quiver/` under that same base — `quiver build --out <site>/quiver`.
- The client carries no quiver of its own. One packed inside it would occupy the URL the built one is served from.

## What it is not

A Typst IDE: studio shows a quill, it does not edit the plate or the schema. Not a CMS: no auth, no persistence, no multi-document management. Not a gate: `quiver test` is blocked on, studio is looked at.

A deployed quiver is frozen at a commit, so the repack loop — save a plate, watch the document carry into whatever came out — is the local one, over a working tree.

## The engine it renders through

The head names the `@quillmark/wasm` the client was built with. Your `quiver test` runs whatever your own tree holds, and nothing at runtime reconciles the two: the gate is authoritative, studio is advisory.

## License

Apache-2.0
