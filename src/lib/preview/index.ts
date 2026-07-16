// `@quillmark/editor/preview` — the live-preview surface (Phase 2).
//
// `createPreview(session)` (vanilla-TS core) + a thin `<Preview>` Svelte wrapper
// land here. RESERVED-PACKAGE INVARIANT: this subpath imports no editor-side code
// (the codec, the VisualEditor) so the eventual `@quillmark/preview` promotion
// stays a re-export, not a refactor — it may reach `/core` (the shared WASM
// boundary) and nothing else. Enforced by tests/preview-boundary.test.ts.
export {};
