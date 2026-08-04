# Document Model: Boundary Ledger

> **Implementation**: `@quillmark/wasm` (the consumed surface, imported from the peer directly) · `src/lib/core/` (what the package adds at the seam)

## TL;DR

**Not** a document-model design: the `Document`, its mutators, the WASM boundary, and diagnostics are quillmark's, each with a canonical home in quillmark canon. This ledger pins the *exact* quillmark surface `@quillmark/svelte` V1 consumes, cites where each is documented, and marks its stability. It is the one place the version coupling to `@quillmark/wasm` is recorded; when a surface below moves, the editor's dependency moves with it. Nothing re-exports this surface: package code and consumers alike import it from the peer dependency, the single source of truth, and `/core` carries only what the package itself declares over it (the address vocabulary, the error channel, `init`).

**V1 builds on `@quillmark/wasm` 0.102.0**, three releases past the 1.0 API freeze. Every verb in the table below is stable at that pin. The settled ground it stands on: `store*` verbs for verbatim writes, one unified `Addr` (`{card?, field?}`), the schema-bound `writer`/`reader` doors (`quill.writer(doc)` / `quill.reader(doc)`), a card-first `insertCard(card, at?)`, the quill-free transport read `getStored` (distinct from `reader.get` and `reader.getContent`), the `quill.resolve(doc)` value view, `code`-bearing mutator diagnostics, the canonized anchor-id policy (caller-supplied, unique, invariant) that lets the editor mint anchors at a selection ([CODEC.md](CODEC.md) §Marks), and the `islandOps` channel that puts an island's payload within reach of `applyChange`.

**A content field has one rest form per codec, and one read that spans them.** `richtext` rests as the content object, `plaintext` as its literal string, and a document that came through the transport door rests as authored until `quill.parse` / `quill.conform` lands it. `reader.getContent(addr)` decodes through the codec the declared type names, so the storage form stops being a consumer's business: it is the prose leaf's only read ([VISUAL_EDITOR.md](VISUAL_EDITOR.md), `readLeaf`), and the leaf holds no codec of its own to stand in for it. The editor drives neither ingestion verb (`quill.parse` / `quill.conform`): it is handed a `Document` and edits it, so which door built one is the host's business and a transport-door document opens here unconformed. The model carries no card `$id` and no `cardIndexById`: the editor's durable card handle is its own session key.

**The block vocabulary is open.** `ContentLine.kind` and `ContentContainer.container` stand with the mark and island `type` as OPEN sets: a construct this build does not know round-trips opaque rather than failing the load. A bare discriminant check does not narrow past the residual arm, so the checked path is the boundary's guards (`isHeadingLine` / `isCodeLine` / `isListItemContainer` beside `isAnchorMark` / `isLinkMark` / `isTableIsland` / `isImageIsland`), which the codec reads here instead of re-deriving, and each set has a PM carrier so an unknown survives an edit ([CODEC.md](CODEC.md) §Open sets).

Content types (`Content` and its parts) and their ProseMirror mapping are the editor's own work: [CODEC.md](CODEC.md), not here.

Cross-repo references read `quillmark prose/canon/X.md` (a different repo; links do not resolve).

## The surface V1 consumes

Every verb below is on the WASM `Document` / `Quill` / `LiveSession` today (`impl Document`, `impl LiveSession` in `crates/bindings/wasm/src/engine.rs`) unless the Stability column says otherwise.

