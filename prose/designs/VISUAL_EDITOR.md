# Visual Editor

Scope: the headline WYSIWYG surface over a Quillmark document — the card/block
structure, the schema-driven fields, and the prose-body editing, and how they
compose into one editable tree. This doc owns the **composition**: the layer that
assembles many small editors over a document's card/field structure. The per-field
corpus↔ProseMirror translation is [CODEC.md](CODEC.md); the rendered view and its
caret bridge are [PREVIEW.md](PREVIEW.md); the live `Document` and the WASM
boundary are [DOCUMENT_MODEL.md](DOCUMENT_MODEL.md).

Grounds on quillmark's document and schema model (canon: quillmark
`prose/canon/CARDS.md`, `SCHEMAS.md`, `DOCUMENT_STORAGE.md`) and the WASM edit
surface (`Document` + `quill.writer(doc)` + the addressed corpus verbs).

## Shape

The VisualEditor is **federated, not monolithic**: the schema is the outline, a
Svelte tree renders it, and each prose leaf is its own codec-backed ProseMirror
island. There is no single ProseMirror document that spans the whole page. A
document is a `main` card plus positional `cards[]`; each card is its
`CardSchema` fields in declaration order plus a body; the VisualEditor projects
that structure to DOM, hands every richtext/plaintext leaf to a codec+PM
instance, and every scalar field to a form control. Edits are **ops to the live
`Document`** at an address — never a markdown string, never a whole-document
re-serialize.

This resolves the skeleton's open "whether these split into sub-docs is TBD":
**they do.** Every corpus leaf (a body, a `richtext`/`plaintext` field) is a
separate sub-document with its own PM state, editor view, history, and plugin
stack; the card tree between them is plain Svelte, not PM nodes.

## The unit is the field, not the document

The corpus already stores a document as separate leaves at distinct addresses of
distinct types — a card's `body`, its `intro` richtext field, and its
`signature_block` array field are three different `Addr`s carrying three
different value types. A single ProseMirror document over the whole page would
have to re-encode the schema tree as PM node types and re-derive every address
from tree position — which is precisely where the prior art accretes its weight
(a markdown serializer reaching into library internals, a parser monkey-patching
token handlers, a plain-text fallback that silently destroys structure on the
next round-trip). Federation deletes that layer: the schema *is* the outline, so
the editor renders it directly and lets each leaf pick its editor by type.

So the VisualEditor is a **composition layer**, deliberately thin. It owns
structure, field-control selection, card operations, focus, command dispatch,
and diagnostics routing. It delegates the substance: corpus↔PM per leaf to the
[codec](CODEC.md), geometry and paint to the [preview](PREVIEW.md), truth and
mutators to the [document model](DOCUMENT_MODEL.md).

## Structure mirrors the schema

The card/field layout is a direct projection of `quill.schema` (`QuillSchema {
main, card_kinds? }`, each a `CardSchema { fields, ui?, body? }`), joined against
the live `Document`'s payload. The editor performs that schema × payload join
itself — there is no engine projection for the editing surface (canon:
quillmark `SCHEMAS.md`, the editor row of the projection table).

