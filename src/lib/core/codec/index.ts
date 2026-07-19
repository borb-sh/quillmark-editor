// The codec barrel — the bidirectional bridge between one content field (`Content`)
// and one ProseMirror document (CODEC). Decode (content → PM), lower (PM tr → a
// `ChangeBundle` for `applyChange`), the USV↔PM position map, and the `createField`
// prose leaf. Consumed by Phase 4 (the VisualEditor) and the codec test suite.

// The prose leaf.
export { createField } from './field.js';
export type { CreateFieldOpts, FieldController } from './field.js';

// Schemas (the decode/encode target; Phase 4 mounts them).
export { blockSchema, inlineSchema, isInlineSchema } from './schema.js';

// Decode / encode / positions (tests + Phase 4).
export { decode, codePoints, usvLength } from './decode.js';
export {
	pmToContent,
	lower,
	diffToBundle,
	diffText,
	diffLines,
	diffMarks,
	structureNeedsInstall,
	scanDoc
} from './encode.js';
export type { PosRun, Scan } from './encode.js';
export { usvToPM, pmToUsv, buildLineIndex } from './positions.js';
export type { LineIndex } from './positions.js';

// Marks + islands (the algebra and typed props).
export {
	isAnchor,
	isFormatting,
	pmMarkFromContent,
	contentDescriptorFromPM,
	markKey,
	anchorsFromContent
} from './marks.js';
export type { AnchorPos } from './marks.js';
export { ISLAND_SLOT, imageProps, tableProps, islandEntryFromNode } from './islands.js';
export type {
	IslandImageProps,
	IslandTableProps,
	IslandTableCell,
	IslandTableAlign
} from './islands.js';

// Reconciliation gate.
export { createReconciler, contentEqual } from './reconcile.js';
export type { Reconciler } from './reconcile.js';

// Markdown edges (paste / copy / debug).
export { pasteMarkdown, copyMarkdown, copyWouldDrop } from './markdown.js';
export type { PasteResult, CopyLoss } from './markdown.js';

// Input rules (Phase 4 mounts a subset; createField mounts all by default).
export { markdownInputRules, inputRulesPlugin } from './inputrules.js';
