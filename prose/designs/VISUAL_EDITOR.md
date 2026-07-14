# Visual Editor

Scope: the headline WYSIWYG surface over a Quillmark document — the card/field
structure, the schema-driven fields, and prose-body editing, and how they compose
into one editable tree. This doc owns the **composition**; the per-field
corpus↔ProseMirror translation is [CODEC.md](CODEC.md), the rendered view and its
caret bridge are [PREVIEW.md](PREVIEW.md), the live `Document` and WASM boundary
are [DOCUMENT_MODEL.md](DOCUMENT_MODEL.md). Grounds on quillmark's document and
schema model (canon: quillmark `CARDS.md`, `SCHEMAS.md`, `DOCUMENT_STORAGE.md`)
and the WASM edit surface (`Document`, `quill.writer(doc)`, the addressed corpus
verbs).

## Federated, not monolithic

The VisualEditor is a **thin composition layer** over many small editors, not one
ProseMirror document spanning the page. The schema is the outline, a Svelte tree
renders it, and each corpus leaf — a body, a `richtext`/`plaintext` field — is a
separate sub-document with its own PM state, view, history, and plugins; scalar
fields are plain form controls. This resolves the skeleton's "whether these split
into sub-docs is TBD": **they split.**

The corpus already stores a document as separate leaves at distinct addresses of
distinct types — a card's body, its `intro` richtext field, its `signature_block`
array are three `Addr`s carrying three value types. A single PM document would
have to re-encode that schema tree as PM nodes and re-derive every address from
tree position — exactly where the prior art (web-app) accretes weight: a markdown
serializer reaching into library internals, a parser monkey-patching token
handlers, a plain-text fallback that silently destroys structure on the next
round-trip. Federation deletes that layer. The editor renders the schema directly
and lets each leaf pick its editor by type; it owns structure, control selection,
card operations, focus, command dispatch, and diagnostics routing, and delegates
the substance — corpus↔PM to the [codec](CODEC.md), geometry to the
[preview](PREVIEW.md), truth and mutators to the [document model](DOCUMENT_MODEL.md).

## Structure mirrors the schema

The layout is a direct projection of `quill.schema` (`QuillSchema { main,
card_kinds? }`, each a `CardSchema { fields, ui?, body? }`) joined against the
live `Document`'s payload. The editor performs that schema × payload join itself —
there is no engine projection for the editing surface (canon: `SCHEMAS.md`, the
editor row of the projection table).

**A card is a list of fields**, rendered in **declaration order** (the `fields`
map key order — order is not a `ui` hint), then a body. The body is the field-less
corpus leaf (`Addr {card?}`, no `field`), gated by `body.enabled`. Metadata and
body are **one abstraction**: a body is a richtext leaf, a `richtext` field is a
richtext leaf, and both take the same prose-field editor and codec, differing only
in address form (`{card}` vs `{card, field}`) and prominence. The metadata-vs-body
duality of the prior art collapses into one field list whose controls are chosen
by type.

**A control per field type** (canon: `SCHEMAS.md` field table). `richtext` is a
multi-line prose leaf; with `inline: true`, a single-line one (constrained PM,
[CODEC.md](CODEC.md) §Inline mode). `plaintext` (± `inline`) is a prose leaf with
marks and islands suppressed. `string` is a text input, `enum` a select over
`values:`, `number`/`integer` a numeric input, `boolean` a toggle, `datetime` a
date control. `array` is a reorderable repeater (`items: {type: object}` → a typed
table); `object` a nested subform recursing the mapping over `properties`. The
text-ish types are the corpus's data-vs-content × open/plain-vs-formatted 2×2 —
`enum`/`string` are form controls, `plaintext`/`richtext` prose leaves — and only
the content side reaches the codec.

`ui` hints drive layout, not structure: `ui.group` sections fields, `ui.compact`
packs a field onto a shared row, `ui.multiline` sizes a leaf, field `ui.title`
labels it. Card `ui.title` is the header — a literal or a `{field}` template
interpolated with live values — overridden per instance by `$ext.editor.title`
(canon: `CARDS.md`).