| Concern | Verbs / types | Canon | Stability |
| --- | --- | --- | --- |
| **Lifecycle** | `init(source?)` → `Promise<void>`, awaited once before any verb below; every export throws `runtime::not_initialized` until it resolves. The artifact ships wasm-bindgen's web target, so a static import carries no `.wasm` edge and no top-level await: it is safe on any route's graph, SSR included, and the package needs no bundler plugin. Vite's dev server pre-bundling relocates the package away from the binary, so consumers exclude it from `optimizeDeps` | quillmark `BINDINGS.md` | stable |
| **Truth & seeding** | `quill.seedDocument` / `seedMain` / `seedCard(kind, overlay)`, `Quill.fromTree` / `toTree`, `quill.schema` / `blueprint` / `metadata`; `doc.seedOverlay(kind)` / `card(i)` | `SCHEMAS.md`, `CARDS.md`, `DOCUMENT_STORAGE.md`, `QUILL.md` | stable |
| **Typed writer / read view** (scalar/array/object + append) | `quill.writer(doc)` → `DocumentWriter` (`set` / `setAll` / `reviseBody` / `reviseField` / `addCard` / `removeCard` / `card(i)`); `quill.reader(doc)` → `DocumentReader` (`get` / `getContent` / `bodyMarkdown` / `card(i)`) for schema-typed reads; `quill.resolve(doc)` → `Resolved` (value + `FieldSource` rung per field) | `PROGRAMMATIC.md`, `SCHEMAS.md` | stable |
| **Structure mutators** | `insertCard(card, at?)`, `moveCard(from, to)`, `setCardKind(i, kind)`, `removeCard(i)`, `storeExtNamespace({card}, ns, val)` (the `$ext.editor` write unit) | `CARDS.md`, `DOCUMENT_STORAGE.md` | stable |
| **Op-grained content edit** | `doc.applyChange(addr, bundle)`, `doc.overwrite(addr, rt)`, `doc.revise(addr, md)` → `Delta`; unified `Addr` (`{card?, field?}`, bare string = `{field}`), `CardAddr`, `ChangeBundle` (`delta` / `IslandOp` / `LineOp` / `MarkOp`); `doc.storeField` / `storeFields` / `storeFill` / `getStored` / `removeField` (quill-free store lane) | `DOCUMENT_STORAGE.md`, `CONVERT.md` | stable |
| **Positions & markdown edges** | `importMarkdown` / `exportMarkdown` / `rebase` (→ `{content, delta}`) / `mapPos` (module-level); `parseDocPath` / `formatDocPath` (+ `DocPathSeg`) for canonical field-address routing; position→geometry queries (`positionAt` / `locate`) live on `LiveSession` (row below) | `references/markdown-spec.md`, `CONVERT.md` | stable |
| **Validation & diagnostics** | `quill.validate(doc)` → `Diagnostic[]` (`.path` a canonical `DocPath`), `Document.warnings`, `LiveSession.warnings`, `QuillmarkError` shape (mutator failures carry a `code` + `path`) | `SCHEMAS.md`, `ERROR.md` | stable |
| **Live session & paint** (preview) | `engine.open(quill, doc)` → `LiveSession` (`update` → `ChangeSet`, `paint`, `pageSize`, `regions` / `fieldBoxes` / `fieldAt` / `positionAt` / `locate`, `supportsCanvas`, `warnings`); `PaintOptions` / `PaintResult` / `PageSize` / `ContentHit` / `FieldRegion` | quillmark `PREVIEW.md` | stable |

Consumed by: [CODEC.md](CODEC.md) (op-grained edit, positions, markdown edges), [PREVIEW.md](PREVIEW.md) (live session & paint), [VISUAL_EDITOR.md](VISUAL_EDITOR.md) (seeding, writer, structure mutators, validation).

**A ghost is not always a `default:`.** `resolve`'s `FieldSource` rung is the boundary's, and a `default`-sourced row is a promise about the render: this is what prints if you write nothing. The editor ghosts that row verbatim for every control, and for a body that has one. A body that has NONE (the common case, and the case for every kind the reference quill declares) ghosts an invitation instead, either the consumer's `bodyPlaceholder` wording or the built-in `Write…` ([VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md) §Fields). Both render at the same ghost rung, and neither is ever written back, so on screen they are one thing; they are not one thing here. Only the `default:` came from the boundary, and a fallback must never be read back as one: nothing derives a schema value from what a leaf displays.

Two neighbouring surfaces the editor consumes but never drives: it selects no `OutputFormat` (Preview paints a page; it emits no artifact) and it routes diagnostics by `path`, never by a backend's error `code`.

## Stability seams

At the 0.102.0 target the whole table is stable API and one typing gap is open. `ContentLineKind` is on the public entry point, so the codec builds its `setKind` op typed (`encode.ts`, `kindOp`); `ContentLossClass` is not, though `ContentIsland.loss` is typed by it. The codec needs the name because an island's loss class rides a PM node attribute, and it reads it off the entry (`ContentIsland['loss']`, `islands.ts`) rather than restating the union, which would be a local copy of an OPEN set, the one duplicate that goes stale silently.

