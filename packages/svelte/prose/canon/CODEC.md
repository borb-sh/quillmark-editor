# Codec

> **Implementation**: `src/lib/core/codec/`

## TL;DR

The bidirectional codec between one content field (`Content`) and one ProseMirror document: decode (content → PM), the transaction lowering (PM → a `ChangeBundle` for `applyChange`), and the USV ↔ PM position map that carries the caret. One field, one PM doc; the VisualEditor composes many. Markdown is not in this loop: it is an edge codec (§Markdown at the edges), never the edit representation.

Grounds on quillmark's `Content` model and its WASM edit surface (canon: quillmark `prose/canon/DOCUMENT_STORAGE.md`, `CONVERT.md`; the WASM `Card.body` / `install` / `applyChange` / `positionAt` API). The preview↔editor half of the caret bridge lives in [PREVIEW.md](PREVIEW.md).

## The two models

The `Content` model is one flat `text` over Unicode scalar values (`\n` a line boundary, `U+FFFC` an island slot), a `lines` list (each a `kind` + a `containers` path + a `continues` flag) from which the block tree is *derived*, a set of freely-overlapping `marks`, and `islands`. It carries no node identity beyond island ids and `anchor` mark ids; a paragraph split or join is a one-character text edit.

ProseMirror is a nested node tree whose inline text carries a *set* of marks and whose positions count node boundaries; its identity is the tree itself.

Bridging the two is the codec's whole job: **flat-text-with-attributes ↔ nested-tree**. It is a translation layer, not a thin adapter: the content normalizes on every write, PM has no overlapping-mark or zero-width-mark concept, and neither side's positions are the other's.

## Direction: the content is truth; PM is its projection; edits are ops

