// The codec barrel: the bidirectional bridge between one content field (`Content`)
// and one ProseMirror document (CODEC). Decode (content → PM), lower (PM tr → a
// `ChangeBundle` for `applyChange`), the USV↔PM position map, and the `createField`
// prose leaf. Consumed by the VisualEditor and the codec test suite.

// ProseMirror's structural base styles, then the retint of the one hue they mint.
// Imported HERE because `createField` is what mounts a view: a consumer reaching
// the codec directly gets them with it, and the order is what makes the retint win.
import 'prosemirror-view/style/prosemirror.css';
import './prose.css';

// The prose leaf.
export { createField, emptyContent, proseLeafPlugins } from './field.js';
export type { CreateFieldOpts, FieldController } from './field.js';

// Schemas (the decode/encode target; the VisualEditor mounts them).
export { blockSchema, inlineSchema } from './schema.js';

// Decode / encode / positions (tests + VisualEditor).
//
// THE BARREL CARRIES WHAT HAS AN OFF-BARREL CALLER, and nothing else. The mark
// algebra, the island bridge, the schema predicate, the `diff*` helpers,
// `scanDoc`, `codePoints`: every one of them is reached by RELATIVE import
// within `codec/`, so none of them is here. An export nothing imports is surface
// that still has to stay honest; a symbol earns its line when a caller outside
// this folder wants it.
export { decode, renderContent, usvLength } from './decode.js';
export { pmToContent, contentEdit, lower, insertReintroducesIslandSlot } from './encode.js';
export type { ContentEdit } from './encode.js';
export { usvToPM, pmToUsv, buildLineIndex } from './positions.js';
export type { LineIndex } from './positions.js';

// Reconciliation gate.
export { createReconciler, contentEqual } from './reconcile.js';
export type { Reconciler } from './reconcile.js';

// Input rules (`createField` mounts them unless `noInputRules`/`plaintext`).
export { inputRulesPlugin } from './inputrules.js';

// The body leaf's structural keys: `createField` binds the composed chains
// (`bodyKeymap`); the suite drives both it and the list link directly.
export { bodyKeymap } from './keymap.js';
export { listKeymap } from './lists.js';
