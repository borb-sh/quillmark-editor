# Quillmark Editor Designs

In-flight design docs — scope only for now; content lands as we talk each through.

Two headline surfaces, a thin overview, and two supporting docs for the shared
substrate:

- [ARCHITECTURE.md](ARCHITECTURE.md) — the package at a glance; surfaces, substrate, data flow, public API.
- [VISUAL_EDITOR.md](VISUAL_EDITOR.md) — the headline WYSIWYG (shape/composition).
- [VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md) — the VisualEditor's interaction and visual patterns.
- [PREVIEW.md](PREVIEW.md) — the headline live preview.
- [CODEC.md](CODEC.md) — corpus (`RichText`) ↔ ProseMirror.
- [DOCUMENT_MODEL.md](DOCUMENT_MODEL.md) — boundary ledger: the exact `@quillmark/wasm` surface V1 consumes, its canon homes, and stability. Not a model doc — the `Document` is quillmark's.
