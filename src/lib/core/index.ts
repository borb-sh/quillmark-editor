// `@quillmark/editor/core` — the vanilla-TS substrate seam.
//
// This is the one boundary the rest of the package (and a vanilla consumer)
// crosses to reach `@quillmark/wasm`: the `Engine`/`Quill`/`Document` handles,
// the document-free content codec, and every boundary type the editor threads
// through its surfaces. Handles stay quillmark's — no wrapper types — per
// DOCUMENT_MODEL §What the editor owns. The codec (Phase 3) and the paint loop's
// core (Phase 2's `createPreview`) grow here as their phases land.

export { init } from './lifecycle.js';

// ── Handles + engine (values) ───────────────────────────────────────────────
// Re-exported verbatim from the canonical runtime; the editor holds the raw
// handles and frees them on teardown (LiveSession/Document/Quill each carry
// `free()`), while `--weak-refs` reclaims any it drops. The schema-bound writer/
// view doors (`quill.writer(doc)` / `quill.view(doc)`) return these classes;
// `MAIN_CARD_ADDR` is the named `{}` main-card selector the card-scoped verbs take.
export {
	Engine,
	Quill,
	Document,
	DocumentWriter,
	CardWriter,
	DocumentView,
	CardView,
	MAIN_CARD_ADDR
} from '@quillmark/wasm';

// ── Document-free content codec (values) ─────────────────────────────────────
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
	ContentHit,
	HitGranularity,
	FieldRegion,
	QuillmarkError
} from '@quillmark/wasm';

// Content + op-grained edit (Codec consumes these) — the whole vocabulary
// `Document`'s methods speak, re-exported verbatim from the runtime root.
export type {
	Content,
	ContentLine,
	ContentContainer,
	ContentMark,
	ContentIsland,
	Addr,
	CardAddr,
	Delta,
	Assoc,
	LineOp,
	MarkOp,
	ChangeBundle,
	CardInput,
	PathStep
} from '@quillmark/wasm';

// `DeltaOp` is the one type the root does not carry — it exports `Delta`, not its
// op union — so it is derived here.
import type { Delta } from '@quillmark/wasm';
/** One text-delta op — `retain` / `insert` / `delete`. */
export type DeltaOp = Delta['ops'][number];

// Cards, schema, diagnostics (VisualEditor consumes these). All on the runtime
// root, `CardInput` among the content block above.
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