Decode is a pure function content → PM. Encode does **not** rebuild a `Content` and `install` it: it projects the new PM doc back to content (`pmToContent`, decode's inverse) and diffs `old → new` into a `ChangeBundle { delta?, islandOps?, lineOps?, markOps? }`, applied by `doc.applyChange(addr, bundle)`. Op-based, because:

- **anchors survive.** `install` is value semantics: it drops the identity anchors (comment threads, stable references) of the previous value. `applyChange` splices, so anchors rebase through the edit.
- **it is the seam's grain.** The `delta` channel is CodeMirror-`ChangeSet` isomorphic; marks and line attributes are separate op channels by design. Lowering is a **whole-field diff, not a step replay**: rather than translate each `tr.step` out of PM's node coordinates and open-slice depths, it re-derives the content projection once and diffs `old → new` in one final USV coordinate space. The diff replicates `applyChange`'s own mark rebase (start-assoc `after`, end-assoc `before` ≡ `mapPos`), so it stays coverage-precise.

Every edit lowers. `install(addr, rt)` is left with two cases, neither a shape the vocabulary can't reach: a field not yet at *content rest* (an unset field, an authored string), which has no content object to splice and no anchors to lose, and an `applyChange` that throws. It costs that field's anchors, so it is the exception, not the path.

## Decode: content → PM

Fold the flat lines into the tree: group consecutive lines by common `containers` prefix (a shared `[ListItem]` path is one item's paragraphs; `[ListItem, Quote]` a quote nested in it), and join `continues` runs into one block (a code fence's lines → one `code_block`; a paragraph's hard breaks → one paragraph with `hard_break` nodes). The line `kind` selects the block node: `para` → paragraph, `heading{level}`, `code{lang}`, `rule` → horizontal_rule, `island` → a block island node, and anything else → a paragraph carrying the unknown kind (§Open sets).

Marks apply over their `[start, end)` range; PM splits inline nodes at mark boundaries, so free overlap of *different* formatting kinds is representable without loss (`strong[0,4)` + `emph[2,6)` → text nodes `{strong}`, `{strong,emph}`, `{emph}`). An island slot inside a `Para` line decodes to an inline node (an image); an `Island`-kind line decodes to a block node (a table), either carrying the island `id` and typed props.

Two mark kinds do **not** become PM marks: see §Marks.

## Encode: PM edit → `ChangeBundle`

`contentEdit(oldRt, newRt)` pairs the stored content with the new PM doc's projection (`pmToContent`) and diffs their text once; `lower(edit)` fills out the four channels around that splice, in `applyChange`'s application order (`delta`, then `islandOps`, then `lineOps`, then `markOps`, all in *final* coordinates: every earlier channel applied):

- **text**: a minimal single-splice diff of the flat USV text becomes `delta` ops (`retain` / `insert` / `delete`). A line split or join rides the delta: an inserted `\n` splits a line, a deleted `\n` joins; there is no separate split/join op.
- **islands**: an island's payload lives in its entry, never in the text, so `islandOps` is the only channel that reaches it. A changed `props` is `{ op: "set" }`, addressed by the id both sides carry; a slot the splice would have to type is `{ op: "insert", at }`, which places slot and entry in one op. A deleted island needs no op at all: the `delta` that removes its slot drops the entry.
- **line metadata**: when any line's `kind` / `containers` / `continues` changed, `lineOps` restate every line's metadata (`setKind`, `setContainers`, and `setContinues` for lines ≥ 1). Redundant restatements are safe no-ops, so the pass is correct whatever intermediate metadata the delta's split/join left.
- **formatting**: the mark-coverage difference becomes `markOps` `add` / `remove` over final USV ranges; old marks are first rebased through both text-moving channels, the delta and the island inserts, exactly as `applyChange` rebases them (start-assoc `after`, end-assoc `before` ≡ `mapPos`).
- **anchors**: the decoration-set difference by id becomes `add {type:"anchor", id}` / `removeAnchor {id}`, positions already in final coords.

Everything reads against the *final* content, so the bundle reads the same way `applyChange` applies it. **A slot never rides the `delta`**: `applyChange` throws `IslandSlotInInsert` on an insert that carries one, so `lower` strips every slot inside the splice's inserted region and hands it to the island channel instead (`splitIslands`). That is what keeps island creation, and a splice that happens to span an existing slot, on the op path.

A **block** island is one bundle of three channels: the `delta` inserts the `\n` that opens the line, an island op places the slot, a `setKind` tags the line `island`. Stage order is what makes it expressible: `{ op: "split" }` could not open that line, since line ops run after island ops.

## Positions: USV ↔ PM

`usvToPM(pos)` / `pmToUsv(pmPos)`: a content USV offset is a character index into `text` (with `\n` and `U+FFFC` each one USV); a PM position counts node tokens. The map is a list of RUNS that tile the text: a `text` run where the two advance together, an `nl` run spanning a block boundary or hard break, an `atom` run for an island slot, each carrying its PM start and its USV start. The runs come off the same single walk that produces the content projection, so the map and the projection can never disagree; the whole list is rebuilt on structural change. Document order makes both coordinates increasing across the list, so a conversion bisects rather than scans: what keeps the bulk callers (every held anchor, on every commit) off O(anchors × runs). This is the function a `positionAt` result (`ContentHit.pos`) and a `FieldRegion.span` pass through to reach a PM caret, and the one `locate` runs in reverse for the preview overlay.

**UTF-16 hazard.** JS strings (and the text offsets inside PM positions) are UTF-16; content offsets are USV (code points). An astral character is two UTF-16 units but one USV, so the map converts; skip it and a caret drifts one unit per emoji it passes. quillmark's `usv` helper does not cross to WASM: the codec owns the conversion.

## Marks: formatting vs identity

The content mark set is two algebra classes, and they route to two different PM mechanisms:

- **formatting** (`strong` / `emph` / `underline` / `strike` / `code` / `link`) is a property of a range. ↔ PM marks. A round-trip through PM yields the union ranges, which is what content normalization produces anyway, so formatting is stable.
- **identity** (`anchor{id}`: comment threads, stable references; zero-width capable, no glyph) is a handle, not a property. It has no home as a PM mark (a PM mark needs a text node and carries no zero-width span). ↔ **PM decorations** (or plugin-held positions) keyed by id, carried across edits by `tr.mapping` and lowered to `anchor` mark ops. This split is what dissolves the "Peritext overlap vs nested marks" tension: overlap only bites where identity and formatting coexist, and they never share a mechanism.
- **unknown** (`{type, attrs}`) is neither: it is one of the four open sets, and routes to its inert carrier (§Open sets).

## Islands

A table or figure is one `U+FFFC` slot plus one `Island {id, type, props, loss}`. Decode maps it to a PM leaf node (block or inline by the slot's line); encode writes the slot char and the entry with its `id` preserved (stable identity, like an anchor). The **whole entry rides the node**, `loss` included: `applyChange` stores the class an island op hands it and re-derives nothing, so an edit that did not carry the class back would promote a degraded table to lossless on its first cell edit.

Known types carry a typed props shape pinned upstream (`@quillmark/wasm` 0.96.0): `ContentIsland.props` is `TableProps` (`{header, rows, aligns}`) for `table`, `ImageProps` (`{url, alt}`) for `image`; an island of any other type passes opaque (§Open sets).

An island edit lowers through `islandOps` (§Encode), and the entry's **value semantics** draw one boundary. A minted island id is this tier's to produce: the positional `isl-{n}` sequence continued past the highest the field holds, never a UUID or a clock reading, because the id is part of the document's canonical bytes (quillmark `DOCUMENT_STORAGE.md` §Island-id determinism). It is minted against the PM projection in hand, since an id minted against a stale content could collide with one the same transaction places.

## The table island

A `table` island's props ARE a pipe table: one column count shared by `header`, every row and `aligns`, and cells holding text and marks and no block content. The editing surface is a NodeView over that shape (`codec/table-view.ts`, `codec/table.ts`), and most of its decisions are the model's rather than a preference.

**A cell is a second corpus, and it takes the inline mode.** `TableCell.marks` are USV offsets into that cell's own `text`, so a rich cell puts a corpus inside the one this doc opens on. What resolves it is the mode the codec already runs: `richtext(inline)` is one paragraph, container-free, island-free, which is a `TableCell` exactly. A cell mounts a nested `EditorView` on `inlineSchema`, and the marks, the input rules and the selection popover come with it. A nested view carries none of the FIELD's plugins: no history (`Mod-z` routes to the leaf's, so one undo stack covers a cell keystroke and a row op alike), no anchor plugin, no ghost. Plaintext cells were the alternative and are not available: an imported table's marks have to round-trip, so a plaintext cell would still have to render and preserve marks with no mark mechanism — the hard half of the problem with none of the payoff.

**An anchor in a cell is preserved, never minted.** It is not in the field plugin's coordinate space at all — the position map holds one `atom` run for the whole island — so nothing here can place one, and the popover withholds its `anchor` button while the caret is in a cell (`focusedView` is what tells it, VISUAL_EDITOR §Chrome). Preserving is not doing nothing: a cell edit is a splice like any other, so a held anchor rebases through the cell's own text delta by the rule `applyChange` uses on a field's.

**Enter is the next row, forced.** A `TableCell` has one `text` and no line concept, and `continues` is a LINE flag with no cell analogue: a newline in a cell has no representation, so this is not a preference to settle. Tab traverses in reading order and APPENDS a row past the last cell, which is the whole growth affordance a small default shape leans on. Escape leaves the cell for a node selection over the island: the innermost link of that key's chain, where Backspace then deletes the table.

**A header toggle is unexpressible**, and that is a chrome consequence, not a guard: `header` is a separate field from `rows`, and `header: []` is not a table. The row handles offer add and reorder on the header and never delete, and the delete is ABSENT there rather than disabled, so the asymmetry reads. A reorder moves a row's CELLS and not its role, so moving the header down trades its cells with the first body row's and the table still has a header.

**The rectangle is an invariant with no error channel, so it is a constructor.** Props normalize on write, and the editor holds optimistic PM and re-hydrates only on an EXTERNAL change (§Reconciliation), so an op that emitted a ragged table — a row op touching `rows` but not `header`/`aligns`, a paste — would leave the store rectangularized and PM ragged, permanently and silently. Text gets away with normalization drift because it is mark union; a table's is structural. Every row and column op therefore goes through one rectangularizing constructor, and the suite asserts install-then-read equals the projection for each of them.

**A cell edit is one `islandOps` `set`.** The NodeView writes a whole new `props` onto the node with `setNodeMarkup` and the leaf's own commit path lowers it (§Encode), so a keystroke in a cell costs one island op rather than the whole-field value write `install` would, and every identity anchor in the FIELD survives it. Alignment is reachable by the same route, for the first time: it round-trips today and nothing in the editor could reach it. A reseed is decided per cell by comparing the stored value against what the nested view already projects, so the cell that produced an edit keeps its caret while an undo or a re-hydrate takes the fresh state; a changed RECTANGLE rebuilds the views instead, and the op that changed it says where the caret lands.

Every other island type keeps the literal placeholder the node's `toDOM` draws: the NodeView narrows through the boundary's own `isTableIsland` guard, and an unknown island renders as its tag rather than as a table it is not.

What the shape does NOT buy yet is the escape hatch it makes cheap. `TableProps` *is* a pipe table, so a local serializer/parser would be small and lossless by construction, and it would carry a per-island source view, a paste path (pipe table → props) and a test oracle in one. It does not ship: `/source` cannot stand in (whole-document, read-only, `Document.toMarkdown()`), and the suite oracles the rectangle directly instead.

## Open sets: an unknown must survive an edit

Four of the content's discriminants are **open**: a mark `type`, an island `type`, a line `kind`, and a container name. An unrecognized value is a construct some newer quillmark writes, not a corruption: it loads opaque, carrying its own tag and an `attrs` payload.

Reading one is the easy half. A bare `line.kind === 'heading'` does not narrow (the residual `{ kind: string; attrs }` arm keeps a `string` live), so the checked path is the boundary's guards (`isHeadingLine` / `isCodeLine` / `isListItemContainer` / `isLinkMark` / `isAnchorMark` / `isTableIsland` / `isImageIsland`) read off `@quillmark/wasm`, never re-derived here.

Writing is the half that bites. Lowering restates **every** line's metadata as soon as any of it changed (§Encode), so an unknown the PM tree cannot hold is destroyed by the first keystroke anywhere in the field: a document that opens intact and saves mangled. So each open set has an inert carrier that renders as its nearest safe neighbor and re-emits verbatim:

| Open set | Renders as | Carrier |
| --- | --- | --- |
| mark `type` | nothing | the `unknown` mark (`{type, attrs}`), non-exclusive so distinct families share a range |
| line `kind` | a paragraph | the paragraph's `unknown` attribute (`{kind, attrs}`) |
| container | its children, at the enclosing level | the `unknown_container` node |
| island `type` | the island leaf | `islandType` + opaque `props` on the node |

A carrier is dropped only by an **explicit** conversion (retyping the paragraph to a heading, lifting out of the container), which is the one place losing it is what the user asked for.

## Inline mode

`richtext(inline)` and `plaintext` fields are single-paragraph, container-free, island-free. The codec runs a constrained PM schema (one textblock, no block splitting, Enter suppressed); `plaintext` additionally strips all marks. Same decode / lower / position machinery, narrower schema.

**A plaintext field's codec is the boundary's, reached through `reader.getContent`.** Its rest form is the literal string, and its corpus is that string verbatim: the leaf never parses it, and `importMarkdown` on it would consume the delimiters the author is entitled to. The write side stays the content-object round-trip via `install` / `applyChange`, which the mark-free inline schema keeps conforming. The reference quill declares no `plaintext` field and cannot: `plaintext` resolves to CONTENT for a backend exactly as `richtext` does, and its plate hands the string-typed slots to a vendored Typst package that coerces with `str()`. So the mode's suite builds a two-field schema of its own, the only one in the package that does.

The schema distinction is also what sizes the leaf. A constrained leaf holds one paragraph, so it is one line tall and draws the scalar control recipe (SURFACES §"The shared recipe"); the full schema grows. **The codec owns the stylesheet both depend on**: `codec/prose.css`, imported beside ProseMirror's own, which carries no block reset and so leaves every block on UA defaults. It lives here rather than per component because every prose leaf in the package (field, body, array element) mounts through the codec and inherits it without restating it. The source view is not one of them: it is a `<pre>` holding serialized text, outside `.ProseMirror` and outside every rule in that file. A leaf that matches an input does so by drawing the same declarations, not by a floor tuned to agree.

**The stylesheet's two halves answer to different things.** The reset covers the block set `schema.ts` can produce, not `p` alone, and is subtractive: it takes the UA boxes that make a leaf disagree with the control beside it. The positive half covers the rest of what the schema emits (`code`, `link`, `code_block`, `horizontal_rule`, the lists, the headings) and it reads the RENDERED document, not a browser default: the reference quill sets `raw` in a monospace face and nothing more, collapses every heading level into a bold run-in on the following paragraph, and decorates a link not at all. So the leaf states that a span is code and a line is a heading; it does not predict the size paper will set them at, which the package cannot know for a quill it has not seen. Marks the UA already renders correctly (`strong`, `em`, `underline`, `strike`) take no rule.

## Markdown at the edges

Markdown never represents an edit, but it stays a boundary format:

- **paste** markdown → `rebase(fieldCorpus, md)` (cold import + diff, surviving anchors rebased) → splice the returned `delta`.
- **copy** → `exportMarkdown(rt)`, **lossy**: anchors, `underline`, and unknown marks have no markdown projection. Warn before a copy that would drop identity.
- **debug source view**: `Document.toMarkdown()`, read-only.

## Reconciliation

The content normalizes on write (marks sorted and same-kind-unioned, zero-width formatting dropped, invariants enforced), so `decode ∘ lower` is idempotent only *up to normalization*: a projected PM doc and the re-decoded stored content agree after normalize, not byte-for-byte. The editor holds its optimistic PM state and re-hydrates a field only on an **external** content change (another edit source, a paste, a `revise`), gated by canonical-content equality scoped to the field that changed. Caret continuity across a leaf's *own* edits is not this gate at all: it is PM's `StepMap`, inside the leaf the codec mounts, which is why an own-edit never re-hydrates and never moves a caret.

## Seams

- **anchors are decorations, not a document mark.** Plugin-held positions keyed by id, mapped through `tr.mapping` and lowered to `anchor` ops: the split that keeps identity off PM's mark mechanism. A selection mints one through the field seam `insertAnchor(id, pos)` / `removeAnchor(id)`: a zero-width edit carried on an `anchorKey` meta that folds into the plugin set and commits through the same mark diff a formatting toggle does. The id is caller-supplied (unique, invariant) per the `@quillmark/wasm` 0.97 anchor-id policy (a duplicate is a no-op). A move into the document proper, and the comment-thread UX that gives an anchor visible chrome, are post-V1.
- **island props are typed at the boundary** (`@quillmark/wasm` 0.96.0), so the codec reads the shape off it; no local `IslandTable*` / `IslandImage*` duplicates or shape guards (DOCUMENT_MODEL §Stability seams). The union and the narrowing rule are §Islands above; the island channel's producer is the table NodeView (§"The table island").
- **island edits are ops, not an install.** The `islandOps` channel (`@quillmark/wasm` 0.101.0) reaches an island's payload and places a new slot, so a table edit keeps every identity anchor in the field. `lower` diffs the island sets and emits it; the install fallback has no island case.
- **install fallback** is a field not yet at content rest (nothing to splice, nothing to lose) and any `applyChange` that throws. Both are `install(addr, rt)`, paying that field's anchors: the exception, not the path. The throw path drops the field's held anchors where the ops path would have kept them; whether it earns a repair pass of its own is open.
- **input rules and the PM schema** ship: the markdown shorthands (`**`, `*`, `~~`, `` ` ``, `# `, `- `, `1. `, `> `, and a ` ``` ` code fence) are PM input rules producing ordinary transactions this codec lowers; markdown is an input shorthand, never the stored form. No table-entry rule ships: a pipe row is not a prefix a rule can fire on, so island insertion is the slash menu's instead (`codec/slash.ts`, VISUAL_EDITOR_UIUX §"Slash menu"), which is where a minted island id comes from.
