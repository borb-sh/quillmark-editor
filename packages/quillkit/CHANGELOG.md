# Changelog

`quillkit`. An entry is written into `## Unreleased` by the change that earns it; a release promotes that body to its own version section.

## Unreleased

## v0.3.0 - 2026-08-14

Carries `@quillmark/svelte` 0.5.0, `@quillmark/quiver` 0.23.0, `@quillmark/wasm` 0.105.0.

The carried `@quillmark/wasm` is 0.105.0. A quill under test declaring `""` among an enum's `values:` now fails to load, the blank being the engine's to supply; and the studio's notes gain a `must_fill` warning per obliged cell the document leaves unauthored, which is the studio reporting the completeness signal a consumer's editor will show.

The studio's paint stops following the caret when the focus lands on a leaf that reports none: a click into any form control left it following the leaf the focus left, and each keystroke typed into the control scrolled the paint back there. The bridge wires `onActiveLeafChange={preview.endFollow}` beside the caret hop it already had.

## v0.2.2 - 2026-08-13

Carries `@quillmark/svelte` 0.4.0, `@quillmark/quiver` 0.21.0, `@quillmark/wasm` 0.104.0.

The carried `@quillmark/wasm` is 0.104.0. The studio and `test` name no field address and read no schema domain, so the release's breaks reach neither; a quill under test that authors the retired `enum:` modifier now fails to parse, which is the studio reporting what the engine will.

## v0.2.1 - 2026-08-11

Carries `@quillmark/svelte` 0.3.0, `@quillmark/quiver` 0.21.0, `@quillmark/wasm` 0.103.0.

## v0.2.0 - 2026-08-11

Carries `@quillmark/svelte` 0.3.0, `@quillmark/quiver` 0.21.0, `@quillmark/wasm` 0.103.0.

The carried `@quillmark/wasm` is 0.103.0, where `init()` is the only door to `Quill` and `Document`. The studio and `test` await that gate and reach no class through it, so the resolution rules are unmoved.

**The bundle names what it carries.** The client compiles in `@quillmark/svelte`, `@quillmark/quiver` and `@quillmark/wasm`, and nothing in a consumer's tree records which copies: a browser resolves nothing, so there is no dependency edge to read. `dist/client/carried.json` names all three beside the bundle, the running client holds the same three in `__CARRIED__`, and each release's notes state them in one line. Each is the version its manifest states.

## v0.1.1 - 2026-08-08

The studio client carries the scale it draws with. The `@quillmark/svelte` it bundles declared itself prunable, so `vite build` dropped `core/theme.css` and the codec's three stylesheets out of the client: `studio` and `site` both served an editor whose controls had no border, no background, no padding and no tap floor, under chrome that read as intact. The tool ships its own client, so the fix arrives with this version rather than with a consumer's install.

## v0.1.0 - 2026-08-08

First published version. One bin over the whole author loop: `quillkit test` gates a quiver, `quillkit build` packs it, `quillkit studio` serves the surface over a repack loop, and `quillkit site` lays a deploy out. It replaces the `quillmark-quiver` and `quillmark-studio` bins, and `quiver.config.js` is `quillkit.config.js`.

It ships no runtime dependencies. The loader that packs and the engine that renders are resolved out of the collection's own `node_modules`, so a collection pins the format its quiver is written in and one copy packs however the pack is reached. The studio client is carried rather than resolved, at `dist/client`, so `studio` and `site` need nothing installed to serve it and take no flag naming another. It replaces `@quillmark/studio`, which is not published.