**The editor projects the commitment ladder.** Per field: show the authored value;
else ghost the `default:` as placeholder (never written back — it lives in the
schema); offer `example:` as guidance; surface a `!must_fill` marker as a soft
nudge. Nothing gates — an incomplete document edits and renders fine (canon:
`SCHEMAS.md` zero-fill render). Completeness is a read of `quill.validate(doc)`,
not a gate.

## The address is the spine

Every editable unit is keyed by an address — a corpus leaf by `Addr {card?,
field?}`, a scalar by its `{card?, field}` path, a card by position. One
identifier is what `applyChange` targets, what the preview bridge speaks
(`CorpusHit.field`, `FieldRegion.field`), what a diagnostic routes to, and what
Svelte keys the tree on.

But cards are **positional** in the corpus (`cards[i]`), and that is the prior
art's deepest pain: index-keyed loops, stale-index write guards, reused-component
reconciliation, phantom placeholders. So the VisualEditor keys each card
*instance* by a **stable identity** — its `$id` when present, else a session key —
and resolves that key to an index only at the mutation boundary (`moveCard`,
`applyChange(addr)`). A reorder is a `moveCard` plus a key reorder; no leaf
remounts, no PM instance is re-fed a swapped document, no caret is lost to a swap.

## Edits are ops to the live Document

The VisualEditor holds the live `Document` (via `DocumentWriter =
quill.writer(doc)`) and writes ops at an address — never a markdown string, never
a whole-document re-serialize:

- **prose leaf** → the codec lowers each PM transaction to a `ChangeBundle` and
  calls `doc.applyChange(addr, bundle)` ([CODEC.md](CODEC.md)) — the per-keystroke
  path; anchors rebase. The typed writer's markdown-import `setBody` is *not* it.
- **scalar / array / object** → the typed writer: `writer.set(name, value)`, or
  `writer.card(i).set(...)`. Schema-checked; an undeclared name throws.
- **structure** → `insertCard` / `removeCard` / `moveCard` / `setCardKind`.

Reconciliation is field-scoped. The editor holds its optimistic PM state and
re-hydrates a leaf only on an **external** corpus change (a paste, a `revise`,
another edit source), gated by canonical-corpus equality scoped to that leaf — the
narrow analog of the prior art's whole-document `Document.equals` re-init gate
([CODEC.md](CODEC.md) §Reconciliation). Caret continuity across the editor's *own*
edits is the leaf's PM `StepMap`, not a re-hydrate.

## Card operations

- **Add** — pick the kind (a transient menu, skipped when the quill declares one
  kind), then `quill.seedCard(kind, doc.main.seed?.[kind])` → `insertCard(index,
  card)` in one mutation. No placeholder card exists before it is real; the seed
  cascade is `$seed` overlay › `example:` › absent (canon: `CARDS.md`).
- **Reorder / delete** — `moveCard` / `removeCard`, over stable keys.
- **Retype** — `setCardKind`; the field list re-projects, kept fields keep their
  corpus.
- **Rename** — `$ext.editor.title`, editor state that never reaches the backend
  (canon: `CARDS.md`). The editor holds the `editor` namespace and writes it whole
  via `setCardExtNamespace` (the namespace is the write unit).

## Focus and the preview bridge

