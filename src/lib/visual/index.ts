// `@quillmark/editor/visual` — the WYSIWYG surface (Phase 4).
//
// The federated VisualEditor: a thin Svelte composition over many small editors.
// Each content leaf is the codec's `createField` prose leaf; scalar fields are
// form controls; structure/cards are the editor's own. Depends on `/core` and the
// codec. RELATIVE imports (not `$lib`) — svelte-package ships this as-is.
export { default as VisualEditor } from './VisualEditor.svelte';

// The prose leaf is the codec's; re-exported so a `/visual` consumer reaches it
// without a second import from `/core`.
export { createField } from '../core/codec/index.js';
export type { CreateFieldOpts, FieldController } from '../core/codec/index.js';

// The projection types — useful to a consumer building its own chrome.
export type { ControlKind, FieldModel, GroupSection, CardModel } from './structure.js';

// The editor→preview caret-bridge address mapping (Phase 5) — a consumer wiring
// `onCaretMove` to `preview.focusPosition` maps the editor `Addr` through this.
export { fieldPathForAddr } from './caret.js';
