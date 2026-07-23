// The codec barrel — the bidirectional bridge between one content field (`Content`)
// and one ProseMirror document (CODEC). Decode (content → PM), lower (PM tr → a
// `ChangeBundle` for `applyChange`), the USV↔PM position map, and the `createField`
// prose leaf. Consumed by Phase 4 (the VisualEditor) and the codec test suite.

// The prose leaf.
export { createField, emptyContent, proseLeafPlugins } from './field.js';
export type { CreateFieldOpts, FieldController } from './field.js';

// Schemas (the decode/encode target; Phase 4 mounts them).
export { blockSchema, inlineSchema, isInlineSchema } from './schema.js';

// Decode / encode / positions (tests + Phase 4). The single-splice `diff*` helpers
// and `scanDoc` (+ its `PosRun` / `Scan` shapes) stay internal to the codec — used
// by `lower` / `buildLineIndex` over relative imports, never off this barrel.
export { decode, codePoints, usvLength } from './decode.js';
export { pmToContent, lower, diffToBundle, insertReintroducesIslandSlot } from './encode.js';
export { usvToPM, pmToUsv, buildLineIndex } from './positions.js';
export type { LineIndex } from './positions.js';

// Marks + islands (the algebra and node bridge).
export {
	isAnchor,
	pmMarkFromContent,
	contentDescriptorFromPM,
	markKey,
	anchorsFromContent
} from './marks.js';
export type { AnchorPos } from './marks.js';
export { ISLAND_SLOT, islandEntryFromNode } from './islands.js';
// Typed island props are pinned upstream (0.96.0); a props-aware consumer reads
// them off `ContentIsland.props`, re-exported here from `/core` for one import site.
export type { TableProps, ImageProps, TableCell } from '../index.js';

// Reconciliation gate.
export { createReconciler, contentEqual } from './reconcile.js';
export type { Reconciler } from './reconcile.js';

// Input rules (Phase 4 mounts a subset; createField mounts all by default).
export { markdownInputRules, inputRulesPlugin } from './inputrules.js';
