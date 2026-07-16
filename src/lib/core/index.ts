// `@quillmark/editor/core` — the vanilla-TS substrate seam.
//
// This is the one boundary the rest of the package (and a vanilla consumer)
// crosses to reach `@quillmark/wasm`: the `Engine`/`Quill`/`Document` handles,
// the document-free corpus codec, and every boundary type the editor threads
// through its surfaces. Handles stay quillmark's — no wrapper types — per
// DOCUMENT_MODEL §What the editor owns. The codec (Phase 3) and the paint loop's
// core (Phase 2's `createPreview`) grow here as their phases land.

export { init } from './lifecycle.js';

// ── Handles + engine (values) ───────────────────────────────────────────────
// Re-exported verbatim from the canonical runtime; the editor holds the raw
// handles and frees them on teardown (LiveSession/Document/Quill each carry
// `free()`), while `--weak-refs` reclaims any it drops.
export { Engine, Quill, Document, DocumentWriter, CardWriter } from '@quillmark/wasm';

// ── Document-free corpus codec (values) ─────────────────────────────────────
// The markdown edges and position-map primitives Phase 3 composes; re-exported
// so the codec never reaches around `/core` to the package root.
export { importMarkdown, exportMarkdown, rebase, mapPos, isQuillmarkError } from '@quillmark/wasm';

// ── Boundary types ──────────────────────────────────────────────────────────
// The exact surface DOCUMENT_MODEL pins. Split by origin only for reading; a
// consumer sees one flat namespace.

// Render / session / paint (Preview consumes these).
export type {
	LiveSession,
	EngineOptions,
	BackendDescriptor,
	RenderOptions,
	RenderResult,
	Artifact,
	OutputFormat,
	PageSize,
	PaintOptions,
	PaintResult,
	ChangeSet,
	CorpusHit,
	HitGranularity,
	FieldRegion,
	QuillmarkError
} from '@quillmark/wasm';

// Corpus + op-grained edit (Codec consumes these). Not re-exported by the WASM
// runtime root — derived structurally; see wasm-types.ts.
export type {
	RichText,
	RichTextLine,
	RichTextContainer,
	RichTextMark,
	RichTextIsland,
	Addr,
	Delta,
	DeltaOp,
	Assoc,
	LineOp,
	MarkOp,
	ChangeBundle,
	CardInput
} from './wasm-types.js';

// Cards, schema, diagnostics (VisualEditor consumes these). `Card` is exported
// by the runtime root; `CardInput` is not — it rides the corpus block above.
export type {
	Card,
	PayloadItem,
	QuillSchema,
	QuillFieldSchema,
	QuillCardSchema,
	QuillCardBody,
	QuillFieldUi,
	QuillCardUi,
	QuillMetadata,
	Diagnostic,
	Location,
	Severity
} from '@quillmark/wasm';
