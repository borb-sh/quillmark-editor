// Corpus + op-grained edit types, derived from the re-exported `Document`/codec
// signatures rather than imported by name.
//
// WHY: `@quillmark/wasm` 0.94.0 re-exports the `Quill`/`Document` classes and
// the schema/diagnostic types from its runtime root, but NOT the corpus edit
// vocabulary those classes speak — `RichText`, `Addr`, `Delta`, `LineOp`,
// `MarkOp`, `ChangeBundle`, `CardInput`. They live in the core build's `.d.ts`,
// and `@quillmark/wasm/core` is not an exported subpath, so `import type { Addr }
// from '@quillmark/wasm'` fails (verified: TS2305). The codec (Phase 3) cannot
// name the types it decodes to.
//
// Deriving them structurally off the method signatures is drift-proof: they
// track whatever the shipped `Document` actually accepts, so a boundary change
// is a compile error here, not silent skew. `/core` is the right home — healing
// the boundary gap is exactly what this seam is for. Filed upstream as
// prose/quillmark-issues/0001-corpus-types-not-exported.md; when the runtime
// re-exports them, this collapses to a plain `export type { … } from '…'`.

import type { Document } from '@quillmark/wasm';
import { mapPos } from '@quillmark/wasm';

/** A richtext write address: `{}` main body, `{card}` a card body, `{field}` a main field, `{card,field}` a card field. */
export type Addr = Parameters<Document['applyChange']>[0];
/** A committed corpus edit: text `delta`, then `lineOps`, then `markOps` (post-delta coords). */
export type ChangeBundle = Parameters<Document['applyChange']>[1];
/** Canonical richtext corpus — flat `text` over USV plus `lines`, `marks`, `islands`. */
export type RichText = Parameters<Document['install']>[1];
/** A CodeMirror-`ChangeSet`-isomorphic text splice over the USV corpus. */
export type Delta = ReturnType<Document['revise']>;
/** One text-delta op. */
export type DeltaOp = Delta['ops'][number];
/** A line/block edit — `split`/`join` splice `\n`; `setKind`/`setContainers` touch metadata. */
export type LineOp = NonNullable<ChangeBundle['lineOps']>[number];
/** A mark edit in post-delta coordinates — `add`/`remove`/`removeAnchor`. */
export type MarkOp = NonNullable<ChangeBundle['markOps']>[number];
/** One `\n`-separated segment of `RichText.text`: `containers` + `kind`, optional `continues`. */
export type RichTextLine = RichText['lines'][number];
/** A mark over char range `[start, end)` — formatting, `anchor` identity, or unknown `{type, attrs}`. */
export type RichTextMark = RichText['marks'][number];
/** A structured object (table, figure, …) occupying one `U+FFFC` island slot. */
export type RichTextIsland = RichText['islands'][number];
/** An ancestor block a line nests inside — `list_item` or `quote`. */
export type RichTextContainer = RichTextLine['containers'][number];
/** A card written into a document — the input twin of `Card`, accepted by `insertCard`/`pushCard`. */
export type CardInput = Parameters<Document['insertCard']>[1];
/** Which side of a same-position insertion `mapPos` lands a point on. */
export type Assoc = Parameters<typeof mapPos>[2];
