---
'@quillmark/svelte': minor
---

First published version. The surfaces over a `@quillmark/wasm` session ship under four subpaths: `/core` (the `DocPath`/`Place` address vocabulary, the `EditorError` channel, `init`), `/preview` (`createPreview` + `<Preview>`), `/visual` (`<VisualEditor>` and the codec's `createField` leaf), `/source` (`createSourceView` + `<SourceView>`). `svelte@^5` and `@quillmark/wasm@>=0.100.0-0` are peers: the consumer owns the session and the handles cross untouched. Pre-1.0, so a minor is where a break lands.
