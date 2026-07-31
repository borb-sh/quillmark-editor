// `@quillmark/editor/preview`: the live-preview surface.
//
// `createPreview(session)` (vanilla-TS core) + a thin `<Preview>` Svelte wrapper
// land here. RESERVED-PACKAGE INVARIANT: this subpath imports no editor-side code
// (the codec, the VisualEditor) so a `@quillmark/preview` promotion stays a
// re-export, not a refactor: it may reach `/core` (the shared WASM boundary) and
// nothing else. Enforced by tests/preview-boundary.test.ts.
export { createPreview } from './controller.js';
export type { PreviewOptions, PreviewController, CaretTarget } from './controller.js';
export { default as Preview } from './Preview.svelte';
