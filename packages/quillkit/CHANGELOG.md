# Changelog

`quillkit`. An entry is written into `## Unreleased` by the change that earns it; a release promotes that body to its own version section.

## Unreleased

The carried `@quillmark/wasm` is 0.103.0, where `init()` is the only door to `Quill` and `Document`. The studio and `test` await that gate and reach no class through it, so the resolution rules are unmoved.

**The bundle names what it carries.** The client compiles in `@quillmark/svelte`, `@quillmark/quiver` and `@quillmark/wasm`, and nothing in a consumer's tree records which copies: a browser resolves nothing, so there is no dependency edge to read. `dist/client/carried.json` names all three beside the bundle, the running client holds the same three in `__CARRIED__`, and each release's notes state them in one line. A sibling reads as its bare version where the released bytes are what shipped, and as `0.1.0+3.a1b2c3d`, `0.0.0+untagged.a1b2c3d` or `0.1.0+nogit` where that claim would not be true.

## v0.1.1 - 2026-08-08

The studio client carries the scale it draws with. The `@quillmark/svelte` it bundles declared itself prunable, so `vite build` dropped `core/theme.css` and the codec's three stylesheets out of the client: `studio` and `site` both served an editor whose controls had no border, no background, no padding and no tap floor, under chrome that read as intact. The tool ships its own client, so the fix arrives with this version rather than with a consumer's install.

## v0.1.0 - 2026-08-08

First published version. One bin over the whole author loop: `quillkit test` gates a quiver, `quillkit build` packs it, `quillkit studio` serves the surface over a repack loop, and `quillkit site` lays a deploy out. It replaces the `quillmark-quiver` and `quillmark-studio` bins, and `quiver.config.js` is `quillkit.config.js`.

It ships no runtime dependencies. The loader that packs and the engine that renders are resolved out of the collection's own `node_modules`, so a collection pins the format its quiver is written in and one copy packs however the pack is reached. The studio client is carried rather than resolved, at `dist/client`, so `studio` and `site` need nothing installed to serve it and take no flag naming another. It replaces `@quillmark/studio`, which is not published.
