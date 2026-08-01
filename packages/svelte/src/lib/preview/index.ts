// `@quillmark/svelte/preview`: the live-preview surface.
//
// `createPreview(session)` (vanilla-TS core) + a thin `<Preview>` Svelte wrapper
// land here. RESERVED-PACKAGE INVARIANT: this subpath imports no editor-side code
// (the codec, the VisualEditor) so a `@quillmark/preview` promotion stays a
// re-export, not a refactor: it may reach `/core` (the shared WASM boundary) and
// nothing else. Enforced by tests/preview-boundary.test.ts.
export { createPreview } from './controller.js';
export type { PreviewOptions, PreviewController } from './controller.js';
export { default as Preview } from './Preview.svelte';

// What the preview SAYS when there is nothing to paint. Keyed and partial; the
// English is exported so a consumer composes against it rather than restating it.
export { DEFAULT_PREVIEW_STRINGS, mergePreviewStrings } from './strings.js';
export type { PreviewStrings, PreviewStringsInput } from './strings.js';
