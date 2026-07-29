# Document Model — Boundary Ledger

> **Implementation**: `@quillmark/wasm` (the consumed surface) · `src/lib/core/` (the boundary door that re-exports it verbatim)

## TL;DR

**Not** a document-model design — the `Document`, its mutators, the WASM boundary,
and diagnostics are quillmark's, each with a canonical home in quillmark canon.
This ledger pins the *exact* quillmark surface `@quillmark/editor` V1 consumes,
cites where each is documented, and marks its stability. It is the one place the
version coupling to `@quillmark/wasm` is recorded; when a surface below moves, the
editor's dependency moves with it. `src/lib/core/` re-exports the whole surface
verbatim — the one door the rest of the package crosses to reach the WASM package.

**V1 builds on `@quillmark/wasm` 0.98.0.** Every verb in the table below is stable
as of that release. The settled ground it stands on: `store*` verbs for verbatim
writes, one unified `Addr` (`{card?, field?}`), the schema-bound `writer`/`reader`
doors (`quill.writer(doc)` / `quill.reader(doc)`), a card-first `insertCard(card,
at?)`, the quill-free transport read `getStored` (distinct from `reader.get`), the
`quill.resolve(doc)` value view, `code`-bearing mutator diagnostics, and the
canonized anchor-id policy (caller-supplied, unique, invariant) that lets the
editor mint anchors at a selection ([CODEC.md](CODEC.md) §Marks).

**The block vocabulary is open.** `ContentLine.kind` and
`ContentContainer.container` stand with the mark and island `type` as OPEN sets:
a construct this build does not know round-trips opaque rather than failing the
load. A bare discriminant check does not narrow past the residual arm, so the
checked path is the boundary's guards — `isHeadingLine` / `isCodeLine` /
`isListItemContainer` beside `isAnchorMark` / `isLinkMark` / `isTableIsland` /
`isImageIsland` — which the codec reads here instead of re-deriving, and each set
has a PM carrier so an unknown survives an edit ([CODEC.md](CODEC.md) §Open sets).

Content types (`Content` and its parts) and their ProseMirror mapping are the
editor's own work — [CODEC.md](CODEC.md), not here.

Cross-repo references read `quillmark prose/canon/X.md` (a different repo; links do
not resolve).

## The surface V1 consumes

Every verb below is on the WASM `Document` / `Quill` / `LiveSession` today (`impl
Document`, `impl LiveSession` in `crates/bindings/wasm/src/engine.rs`) unless the
Stability column says otherwise.

| Concern | Verbs / types | Canon | Stability |
| --- | --- | --- | --- |
| **Truth & seeding** | `quill.seedDocument` / `seedMain` / `seedCard(kind, overlay)`, `Quill.fromTree` / `toTree`, `quill.schema` / `blueprint` / `metadata`; `doc.seedOverlay(kind)` / `card(i)` / `cardIndexById(id)` | `SCHEMAS.md`, `CARDS.md`, `DOCUMENT_STORAGE.md`, `QUILL.md` | stable |
| **Typed writer / read view** (scalar/array/object + append) | `quill.writer(doc)` → `DocumentWriter` (`set` / `setAll` / `setBody` / `reviseField` / `addCard` / `removeCard` / `card(i)`); `quill.reader(doc)` → `DocumentReader` (`get` / `getBody` / `card(i)`) for schema-typed reads; `quill.resolve(doc)` → `Resolved` (value + `FieldSource` rung per field) | `PROGRAMMATIC.md`, `SCHEMAS.md` | stable |
| **Structure mutators** | `insertCard(card, at?)`, `moveCard(from, to)`, `setCardKind(i, kind)`, `removeCard(i)`, `storeExtNamespace({card}, ns, val)` (the `$ext.editor` write unit) | `CARDS.md`, `DOCUMENT_STORAGE.md` | stable |
| **Op-grained content edit** | `doc.applyChange(addr, bundle)`, `doc.install(addr, rt)`, `doc.revise(addr, md)` → `Delta`; unified `Addr` (`{card?, field?}`, bare string = `{field}`), `CardAddr`, `ChangeBundle`; `doc.storeField` / `storeFields` / `storeFill` / `getStored` / `removeField` (quill-free store lane) | `DOCUMENT_STORAGE.md`, `CONVERT.md` | stable |
| **Positions & markdown edges** | `importMarkdown` / `exportMarkdown` / `rebase` (→ `{content, delta}`) / `mapPos` (module-level); `parseDocPath` / `formatDocPath` (+ `DocPathSeg`) for canonical field-address routing; position→geometry queries (`positionAt` / `locate`) live on `LiveSession` (row below) | `references/markdown-spec.md`, `CONVERT.md` | stable |
| **Validation & diagnostics** | `quill.validate(doc)` → `Diagnostic[]` (`.path` a canonical `DocPath`), `Document.warnings`, `LiveSession.warnings`, `QuillmarkError` shape (mutator failures carry a `code` + `path`) | `SCHEMAS.md`, `ERROR.md` | stable |
| **Live session & paint** (preview) | `engine.open(quill, doc)` → `LiveSession` (`apply` → `ChangeSet`, `paint`, `pageSize`, `regions` / `fieldBoxes` / `fieldAt` / `positionAt` / `locate`, `supportsCanvas`, `warnings`); `PaintOptions` / `PaintResult` / `PageSize` / `ContentHit` / `FieldRegion` | quillmark `PREVIEW.md` | stable |

