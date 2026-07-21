# Codec

Scope: the bidirectional codec between one content field (`Content`) and one
ProseMirror document — decode (content → PM), the transaction lowering (PM → a
`ChangeBundle` for `applyChange`), and the USV ↔ PM position map that carries the
caret. One field, one PM doc; the VisualEditor composes many. Markdown is not in
this loop — it is an edge codec (§Markdown at the edges), never the edit
representation.

Grounds on quillmark's `Content` model and its WASM edit surface (canon:
quillmark `prose/canon/DOCUMENT_STORAGE.md`, `CONVERT.md`; the WASM
`Card.body` / `install` / `applyChange` / `positionAt` API). The preview↔editor
half of the caret bridge lives in [PREVIEW.md](PREVIEW.md).

Implementation: `src/lib/core/codec/` — `decode.ts` (content → PM), `encode.ts`
(PM → `ChangeBundle`), `positions.ts` (the USV↔PM map), `marks.ts` / `islands.ts`
(the mark algebra and island props), `reconcile.ts` (the field-scoped rehydrate
gate), `markdown.ts` (the paste/copy edges), `inputrules.ts` + `schema.ts` (the PM
schema and shorthands), and `field.ts` — `createField`, the prose leaf that wires
them to one PM view.

## The two models

The `Content` model is one flat `text` over Unicode scalar values (`\n` a line
boundary, `U+FFFC` an island slot), a `lines` list (each a `kind` + a
`containers` path + a `continues` flag) from which the block tree is *derived*, a
set of freely-overlapping `marks`, and `islands`. It carries no node identity
beyond island ids and `anchor` mark ids; a paragraph split or join is a
one-character text edit.

ProseMirror is a nested node tree whose inline text carries a *set* of marks and
whose positions count node boundaries; its identity is the tree itself.

Bridging the two is the codec's whole job: **flat-text-with-attributes ↔
nested-tree**. It is a translation layer, not a thin adapter — the content
normalizes on every write, PM has no overlapping-mark or zero-width-mark concept,
and neither side's positions are the other's.

## Direction: the content is truth; PM is its projection; edits are ops

Decode is a pure function content → PM. Encode does **not** rebuild a `Content`
and `install` it — it lowers each PM transaction to a `ChangeBundle { delta?,
lineOps?, markOps? }` and calls `doc.applyChange(addr, bundle)`. Op-based,
because:

- **anchors survive.** `install` is value semantics — it drops the identity
  anchors (comment threads, stable references) of the previous value.
  `applyChange` splices, so anchors rebase through the edit.
- **it is the seam's grain.** The `delta` channel is CodeMirror-`ChangeSet`
  isomorphic; marks and line attributes are separate op channels by design. A PM
  transaction already carries the splice (a `ReplaceStep`'s `from`/`to`/`slice`)
  and the mark steps — lowering reads them out in USV coordinates, it does not
  re-diff.

`install(addr, rt)` stays as the escape hatch for a transaction too tangled to
lower precisely (a structural paste); it costs that field's anchors, so it is the
exception, not the path.

## Decode — content → PM

Fold the flat lines into the tree: group consecutive lines by common
`containers` prefix (a shared `[ListItem]` path is one item's paragraphs;
`[ListItem, Quote]` a quote nested in it), and join `continues` runs into one
block (a code fence's lines → one `code_block`; a paragraph's hard breaks → one
paragraph with `hard_break` nodes). `LineKind` selects the block node:
`Para` → paragraph, `Heading{level}`, `Code{lang}`, `Rule` → horizontal_rule,
`Island` → a block island node.

Marks apply over their `[start, end)` range; PM splits inline nodes at mark
boundaries, so free overlap of *different* formatting kinds is representable
without loss (`strong[0,4)` + `emph[2,6)` → text nodes `{strong}`,
`{strong,emph}`, `{emph}`). An island slot inside a `Para` line decodes to an
inline node (an image); an `Island`-kind line decodes to a block node (a table),
either carrying the island `id` and typed props.

Two mark kinds do **not** become PM marks — see §Marks.

## Encode — PM transaction → `ChangeBundle`

Lower `tr.steps` to the three channels in `applyChange`'s application order
(`delta` first, then `lineOps`, then `markOps` in *post-delta* coordinates):

- **text** — a `ReplaceStep`'s flat text change becomes `delta` ops
  (`retain` / `insert` / `delete`) over USV.
- **structure** — the same step's block-boundary effect (an open slice that
  splits or joins), plus explicit structural commands, becomes `lineOps`: Enter
  in a paragraph is `split{at}`; a joining Backspace is `join{line}`; a heading
  toggle is `setKind`; list indent/outdent and blockquote wrap are
  `setContainers`.
- **formatting** — `addMark` / `removeMark` steps become `markOps` `add` /
  `remove` over post-delta USV ranges.
- **anchors** — decoration adds/removes become `add {type:"anchor", id}` /
  `removeAnchor {id}`.

Line indices and mark ranges are computed against the *post-delta* content, so the
bundle reads the same way `applyChange` applies it.

