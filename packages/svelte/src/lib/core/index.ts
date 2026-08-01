// The theme derivation: the public dials → the private `--_qm-*` scale, applied
// to every `data-qm-root` element. Imported HERE because `core/` is the one module
// both `preview/` and `visual/` already pull, so a consumer cannot forget it and
// the derivation is minted once rather than re-declared per detached root
// (THEMING.md).
import './theme.css';

// `@quillmark/svelte/core`: the vanilla-TS substrate seam.
//
// This is the one boundary the rest of the package (and a vanilla consumer)
// crosses to reach `@quillmark/wasm`: the `Engine`/`Quill`/`Document` handles,
// the document-free content codec, and every boundary type the editor threads
// through its surfaces. Handles stay quillmark's (no wrapper types) per
// DOCUMENT_MODEL §What the editor owns. The codec and the paint loop's
// `createPreview` grow here.

export { init } from './lifecycle.js';

// ── Handles + engine (values) ───────────────────────────────────────────────
// Re-exported verbatim from the canonical runtime; the editor holds the raw
// handles and frees them on teardown (LiveSession/Document/Quill each carry
// `free()`), while `--weak-refs` reclaims any it drops. The schema-bound writer/
// reader doors (`quill.writer(doc)` / `quill.reader(doc)`) return these classes;
// `MAIN_CARD_ADDR` is the named `{}` main-card selector the card-scoped verbs take.
export {
	Engine,
	Quill,
	Document,
	DocumentWriter,
	CardWriter,
	DocumentReader,
	CardReader,
	MAIN_CARD_ADDR
} from '@quillmark/wasm';

// ── Document-free content codec (values) ─────────────────────────────────────
// The markdown edges and position-map primitives the codec composes, plus the
// `DocPath` parser/serializer the address routing (diagnostics + caret bridge)
// runs on: re-exported so the codec never reaches around `/core` to the package
// root.
export {
	importMarkdown,
	exportMarkdown,
	rebase,
	mapPos,
	parseDocPath,
	formatDocPath,
	isQuillmarkError,
	// Open-set discriminant guards: mark `type`, line `kind`, and container name
	// each carry a residual `{ …: string; attrs }` arm, so a bare `===` leaves the
	// payload opaque. These are the checked narrowing the codec reads off the
	// boundary instead of re-deriving (anchor id, link url, heading level, code
	// lang, list shape).
	isAnchorMark,
	isLinkMark,
	isHeadingLine,
	isCodeLine,
	isListItemContainer
} from '@quillmark/wasm';

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

// Content + op-grained edit (Codec consumes these): the whole vocabulary
// `Document`'s methods speak, re-exported verbatim from the runtime root. The
// island-props triple (`TableProps` / `ImageProps` / `TableCell`) is pinned
// upstream (`ContentIsland.props` is the typed union), so the codec reads it
// instead of hand-rolling the shape.
export type {
	Content,
	ContentLine,
	ContentContainer,
	ContentMark,
	ContentIsland,
	TableProps,
	ImageProps,
	TableCell,
	Addr,
	CardAddr,
	Delta,
	Assoc,
	LineOp,
	MarkOp,
	ChangeBundle,
	CardInput,
	PathStep,
	DocPathSeg
} from '@quillmark/wasm';

// Resolved-value view (`quill.resolve(doc)`): value + provenance per declared
// field. The form reads AUTHORED values (`values`), not this render projection;
// the VisualEditor consumes `resolve` on a parallel channel for provenance only:
// the ghosted `default:` and the `FieldSource` rung (FIELD_PROVENANCE), never the
// control value.
export type {
	FieldSource,
	ResolvedField,
	ResolvedMain,
	ResolvedCard,
	Resolved
} from '@quillmark/wasm';

// `DeltaOp` is the one type the root does not carry (it exports `Delta`, not its
// op union), so it is derived here.
import type { Delta } from '@quillmark/wasm';
/** One text-delta op: `retain` / `insert` / `delete`. */
export type DeltaOp = Delta['ops'][number];

// ── What the surfaces say in public ─────────────────────────────────────────
// The address vocabulary every hook naming a place speaks, and the error channel
// every surface reports a recovered failure through. Both live here because both
// `/preview` and `/visual` need them: declared in either one, the other either
// imports across a boundary the package keeps closed or declares its own copy.
export type { DocPath, Place } from './address.js';
export { reportError, errorMessage } from './errors.js';
export type { EditorError, EditorErrorCode, EditorErrorHandler } from './errors.js';

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
	QuillGroupUi,
	QuillMetadata,
	Diagnostic,
	Location,
	Severity
} from '@quillmark/wasm';
