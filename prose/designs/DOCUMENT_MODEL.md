# Document Model — Boundary Ledger

Scope: **not** a document-model design — the `Document`, its mutators, the WASM
boundary, and diagnostics are quillmark's, each with a canonical home in
quillmark canon. This ledger pins the *exact* quillmark surface `@quillmark/editor`
V1 consumes, cites where each is documented, and marks its stability. It is the
one place the version coupling to `@quillmark/wasm` is recorded; when a surface
below moves, the editor's dependency moves with it.

**V1 builds on `@quillmark/wasm` 0.95.1.** Every verb in the table below is stable
as of that release. The 0.95 mutation-surface cleanup is the settled ground the
editor targets: `store*` verbs for verbatim writes, one unified `Addr` (`{card?,
field?}`) collapsing the old `*CardField` pairs, the schema-bound `writer`/`view`
doors (`quill.writer(doc)` / `quill.view(doc)`), a card-first `insertCard(card,
at?)`, and the `datetime` split into `date` and `datetime`.

Content types
(`Content` and its parts) and their ProseMirror mapping are the editor's own work —
[CODEC.md](CODEC.md), not here.

Cross-repo references read `quillmark prose/canon/X.md` (a different repo; links do
not resolve).

## The surface V1 consumes

Every verb below is on the WASM `Document` / `Quill` / `LiveSession` today (`impl
Document`, `impl LiveSession` in `crates/bindings/wasm/src/engine.rs`) unless the
Stability column says otherwise.

| Concern | Verbs / types | Canon | Stability |
| --- | --- | --- | --- |
| **Truth & seeding** | `quill.seedDocument` / `seedMain` / `seedCard(kind, overlay)`, `Quill.fromTree` / `toTree`, `quill.schema` / `blueprint` / `metadata`; `doc.seedOverlay(kind)` / `card(i)` / `cardIndexById(id)` | `SCHEMAS.md`, `CARDS.md`, `DOCUMENT_STORAGE.md`, `QUILL.md` | stable |
| **Typed writer / read view** (scalar/array/object + append) | `quill.writer(doc)` → `DocumentWriter` (`set` / `setAll` / `setBody` / `reviseField` / `addCard` / `removeCard` / `card(i)`); `quill.view(doc)` → `DocumentView` (`get` / `getBody` / `card(i)`) for schema-typed reads | `PROGRAMMATIC.md`, `SCHEMAS.md` | stable |
| **Structure mutators** | `insertCard(card, at?)`, `moveCard(from, to)`, `setCardKind(i, kind)`, `removeCard(i)`, `storeExtNamespace({card}, ns, val)` (the `$ext.editor` write unit) | `CARDS.md`, `DOCUMENT_STORAGE.md` | stable |
| **Op-grained content edit** | `doc.applyChange(addr, bundle)`, `doc.install(addr, rt)`, `doc.revise(addr, md)` → `Delta`; unified `Addr` (`{card?, field?}`, bare string = `{field}`), `CardAddr`, `ChangeBundle`; `doc.storeField` / `storeFields` / `storeFill` / `get` / `removeField` (quill-free store lane) | `DOCUMENT_STORAGE.md`, `CONVERT.md` | stable |
| **Positions & markdown edges** | `importMarkdown` / `exportMarkdown` / `rebase` (→ `{content, delta}`) / `mapPos` (module-level); position→geometry queries (`positionAt` / `locate`) live on `LiveSession` (row below) | `references/markdown-spec.md`, `CONVERT.md` | stable |
| **Validation & diagnostics** | `quill.validate(doc)` → `Diagnostic[]`, `Document.warnings`, `LiveSession.warnings`, `QuillmarkError` shape | `SCHEMAS.md`, `ERROR.md` | stable |
| **Live session & paint** (preview) | `engine.open(quill, doc)` → `LiveSession` (`apply` → `ChangeSet`, `paint`, `pageSize`, `regions` / `fieldBoxes` / `fieldAt` / `positionAt` / `locate`, `supportsCanvas`, `warnings`); `PaintOptions` / `PaintResult` / `PageSize` / `ContentHit` / `FieldRegion` | quillmark `PREVIEW.md` | stable |

Consumed by: [CODEC.md](CODEC.md) (op-grained edit, positions, markdown edges),
[PREVIEW.md](PREVIEW.md) (live session & paint), [VISUAL_EDITOR.md](VISUAL_EDITOR.md)
(seeding, writer, structure mutators, validation).

## Stability seams

At the 0.95.1 target the whole table is stable API, so what remains is typing
gaps, not `@experimental` markers:

- **`ContentIsland.props` is typed `unknown`** at the WASM boundary — the codec's
  table/image schemas track a shape the surface does not pin ([CODEC.md](CODEC.md)
  §Islands). A candidate for a typed island surface upstream; not resolved by the
  0.95 mutation-surface cleanup.
- **`QuillCardUi` is narrower than the schema JSON** — the typed surface exposes
  only `title`, while real quills carry `ui.groups` (the fixture's
  `main.ui.groups`). The editor reads group order from the schema JSON when
  present ([VISUAL_EDITOR.md](VISUAL_EDITOR.md) §Structure; Phase 4's settled
  decision). A candidate for widening the typed surface upstream.

The session/paint surface (`Engine.open`, `LiveSession`, `PaintOptions` /
`PaintResult` / `PageSize`, `ChangeSet`, `supportsCanvas`) is stable as of the
pinned 0.95.1 and the editor's Preview is its first production consumer: the editor
pins the version and rides it.

## What the editor owns at this boundary

The substrate is quillmark's; two thin slices at the seam are the editor's, and
they live in their surface docs, not here:

- **Handle lifecycle** — WASM `init` (sync; shipped 0.95.1 has no async
  `initSync` split), who holds the `Quill` and
  `Document` handles across a session, and when they are freed. The vanilla-TS core
  owns this ([ARCHITECTURE.md](ARCHITECTURE.md) §Core vs chrome).
- **Diagnostics routing** — three producers (`quill.validate`,
  `LiveSession.warnings`, render errors via `FieldRegion.field`) merged, keyed to
  field addresses, and de-duplicated with a settled precedence. Policy lives in
  [VISUAL_EDITOR.md](VISUAL_EDITOR.md) §Diagnostics; this ledger only names the
  producers it draws from.

## Not owned here

- content↔PM translation, position map, mark/island lowering — [CODEC.md](CODEC.md).
- paint, page geometry, click→content — [PREVIEW.md](PREVIEW.md).
- the schema × payload composition, card operations, focus — [VISUAL_EDITOR.md](VISUAL_EDITOR.md).
- the `Document` model itself, its serialization, and its mutator semantics —
  quillmark canon (the table's Canon column).
