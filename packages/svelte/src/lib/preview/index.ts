// `@quillmark/svelte/preview`: the live-preview surface.
//
// `createPreview(session)` (vanilla-TS core) + a thin `<Preview>` Svelte wrapper
// land here. RESERVED-PACKAGE INVARIANT: this subpath imports no editor-side code
// (the codec, the VisualEditor) so a `@quillmark/preview` promotion stays a
// re-export, not a refactor: it may reach `/core` (the shared WASM boundary) and
// nothing else. Enforced by `check:deps`, which walks the subpath's import graph.

// `/core`'s ENTRY, for the derivation it side-effect imports (THEMING.md). The
// surface reaches modules inside `core/` and never the entry, so without this line
// a consumer importing this subpath alone mounts against an undefined `--_qm-*`
// scale: every `var()` invalid at computed-value time, boxless controls under
// chrome that still reads as intact. The entry rather than the sheet, because
// `theme.css` carries no `exports` slot and the entry is what a subpath is allowed
// to name.
import '../core/index.js';

export { createPreview } from './controller.js';
export type { PreviewOptions, PreviewController } from './controller.js';
export { default as Preview } from './Preview.svelte';

// What the preview SAYS when there is nothing to paint. Keyed and partial; the
// English is exported so a consumer composes against it rather than restating it.
// The merge is the surface's own: a consumer hands `strings` to a prop, never
// merges one.
export { DEFAULT_PREVIEW_STRINGS } from './strings.js';
export type { PreviewStrings, PreviewStringsInput } from './strings.js';
