// The codec barrel — the bidirectional bridge between one content field (`Content`)
// and one ProseMirror document (CODEC). Decode (content → PM), lower (PM tr → a
// `ChangeBundle` for `applyChange`), the USV↔PM position map, and the `createField`
// prose leaf. Consumed by Phase 4 (the VisualEditor) and the codec test suite.

// ProseMirror's structural base styles, then the retint of the one hue they mint.
// Imported HERE because `createField` is what mounts a view — a consumer reaching
// the codec directly gets them with it, and the order is what makes the retint win.
import 'prosemirror-view/style/prosemirror.css';
import './prose.css';

// The prose leaf.
export { createField, emptyContent, proseLeafPlugins } from './field.js';
export type { CreateFieldOpts, FieldController } from './field.js';

// Schemas (the decode/encode target; Phase 4 mounts them).
export { blockSchema, inlineSchema, isInlineSchema } from './schema.js';

// Decode / encode / positions (tests + Phase 4).
//
// WHAT STAYS OFF THIS BARREL. The mark algebra (`markKey`, `pmMarkFromContent`,
// `contentDescriptorFromPM`, `anchorsFromContent`), the island bridge
// (`ISLAND_SLOT`, `islandEntryFromNode`), the schema predicate `isInlineSchema`,
// the `diff*` helpers, `scanDoc`, and `codePoints` are all reached by RELATIVE
// import inside `codec/` and by nothing else. A barrel entry for a symbol with no
// off-barrel caller is surface to keep honest for free — so they have none, and a
// future consumer adds one when it has a use.
export { decode, renderContent, usvLength } from './decode.js';
export { pmToContent, lower, insertReintroducesIslandSlot } from './encode.js';
export { usvToPM, pmToUsv, buildLineIndex } from './positions.js';
export type { LineIndex } from './positions.js';

// Reconciliation gate.
export { createReconciler, contentEqual } from './reconcile.js';
export type { Reconciler } from './reconcile.js';

// Input rules (Phase 4 mounts a subset; createField mounts all by default).
export { markdownInputRules, inputRulesPlugin } from './inputrules.js';

// The body leaf's list structure keys (issue #70) — `createField` binds them; the
// suite drives them directly.
export { listKeymap } from './lists.js';
