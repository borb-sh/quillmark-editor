// `@quillmark/editor/source`: the debug source view.
//
// A read-only text mirror of `Document.toMarkdown()`: a whole-document serialize
// the layer federation deletes, kept for debugging only (never an editable dual
// mode; VISUAL_EDITOR §Source view). `createSourceView(opts)` (vanilla-TS core) +
// a thin `<SourceView>` Svelte wrapper. Reaches `/core` (the `Document` handle)
// and nothing else: no third-party dependency, no `/preview` or `/visual` import.
export { createSourceView } from './view.js';
export type { SourceViewOptions, SourceViewController, SourceViewStrings } from './view.js';
export { DEFAULT_SOURCE_STRINGS } from './view.js';
export { default as SourceView } from './SourceView.svelte';
