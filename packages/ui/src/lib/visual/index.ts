// `@quillmark/ui/visual`: the WYSIWYG surface.
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

// Empty-body wording: the `bodyPlaceholder` hook's shape and the built-in string
// it replaces. Exported so a consumer can word one kind and defer to the package
// on the rest by returning `undefined`, or compose against the built-in.
export { DEFAULT_BODY_PLACEHOLDER } from './structure.js';
export type { BodyPlaceholder, BodyPlaceholderContext } from './structure.js';

// The `$ext.editor` write unit. A consumer seeding editor-side chrome
// state (a card title, the tips channel) goes through this rather than
// `storeExtNamespace`, which replaces the namespace and takes the sibling keys with
// it. The narrowing the editor applies to a seeded channel, so a consumer can check
// what will render.
export { patchEditorExt } from './ext.js';
export { tipsChannel } from './tips.js';

// The editor→preview caret-bridge address mapping: a consumer wiring
// `onCaretMove` to `preview.focusPosition` maps the editor `Addr` through this.
export { fieldPathForAddr } from './caret.js';