Two obligations the freeze carries, neither yet load-bearing here:

- **`#[non_exhaustive]` on the public types** is a Rust-side promise about the crate API, and 0.100.0 extended it to the content model (`Content` / `Line` / `Mark` / `Island`). It reaches this boundary only as the open sets already documented above: nothing the editor consumes through `runtime.d.ts` is an exhaustive `match`, and a `Content` crosses as a plain object literal the boundary validates on write.
- **A payload beside a built-in discriminator is refused on write.** `attrs` beside a known `kind` / `container` / mark or island `type` is refused on the authored lane; reads stay tolerant, so a blob carrying one still opens. The codec mints such a payload only for a name outside its own known set (`decode.ts` `makeLeaf`, `marks.ts` `pmMarkFromContent`), and at this pin those sets are exactly the boundary's, so no write it emits can be refused. They agree by inspection, not by construction: the day upstream promotes a name to a built-in, the guards `isUnknownLine` / `isUnknownContainer` / `isUnknownMark` / `isUnknownIsland` are what makes the residual arm the boundary's answer instead of this build's leftover.

Two shapes the editor reads straight off the boundary, with no local duplicate:

- **`ContentIsland.props`**: the union pins `TableProps` for `table` and `ImageProps` for `image` (`TableCell` the cell shape); an island of any other type round-trips with opaque `props`. The codec needs no hand-rolled `IslandTable*` / `IslandImage*` shapes or guards ([CODEC.md](CODEC.md) §Islands). The sibling `loss` is **authored**: `applyChange` stores the class an island op hands it and re-derives nothing from the new `props`, so the whole entry rides the PM node and an island edit writes back the class it read ([CODEC.md](CODEC.md) §Islands).
- **`QuillCardUi.groups`**: a `Record<string, QuillGroupUi>` group registry (key order = declaration order, `title` an optional label override). The editor reads group order and labels off it directly, uncast ([VISUAL_EDITOR.md](VISUAL_EDITOR.md) §Structure).

Field addresses are one canonical `DocPath` across the boundary: `Diagnostic.path`, `ContentHit.field`, and `FieldRegion.field` all speak `main.<field>` / `main.body` / `cards.<kind>[<i>].<field>`, cards keyed by **absolute document index** (no per-kind ordinal). The editor routes on `parseDocPath` and builds with `formatDocPath` rather than a hand-rolled string grammar; diagnostics routing is confirmed against the real grammar, not best-effort.

The session/paint surface (`Engine.open`, `LiveSession`, `PaintOptions` / `PaintResult` / `PageSize`, `ChangeSet`, `supportsCanvas`) is stable at the pinned 0.102.0 and the editor's Preview is its first production consumer: the editor pins the version and rides it.

## What the editor owns at this boundary

The substrate is quillmark's; two thin slices at the seam are the editor's, and they live in their surface docs, not here:

- **Handle lifecycle**: WASM `init` (sync; the shipped artifact has no async `initSync` split), who holds the `Quill` and `Document` handles across a session, and when they are freed, under the one-copy-per-process rule the runtime enforces ([DEPENDENCIES.md](../../../../prose/canon/DEPENDENCIES.md) §The wasm singleton). The vanilla-TS core owns this ([ARCHITECTURE.md](ARCHITECTURE.md) §Core vs chrome).
- **Diagnostics routing**: three producers (`quill.validate`, `LiveSession.warnings`, render errors via `FieldRegion.field`) merged, keyed to field addresses (canonical `DocPath` → the editor's stable-id keying, via `parseDocPath`), and de-duplicated with a settled precedence. Policy lives in [VISUAL_EDITOR.md](VISUAL_EDITOR.md) §Diagnostics; this ledger only names the producers it draws from.

## Not owned here

- content↔PM translation, position map, mark/island lowering: [CODEC.md](CODEC.md).
- paint, page geometry, click→content: [PREVIEW.md](PREVIEW.md).
- the schema × payload composition, card operations, focus: [VISUAL_EDITOR.md](VISUAL_EDITOR.md).
- the `Document` model itself, its serialization, and its mutator semantics: quillmark canon (the table's Canon column).