Consumed by: [CODEC.md](CODEC.md) (op-grained edit, positions, markdown edges),
[PREVIEW.md](PREVIEW.md) (live session & paint), [VISUAL_EDITOR.md](VISUAL_EDITOR.md)
(seeding, writer, structure mutators, validation).

**A ghost is not always a `default:`.** `resolve`'s `FieldSource` rung is the
boundary's, and a `default`-sourced row is a promise about the render: this is
what prints if you write nothing. The editor ghosts that row verbatim for every
control, and for a body that has one. A body that has NONE — the common case,
and the case for every kind the reference quill declares — ghosts an invitation
instead, either the consumer's `bodyPlaceholder` wording or the built-in `Write…`
([VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md) §Fields). Both render at the same
ghost rung, and neither is ever written back, so on screen they are one thing;
they are not one thing here. Only the `default:` came from the boundary, and a
fallback must never be read back as one — nothing derives a schema value from
what a leaf displays.

Two neighbouring surfaces the editor re-exports but never drives: it selects no
`OutputFormat` (Preview paints a page; it emits no artifact) and it routes
diagnostics by `path`, never by a backend's error `code`.

## Stability seams

At the 0.98.0 target the whole table is stable API. One typing gap is open:

- **`ContentLineKind` is not on the public entry point.** The core build factors
  a line's kind half out as its own type — the exact payload of `LineOp`'s
  `setKind` — but `runtime.d.ts` re-exports `ContentLine` without it, and the
  package's `exports` map admits no deeper path. So the codec builds a `setKind`
  op by lifting the kind half off a line and casts the result, where naming the
  type would carry it (`encode.ts`, `kindOp`). One cast, no runtime effect;
  re-exporting the type retires it.

The two gaps this ledger used to report are closed:

- **`ContentIsland.props` is typed** — the union pins `TableProps` for `table`
  and `ImageProps` for `image` (`TableCell` the cell shape); an island of any
  other type round-trips with opaque `props`. The codec reads the boundary type
  and dropped its hand-rolled `IslandTable*` / `IslandImage*` duplicates and shape
  guards ([CODEC.md](CODEC.md) §Islands).
- **`QuillCardUi.groups` is typed** — a `Record<string, QuillGroupUi>` group
  registry (key order = declaration order, `title` an optional label override).
  The editor reads group order and labels off it directly, dropping the cast
  ([VISUAL_EDITOR.md](VISUAL_EDITOR.md) §Structure).

Field addresses are one canonical `DocPath` across the boundary — `Diagnostic.path`,
`ContentHit.field`, and `FieldRegion.field` all speak `main.<field>` / `main.body` /
`cards.<kind>[<i>].<field>`, cards keyed by **absolute document index** (no per-kind
ordinal). The editor routes on `parseDocPath` and builds with `formatDocPath` rather
than a hand-rolled string grammar; diagnostics routing is confirmed against the real
grammar, not best-effort.

The session/paint surface (`Engine.open`, `LiveSession`, `PaintOptions` /
`PaintResult` / `PageSize`, `ChangeSet`, `supportsCanvas`) is stable as of the
pinned 0.98.0 and the editor's Preview is its first production consumer: the editor
pins the version and rides it.

## What the editor owns at this boundary

The substrate is quillmark's; two thin slices at the seam are the editor's, and
they live in their surface docs, not here:

- **Handle lifecycle** — WASM `init` (sync; shipped 0.98.0 has no async
  `initSync` split), who holds the `Quill` and
  `Document` handles across a session, and when they are freed. The vanilla-TS core
  owns this ([ARCHITECTURE.md](ARCHITECTURE.md) §Core vs chrome).
- **Diagnostics routing** — three producers (`quill.validate`,
  `LiveSession.warnings`, render errors via `FieldRegion.field`) merged, keyed to
  field addresses (canonical `DocPath` → the editor's stable-id keying, via
  `parseDocPath`), and de-duplicated with a settled precedence. Policy lives in
  [VISUAL_EDITOR.md](VISUAL_EDITOR.md) §Diagnostics; this ledger only names the
  producers it draws from.

## Not owned here

- content↔PM translation, position map, mark/island lowering — [CODEC.md](CODEC.md).
- paint, page geometry, click→content — [PREVIEW.md](PREVIEW.md).
- the schema × payload composition, card operations, focus — [VISUAL_EDITOR.md](VISUAL_EDITOR.md).
- the `Document` model itself, its serialization, and its mutator semantics —
  quillmark canon (the table's Canon column).