**One active leaf holds the caret.** The VisualEditor owns `activeAddr`; because
leaves are keyed by stable identity, this is plain state, not a value hoisted to a
parent to survive remounts (the prior art's workaround). Both directions
([PREVIEW.md](PREVIEW.md) §Click bridge):

- **preview → editor** — `onCaretPick(hit)` resolves `hit.field` to a leaf, which
  runs `codec.corpusToPM(hit.pos)` and sets its PM caret; a `'segment'` hit just
  focuses the leaf.
- **editor → preview** — a caret move in the active leaf calls
  `preview.focusPosition(field, pos)`.

## Chrome

Editing chrome is thin and **per-leaf**; structural chrome is Svelte in the shell.

- **Formatting** — a selection toolbar and keymap over the active leaf in the
  corpus mark vocabulary (`strong`/`emph`/`underline`/`strike`/`code`/`link`, plus
  `anchor` identity), emitting PM transactions the codec lowers to `markOps`.
- **Input rules** — the markdown shorthands (`**`, `#`, `- `, table entry) are PM
  input rules producing ordinary transactions; markdown is an input *shorthand*,
  never the stored form.
- **Tables / islands** — driven from the PM model (a `CellSelection`,
  decorations), not reconstructed from DOM geometry. An island is one PM leaf node
  over one corpus `U+FFFC` slot ([CODEC.md](CODEC.md) §Islands).
- **Structure** — add-card affordance, headers, move/delete/retype controls, group
  sections, over the document mutators.

## Diagnostics

Three sources, each routed to a field address and shown inline:
`quill.validate(doc)` (path-keyed `Diagnostic[]` — type errors fatal, `must_fill`
a soft warning), `LiveSession.warnings`, and render errors mapped through
`FieldRegion.field`. `must_fill` and present-null never gate; a value that fails
coercion is the only hard field error (canon: `SCHEMAS.md`).

## Surface

Two layers, per [ARCHITECTURE.md](ARCHITECTURE.md): the prose leaf is the
vanilla-TS core seam, the composition is Svelte chrome.

```ts
// core: one prose leaf — owns the codec, the PM view, and its plugin stack.
function createField(opts: {
  doc: Document;
  quill: Quill;
  addr: Addr;                                    // {card?, field?}; field-less = a body
  container: HTMLElement;
  onFocus?(addr: Addr): void;
  onCaretMove?(addr: Addr, pos: number): void;   // → preview.focusPosition
}): FieldController;

interface FieldController {
  setCaret(pos: number): void;   // preview onCaretPick → codec.corpusToPM → here
  applyExternal(): void;         // external corpus change → re-hydrate this leaf (gated)
  focus(): void;
  destroy(): void;
}
```

```svelte
<!-- chrome: renders the card tree, mounts a <ProseField> (createField) per
     corpus leaf and a form control per scalar field. -->
<VisualEditor
  {doc} {quill}
  onActiveAddrChange={(addr) => …}
  onCaretMove={(field, pos) => preview.focusPosition(field, pos)}
/>
<!-- bridge in: visualEditor.setCaret(hit) from preview.onCaretPick -->
```

## Not owned

- corpus↔PM, the position map, mark/island translation — the codec's
  ([CODEC.md](CODEC.md)).
- paint, page geometry, caret rects, click→corpus — the preview's
  ([PREVIEW.md](PREVIEW.md)).
- document truth, mutators, `validate`, the WASM boundary — the document model's
  ([DOCUMENT_MODEL.md](DOCUMENT_MODEL.md)).
- persistence, autosave, quill resolution, the editor|preview split shell — the
  consumer's (the playground wires them; [ARCHITECTURE.md](ARCHITECTURE.md)).

## Open questions

- **Card-instance identity** — a session key, or a stable `$id` stamped at
  author/seed time so identity survives storage round-trips? The write boundary is
  the same; the question is whether identity is the editor's concern or the
  document's.
- **Array/table convergence** — how far the `array`-of-`object` table control
  converges with the richtext table island. Different corpus citizens (a scalar
  array field vs a body island), similar affordance.
- **Layout as data** — how much responsive column packing is `ui.group`/`compact`
  driven vs the editor's own policy.
- **Structural keymap** — Enter-at-end-of-body to add a card, Tab between fields:
  navigation crossing leaf boundaries that no single PM keymap owns. Likely a
  shell keymap over `activeAddr`.
- **Undo across leaves** — per-leaf PM history is the default; whether a
  document-level undo spanning a structural op plus a prose edit needs a
  coordinating stack above the leaves.