## Positions — USV ↔ PM

`usvToPM(pos)` / `pmToUsv(pmPos)`: a content USV offset is a character index
into `text` (with `\n` and `U+FFFC` each one USV); a PM position counts node
tokens. The map walks the line structure — PM inline offset `k` in block `N` is
`lineStart(N) + k` — held as a `line → USV start` index and rebuilt on structural
change. This is the function a `positionAt` result (`ContentHit.pos`) and a
`FieldRegion.span` pass through to reach a PM caret, and the one `locate` runs in
reverse for the preview overlay.

**UTF-16 hazard.** JS strings — and the text offsets inside PM positions — are
UTF-16; content offsets are USV (code points). An astral character is two UTF-16
units but one USV, so the map converts; skip it and a caret drifts one unit per
emoji it passes. quillmark's `usv` helper does not cross to WASM — the codec owns
the conversion.

## Marks — formatting vs identity

The content mark set is two algebra classes, and they route to two different PM
mechanisms:

- **formatting** (`strong` / `emph` / `underline` / `strike` / `code` / `link`)
  is a property of a range. ↔ PM marks. A round-trip through PM yields the union
  ranges, which is what content normalization produces anyway, so formatting is
  stable.
- **identity** (`anchor{id}` — comment threads, stable references; zero-width
  capable, no glyph) is a handle, not a property. It has no home as a PM mark (a
  PM mark needs a text node and carries no zero-width span). ↔ **PM decorations**
  (or plugin-held positions) keyed by id, carried across edits by `tr.mapping`
  and lowered to `anchor` mark ops. This split is what dissolves the "Peritext
  overlap vs nested marks" tension: overlap only bites where identity and
  formatting coexist, and they never share a mechanism.
- **unknown** (`{tag, attrs}`) is the open-set escape hatch. ↔ an inert PM mark
  that renders nothing and re-emits verbatim; it must survive a round-trip
  untouched.

## Islands

A table or figure is one `U+FFFC` slot plus one `Island {id, type, props,
loss}`. Decode maps it to a PM leaf node (block or inline by the slot's line);
encode writes the slot char and the entry with its `id` preserved (stable
identity, like an anchor). Known types carry a typed props schema in the codec
(`table: {header, rows, aligns}`, `image: {url, alt}`); unknown types pass
opaque. **Seam risk:** `Island.props` is typed `unknown` at the WASM boundary, so
the codec's table/image schemas track a shape the surface does not pin — a
candidate for a typed island surface upstream.

## Inline mode

`richtext(inline)` and `plaintext` fields are single-paragraph, container-free,
island-free. The codec runs a constrained PM schema (one textblock, no block
splitting, Enter suppressed); `plaintext` additionally strips all marks. Same
decode / lower / position machinery, narrower schema. No WASM plaintext string
codec exists — the content-object round-trip via `install` / `applyChange` is the
path; `importMarkdown` is the wrong tool on a plaintext field (it parses markdown
syntax).

## Markdown at the edges

Markdown never represents an edit, but it stays a boundary format:

- **paste** markdown → `rebase(fieldCorpus, md)` (cold import + diff, surviving
  anchors rebased) → splice the returned `delta`.
- **copy** → `exportMarkdown(rt)`, **lossy**: anchors, `underline`, and unknown
  marks have no markdown projection. Warn before a copy that would drop identity.
- **debug source view** — `Document.toMarkdown()`, read-only.

## Reconciliation

The content normalizes on write (marks sorted and same-kind-unioned, zero-width
formatting dropped, invariants enforced), so `decode ∘ lower` is idempotent only
*up to normalization* — a projected PM doc and the re-decoded stored content agree
after normalize, not byte-for-byte. The editor holds its optimistic PM state and
re-hydrates a field only on an **external** content change (another edit source, a
paste, a `revise`), gated by canonical-content equality scoped to the field that
changed — the analog of web-app's whole-document `Document.equals` gate, moved
onto the content and narrowed to one field. Caret continuity across the editor's
*own* edits is the VisualEditor's `StepMap`, not the codec's.

## Seams and deferrals

- **anchors are decorations, not a document mark.** Plugin-held positions keyed by
  id, mapped through `tr.mapping` and lowered to `anchor` ops — the split that
  keeps identity off PM's mark mechanism. A move into the document proper waits on
  comment-thread UX that needs it.
- **island props typing** is the one open seam: `ContentIsland.props` is `unknown`
  at the WASM boundary, so the codec's `table`/`image` schemas track a shape the
  surface does not pin (DOCUMENT_MODEL §Stability seams). A candidate for a typed
  island surface upstream.
- **complex-paste lowering** falls back to `install(addr, rt)` when a transaction
  is too tangled to lower precisely (a structural paste), paying that field's
  anchors. A content-level diff that would narrow the fallback is not exposed by
  the boundary today.
- **input rules and the PM schema** ship: the markdown shorthands (`**`, `#`,
  `- `, table entry) are PM input rules producing ordinary transactions this codec
  lowers; markdown is an input shorthand, never the stored form.
