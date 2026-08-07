# quillkit

## 0.1.0

The quill author's toolchain, cut out of `@quillmark/quiver` and `@quillmark/studio` as one bin.

- `quillkit test` — the gate, formerly `quillmark-quiver test`.
- `quillkit build` — the pack, formerly `quillmark-quiver build`.
- `quillkit studio` — the local loop, formerly `quillmark-studio dev`.
- `quillkit site` — the deploy layout, formerly `quillmark-studio site`.

The loader, the engine and the client are resolved out of the collection's own `node_modules`; this package ships no runtime dependencies. `quiver.config.js` is now `quillkit.config.js`.
