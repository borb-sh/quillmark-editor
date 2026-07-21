// `@quillmark/editor/source` — the debug source view (Phase 5).
//
// A read-only CodeMirror surface over `Document.toMarkdown()` — a whole-document
// serialize the layer federation deletes, kept for debugging only (never an
// editable dual mode; VISUAL_EDITOR §Source view). `createSourceView(opts)`
// (vanilla-TS core) + a thin `<SourceView>` Svelte wrapper. Reaches `/core`
// (the `Document` handle) and CodeMirror; no `/preview` or `/visual` import.
export { createSourceView } from './view.js';
export type { SourceViewOptions, SourceViewController } from './view.js';
export { default as SourceView } from './SourceView.svelte';
