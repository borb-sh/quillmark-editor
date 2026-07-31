# Quillmark UI Canon Index

Canonical documentation for the `@quillmark/ui` package: the settled systems, describing what *is* and pointing into the code.

A thin overview, the two headline surfaces with their interaction and visual doctrine, and the supporting docs for the shared substrate:

- [ARCHITECTURE.md](ARCHITECTURE.md): the package at a glance; surfaces, substrate, data flow, the subpath public API, the playground shell, theming.
- [VISUAL_EDITOR.md](VISUAL_EDITOR.md): the federated WYSIWYG (shape/composition).
- [VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md): the VisualEditor's interaction and visual patterns.
- [AESTHETIC.md](AESTHETIC.md): the visual language: monochrome, typographic, restrained.
- [SURFACES.md](SURFACES.md): the surfaces' visual chrome: elevation, spacing rhythm, radius.
- [PREVIEW.md](PREVIEW.md): the live preview (paint, overlay, click bridge).
- [CODEC.md](CODEC.md): content (`Content`) ↔ ProseMirror.
- [DOCUMENT_MODEL.md](DOCUMENT_MODEL.md): boundary ledger: the exact `@quillmark/wasm` surface V1 consumes, its canon homes, and stability. Not a model doc; the `Document` is quillmark's.

Work that is not settled lives in GitHub issues.
The `--qm-*` theming baseline is catalogued in the package's [`THEMING.md`](../../THEMING.md).
The app that mounts these surfaces is [`packages/playground`](../../../playground/prose/canon/PLAYGROUND.md); the rules spanning the packages are the [workspace's](../../../../prose/canon/INDEX.md).