- **A card is a list of fields.** Render each card's fields in **declaration
  order** (the schema's `fields` map key order — order is not a `ui` hint), then
  its body. The body is the field-less corpus leaf (`Addr {card?}`, no `field`),
  gated by `body.enabled` and guided by `body.example`.
- **Metadata and body are one abstraction.** A body is a richtext leaf; a
  `richtext` field is a richtext leaf. Both take the *same* prose-field editor
  and the same codec, differing only in address form (`{card}` vs `{card,
  field}`) and layout prominence. There is no separate "body editor" concept —
  the metadata-vs-body duality of the prior art collapses into one field list
  whose controls are chosen by type.

**A control per field type** (the schema's field-type set — canon: `SCHEMAS.md`
field table — mapped to an editing affordance). `richtext` is a multi-line prose
leaf (codec + PM); with `inline: true`, a single-line one (constrained PM,
[CODEC.md](CODEC.md) §Inline mode). `plaintext` (± `inline`) is a prose leaf with
marks and islands suppressed (the plain codec). `string` is a text input, `enum` a
select over `values:`, `number`/`integer` a numeric input, `boolean` a toggle,
`datetime` a date/time control. `array` is a reorderable repeater (with
`items: {type: object}`, a typed table); `object` a nested subform recursing the
same mapping over `properties`. The text-ish types are the corpus's
data-vs-content × open/plain-vs-formatted 2×2 — `enum`/`string` are form controls,
`plaintext`/`richtext` are prose leaves — and only the content side reaches the
codec.

**`ui` hints drive layout, not structure.** `ui.group` sections fields (the
card's `groups` registry names them); `ui.compact` packs a field onto a shared
row; `ui.multiline` sizes a prose/plaintext leaf; field `ui.title` labels it.
Card `ui.title` is the card header — a literal or a `{field}` template the editor
interpolates with live values — overridden per instance by `$ext.editor.title`
(canon: `CARDS.md`).

**The editor projects the commitment ladder.** Per field: show the authored
value; else ghost the `default:` as placeholder text (never written back — it
lives in the schema); offer `example:` as guidance, not content; surface a
`!must_fill` marker as a soft inline nudge. None of these gate anything — an
incomplete document edits and renders fine (canon: `SCHEMAS.md` zero-fill render,
commitment ladder). Completeness is a read of `quill.validate(doc)`, not a
render or edit gate.

## The address is the spine

Every editable unit is keyed by an address: a corpus leaf by `Addr {card?,
field?}`, a scalar field by its `{card?, field}` path, a card by its position.
This one identifier is what `applyChange` targets, what the preview's
`onCaretPick`/`focusPosition` speak (`CorpusHit.field`, `FieldRegion.field`),
what a diagnostic routes to, and what Svelte keys the tree on. The editor is, at
bottom, an address-keyed collection of small editors.

**Stable instance identity over positional cards.** Cards are positional in the
corpus (`cards[i]`, addressed by index), and that is the prior art's deepest
pain: index-keyed loops, stale-index write guards, reused-component
reconciliation, phantom placeholders. The VisualEditor keys each card *instance*
by a stable identity — its `$id` when present, else a session-minted key —
decoupling component and PM-instance lifecycle from array position. Position is
resolved from the stable key only at the mutation boundary (`moveCard`,
`applyChange(addr)`). A reorder is then a `moveCard` plus a reorder of stable
keys; no leaf remounts, no PM instance is re-fed a swapped document, no caret is
lost to a component swap.

## Edits are ops to the live Document

The VisualEditor holds the live `Document` (via `DocumentWriter =
quill.writer(doc)`) and writes ops at an address. It never emits a markdown
string and never re-parses the whole document.

- **prose leaf** → the codec lowers each PM transaction to a `ChangeBundle` and
  calls `doc.applyChange(addr, bundle)` ([CODEC.md](CODEC.md)). This is the
  per-keystroke path; anchors rebase, the typed writer's markdown-import `setBody`
  is *not* on this path.
- **scalar / array / object field** → the typed writer: `writer.set(name, value)`
  for main, `writer.card(i).set(name, value)` for a card. Schema-checked commit;
  an undeclared name throws (a typo caught on the typed path).
- **structure** → `writer.addCard` / `insertCard` / `removeCard` / `moveCard` /
  `setCardKind` on the document.

Reconciliation is field-scoped, not whole-document. The editor holds its
optimistic PM state and re-hydrates a leaf only on an **external** corpus change
(a paste, a `revise`, another edit source), gated by canonical-corpus equality
scoped to the leaf that changed — the narrow analog of the prior art's
whole-document `Document.equals` re-init gate ([CODEC.md](CODEC.md)
§Reconciliation). Caret continuity across the editor's *own* edits is the leaf's
PM `StepMap`, not a re-hydrate.

## Card operations

- **Add** — pick the kind first (a transient menu; skip it when the quill
  declares exactly one card-kind), then `quill.seedCard(kind, doc.main.seed?.
  [kind])` → `insertCard(index, card)` in one document mutation. No client-side
  placeholder card exists in the tree before it is real; the seed cascade is
  `$seed` overlay › `example:` › absent (canon: `CARDS.md`, `SCHEMAS.md`
  seeding).
- **Reorder / delete** — `moveCard` / `removeCard`, over stable keys (above).
- **Retype** — `setCardKind`; the field list re-projects against the new kind's
  schema, prose leaves for kept fields keep their corpus.
- **Rename** — write `$ext.editor.title`; editor state, never reaches the backend
  (canon: `CARDS.md` `$ext`). The editor holds the `editor` namespace object and
  writes it whole via `setCardExtNamespace` (the namespace is the write unit).

## Focus and the preview bridge

**One active leaf holds the caret.** The VisualEditor owns `activeAddr`; because
leaves are keyed by stable identity, this is plain state, not a value hoisted to
a parent to survive remounts (the prior art's workaround). The bridge, both
directions ([PREVIEW.md](PREVIEW.md) §Click bridge):

- **preview → editor** — `onCaretPick(hit)` resolves `hit.field` to a leaf,
  which runs `codec.corpusToPM(hit.pos)` and sets its PM caret; a `'segment'`
  granularity hit just focuses the leaf without an exact caret.
- **editor → preview** — a caret move in the active leaf calls
  `preview.focusPosition(field, pos)` (locate → caret rect → scroll).

## Chrome

Editing chrome is thin and **per-leaf**; structural chrome lives in the shell.

- **Formatting** — a selection toolbar and keymap over the active leaf, in the
  corpus mark vocabulary (`strong` / `emph` / `underline` / `strike` / `code` /
  `link`, plus `anchor` identity). Commands emit PM transactions the codec
  already lowers to `markOps` — no new write path.
- **Input rules** — the markdown shorthands (`**`, `#`, `- `, table entry) are PM
  input rules on the leaf; they produce ordinary transactions the codec lowers.
  Markdown is an input *shorthand* here, never the stored representation.
- **Tables / islands** — driven from the PM model (a `CellSelection`, node
  decorations), not reconstructed from DOM geometry. An island is one PM leaf
  node over one corpus `U+FFFC` slot ([CODEC.md](CODEC.md) §Islands).
- **Structure** — add-card affordance, card headers, move/delete/retype controls,
  the group sections. Plain Svelte over the document mutators.

## Diagnostics

Three sources, all routed to a field address and shown inline:
`quill.validate(doc)` (path-keyed `Diagnostic[]` — type errors fatal, `must_fill`
a soft warning), `LiveSession.warnings`, and render errors mapped through
`FieldRegion.field`. `must_fill` and present-null never gate; a malformed value
(fails coercion) is the only hard field error (canon: `SCHEMAS.md`).

## Surface

Two layers, per [ARCHITECTURE.md](ARCHITECTURE.md) (vanilla-TS core + Svelte
chrome). The prose leaf is the core seam; the composition is the chrome.

```ts
// core: one prose leaf — owns the codec, the PM view, and its plugin stack.
function createField(opts: {
  doc: Document;
  quill: Quill;
  addr: Addr;                       // {card?, field?}; field-less = a body
  container: HTMLElement;
  onFocus?(addr: Addr): void;
  onCaretMove?(addr: Addr, pos: number): void;   // → preview.focusPosition
}): FieldController;

interface FieldController {
  setCaret(pos: number): void;      // preview onCaretPick → codec.corpusToPM → here
  applyExternal(): void;            // external corpus change → re-hydrate this leaf (gated)
  focus(): void;
  destroy(): void;
}
```

```svelte
<!-- chrome: the composition. Renders the card tree, mounts a <ProseField>
     (createField) per corpus leaf and a form control per scalar field. -->
<VisualEditor
  {doc} {quill}
  onActiveAddrChange={(addr) => …}
  onCaretMove={(field, pos) => preview.focusPosition(field, pos)}
/>
<!-- imperative bridge in: visualEditor.setCaret(hit) from preview.onCaretPick -->
```

## Not owned

- **corpus ↔ PM, the position map, mark/island translation** — the codec's
  ([CODEC.md](CODEC.md)).
- **paint, page geometry, caret rects, click→corpus** — the preview's
  ([PREVIEW.md](PREVIEW.md)).
- **document truth, mutators, `validate`, the WASM boundary** — the document
  model's ([DOCUMENT_MODEL.md](DOCUMENT_MODEL.md)).
- **persistence, autosave, quill resolution, the editor|preview split shell** —
  the consumer's (the playground wires them; [ARCHITECTURE.md](ARCHITECTURE.md)).

## What the greenfield drops

Named against the prior art (web-app) so the shape's intent is legible:

- **The markdown edit representation.** No `onDocumentChange(doc: string)`, no
  per-body markdown parse/serialize, no serializer reaching into library
  internals. The corpus is truth; edits are ops; markdown lives only at input
  rules and paste/copy edges.
- **The metadata-vs-body split.** One field list, one field-editor abstraction
  chosen by type — not a `MetadataWidget` + `WizardCore` + `BodyEditor` stack
  with cloned form state and defaults applied in three places.
- **Positional card identity.** Stable instance keys retire the stale-index
  guards, index-keyed loops, reused-instance reconciliation, and phantom
  placeholder card.
- **DOM-geometry chrome.** Toolbars and table controls read the PM model, not
  reconstructed `getBoundingClientRect` geometry with many re-measure triggers.
- **The god-object shell.** Persistence, autosave, quill resolution, and modals
  are the consumer's, kept out of the editor (dual sources of truth go with
  them).

## Open questions

- **Card-instance identity** — mint a session key, or push a stable `$id` onto
  every card at author/seed time so identity survives storage round-trips
  natively? The write boundary is the same either way; the question is whether
  identity is the editor's private concern or the document's.
- **Array/table editing depth** — how far the `array`-of-`object` typed-table
  control converges with the richtext table island (they are different corpus
  citizens — a scalar array field vs a body island — but read similarly).
- **Group layout as data** — `ui.group`/`compact` express intent; how much
  responsive column packing is schema-driven vs the editor's own layout policy.
- **Command palette / structural keymap** — Enter-at-end-of-body to add a card,
  Tab between fields: structural navigation that crosses leaf boundaries, which no
  single PM keymap owns. Likely a shell-level keymap over `activeAddr`.
- **History across leaves** — per-leaf PM history is the default; whether a
  document-level undo that spans a structural op (add/move card) plus a prose
  edit needs a coordinating stack above the leaves.
