# Document Model — Boundary Ledger

Scope: **not** a document-model design — the `Document`, its mutators, the WASM
boundary, and diagnostics are quillmark's, each with a canonical home in
quillmark canon. This ledger pins the *exact* quillmark surface `@quillmark/editor`
V1 consumes, cites where each is documented, and marks its stability. It is the
one place the version coupling to `@quillmark/wasm` is recorded; when a surface
below moves, the editor's dependency moves with it. Corpus content types
(`RichText`) and their ProseMirror mapping are the editor's own work —
[CODEC.md](CODEC.md), not here.

Cross-repo references read `quillmark prose/canon/X.md` (a different repo; links do
not resolve).

## The surface V1 consumes

Every verb below is on the WASM `Document` / `Quill` / `LiveSession` today (`impl
Document`, `impl LiveSession` in `crates/bindings/wasm/src/engine.rs`) unless the
Stability column says otherwise.

| Concern | Verbs / types | Canon | Stability |
| --- | --- | --- | --- |
| **Truth & seeding** | `quill.seedDocument` / `seedMain` / `seedCard(kind, overlay)`, `Quill.fromTree` / `toTree`, `quill.schema` / `blueprint` / `metadata` | `SCHEMAS.md`, `CARDS.md`, `DOCUMENT_STORAGE.md`, `QUILL.md` | stable |
| **Typed writer** (scalar/array/object + append) | `quill.writer(doc)` → `DocumentWriter` (`set` / `setAll` / `setBody` / `addCard` / `removeCard` / `card(i)`) | `PROGRAMMATIC.md`, `SCHEMAS.md` | stable |
| **Structure mutators** | `insertCard(i, card)`, `moveCard(from, to)`, `setCardKind(i, kind)`, `removeCard(i)`, `setCardExtNamespace(i, ns, val)` (the `$ext.editor` write unit) | `CARDS.md`, `DOCUMENT_STORAGE.md` | stable |
| **Op-grained corpus edit** | `doc.applyChange(addr, bundle)`, `doc.install(addr, rt)`, `doc.revise(addr, md)` → `Delta`; `Addr`, `ChangeBundle` | `DOCUMENT_STORAGE.md`, `CONVERT.md` | stable |
| **Positions & markdown edges** | `doc.positionAt`, `importMarkdown` / `exportMarkdown` / `rebase` / `mapPos` | `references/markdown-spec.md`, `CONVERT.md` | stable |
| **Validation & diagnostics** | `quill.validate(doc)` → `Diagnostic[]`, `Document.warnings`, `LiveSession.warnings`, `QuillmarkError` shape | `SCHEMAS.md`, `ERROR.md` | stable |
| **Live session & paint** (preview) | `engine.open(quill, doc)` → `LiveSession` (`apply` → `ChangeSet`, `paint`, `pageSize`, `regions` / `fieldBoxes` / `fieldAt` / `positionAt` / `locate`, `supportsCanvas`, `warnings`); `PaintOptions` / `PaintResult` / `PageSize` / `CorpusHit` / `FieldRegion` | quillmark `PREVIEW.md` | **`@experimental`** |

Consumed by: [CODEC.md](CODEC.md) (op-grained edit, positions, markdown edges),
[PREVIEW.md](PREVIEW.md) (live session & paint), [VISUAL_EDITOR.md](VISUAL_EDITOR.md)
(seeding, writer, structure mutators, validation).

## Stability seams

Two, and only two, are not settled ground under the editor:

- **The session/paint surface is `@experimental`** — `Engine.open`, `LiveSession`,
  `PaintOptions` / `PaintResult` / `PageSize`, `ChangeSet`, `supportsCanvas` all
  carry the marker (ships ahead of its first production consumer). That consumer is
  this editor's Preview; V1 is where the surface hardens, so treat a break here as
  co-design with quillmark, not a fixed dependency.
- **`Island.props` is typed `unknown`** at the WASM boundary — the codec's
  table/image schemas track a shape the surface does not pin ([CODEC.md](CODEC.md)
  §Islands). A candidate for a typed island surface upstream.

Everything else in the table is stable quillmark API; the editor pins a
`@quillmark/wasm` version and rides it.

## What the editor owns at this boundary

The substrate is quillmark's; two thin slices at the seam are the editor's, and
they live in their surface docs, not here:

- **Handle lifecycle** — WASM `init` / `initSync`, who holds the `Quill` and
  `Document` handles across a session, and when they are freed. The vanilla-TS core
  owns this ([ARCHITECTURE.md](ARCHITECTURE.md) §Core vs chrome).
- **Diagnostics routing** — three producers (`quill.validate`,
  `LiveSession.warnings`, render errors via `FieldRegion.field`) merged, keyed to
  field addresses, and de-duplicated with a settled precedence. Policy lives in
  [VISUAL_EDITOR.md](VISUAL_EDITOR.md) §Diagnostics; this ledger only names the
  producers it draws from.

## Not owned here

- corpus↔PM translation, position map, mark/island lowering — [CODEC.md](CODEC.md).
- paint, page geometry, click→corpus — [PREVIEW.md](PREVIEW.md).
- the schema × payload composition, card operations, focus — [VISUAL_EDITOR.md](VISUAL_EDITOR.md).
- the `Document` model itself, its serialization, and its mutator semantics —
  quillmark canon (the table's Canon column).
