// `@quillmark/editor/visual`: the WYSIWYG surface.
//
// The federated VisualEditor: a thin Svelte composition over many small editors.
// Each content leaf is the codec's `createField` prose leaf; scalar fields are
// form controls; structure/cards are the editor's own. Depends on `/core` and the
// codec. RELATIVE imports (not `$lib`): svelte-package ships this as-is.
export { default as VisualEditor } from './VisualEditor.svelte';

// The prose leaf is the codec's; re-exported so a `/visual` consumer reaches it
// without a second import from `/core`.
export { createField } from '../core/codec/index.js';
export type { CreateFieldOpts, FieldController } from '../core/codec/index.js';

// The projection types: useful to a consumer building its own chrome.
export type { ControlKind, FieldModel, GroupSection, CardModel } from './structure.js';

// Wording: the whole set the surface says, the package's own words to compose
// against, and the empty-body hook that is one entry in it (`strings.ts`).
export { DEFAULT_STRINGS, resolveStrings } from './strings.js';
export type { EditorStrings } from './strings.js';
export { DEFAULT_BODY_PLACEHOLDER } from './structure.js';
export type { BodyPlaceholder, BodyPlaceholderContext } from './structure.js';

// The `$ext.editor` write unit. A consumer seeding editor-side chrome
// state (a card title, the tips channel) goes through this rather than
// `storeExtNamespace`, which replaces the namespace and takes the sibling keys with
// it. The narrowing the editor applies to a seeded channel, so a consumer can check
// what will render.
export { patchEditorExt } from './ext.js';
export { tipsChannel } from './tips.js';

// What the editor emits. `CaretMove` is already the preview's `focusPosition`
// argument, so the bridge is `onCaretMove={preview.focusPosition}`; the mapping
// behind it is exported as the escape hatch, for a consumer addressing a leaf the
// editor has not just reported (a saved cursor, a deep link).
export type { CaretMove, ActiveField, EditorChange, CardContext } from './signals.js';
export { fieldPathForAddr } from './caret.js';
