# Visual Editor

> **Implementation**: `src/lib/visual/`

## TL;DR

The headline WYSIWYG surface over a Quillmark document — the card/field structure,
the schema-driven fields, and prose-body editing, and how they compose into one
editable tree. This doc owns the **composition**; the per-field content↔ProseMirror
translation is [CODEC.md](CODEC.md), the rendered view and its caret bridge are
[PREVIEW.md](PREVIEW.md), the live `Document` and WASM boundary are
[DOCUMENT_MODEL.md](DOCUMENT_MODEL.md). Grounds on quillmark's document and schema
model (canon: quillmark `CARDS.md`, `SCHEMAS.md`, `DOCUMENT_STORAGE.md`) and the
WASM edit surface (`Document`, `quill.writer(doc)`, the addressed content verbs).

## Federated, not monolithic

The VisualEditor is a **thin composition layer** over many small editors, not one
ProseMirror document spanning the page. The schema is the outline, a Svelte tree
renders it, and each content leaf — a body, a `richtext`/`plaintext` field — is a
separate sub-document with its own PM state, view, history, and plugins; scalar
fields are plain form controls.

The content already stores a document as separate leaves at distinct addresses of
distinct types — a card's body, its `intro` richtext field, its `signature_block`
array are three `Addr`s carrying three value types. A single PM document would
have to re-encode that schema tree as PM nodes and re-derive every address from
tree position — exactly where the prior art (web-app) accretes weight: a markdown
serializer reaching into library internals, a parser monkey-patching token
handlers, a plain-text fallback that silently destroys structure on the next
round-trip. Federation deletes that layer. The editor renders the schema directly
and lets each leaf pick its editor by type; it owns structure, control selection,
card operations, focus, command dispatch, and diagnostics routing, and delegates
the substance — content↔PM to the [codec](CODEC.md), geometry to the
[preview](PREVIEW.md), truth and mutators to the [document model](DOCUMENT_MODEL.md).

## Structure mirrors the schema

The layout is a direct projection of `quill.schema` (`QuillSchema { main,
card_kinds? }`, each a `CardSchema { fields, ui?, body? }`) joined against the
live `Document`'s payload. The editor performs that schema × payload join itself —
there is no engine projection for the editing surface (canon: `SCHEMAS.md`, the
editor row of the projection table).

**A card is a list of fields**, rendered in **declaration order** (the `fields`
map key order — order is not a `ui` hint), then a body. The body is the field-less
content leaf (`Addr {card?}`, no `field`), gated by `body.enabled`. Metadata and
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
date control. `array` is an add/remove repeater — elements hold declaration/entry
order, no reorder control (see [VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md)
§"Array fields"); an `object`-element array commits each element as minimal JSON in
V1, not a typed table (deferred, §"Settled and deferred"). `object` is a nested
subform over `properties`, **scalar properties only** in V1 — a nested
`prose`/`array`/`object` property shows a "not editable in V1" placeholder rather
than recursing. The
text-ish types are the model's data-vs-content × open/plain-vs-formatted 2×2 —
`enum`/`string` are form controls, `plaintext`/`richtext` prose leaves — and only
the content side reaches the codec.

`ui` hints drive layout, not structure: `ui.group` sections fields, `ui.compact`
packs a field onto a shared row, `ui.multiline` sizes a leaf, field `ui.title`
labels it. Card `ui.title` is the header — a literal or a `{field}` template
interpolated with live values — overridden per instance by `$ext.editor.title`
(canon: `CARDS.md`).

**The editor projects the commitment ladder.** Per field: show the authored value;
else ghost the `default:` as placeholder (never written back — it lives in the
schema). A no-`default:` field is **required** (Unendorsed — its seed carries a
`!must_fill` marker; no separate `required` axis, canon `DOCUMENT_MODEL.md`): the
label shows a persistent `*` (issue #75a), complementary to the ghost since a
required field has no default to ghost. An unfilled marker still surfaces as a
routed `validate()` warning (§Diagnostics) — the `*` states required-ness, the
warning reports unmet-ness. A field's `description:` rides its label as a tooltip
(issue #75b); `example:` reaches the editor only through the seed cascade
(§"Card operations"). Guidance is per-field **or** document-level, never a third
thing hanging off a field: no field carries a tips surface of its own, and
document-level hints ride the `$ext.editor.tips` card instead (§"Card operations",
issue #71) — a chrome channel, not a schema key, so it makes no claim about any one
field (VISUAL_EDITOR_UIUX §Fields, §"Tips card"). Nothing gates — an incomplete document edits and renders fine (canon:
`SCHEMAS.md` zero-fill render). Completeness is a read of `quill.validate(doc)`,
not a gate.

**Clearing a scalar unsets it.** A blank number / text / date / enum control
commits `undefined`; the VisualEditor lowers that to `doc.removeField(addr)` (the
quill-free store lane — an unset writes no value, so no schema lane applies), never
a write. An absent field resolves authored › `default:` › zero-fill at render
(canon `SCHEMAS.md`), so the ghosted `default:` takes effect and the ghost is
truthful, not a snapshot. Committing the default instead would freeze a value
against later schema changes — the engine never persists a default, nor does the
editor. `EnumField` gives unset a ghost sentinel option — picking it unsets,
picking any value (the default included) writes — so "commit the default" is
expressible and shown-never-written stays visible. `DateField` prints the
default's digits in its empty segments, ghost-toned, rather than the primitive's
`mm`/`dd`/`yyyy` hints (issue #89) — a format hint reads "empty" where the rung
says "will render 2026-01-01". It paints the ghost into the segment text over an
unset primitive, never into its `value`: a defaulted value would be
indistinguishable from an authored one to everything that reads the control.
`BooleanField` is exempt (a checkbox has no blank). Unset, and every numeric
commit, settles at `change` (blur/Enter): a per-keystroke commit round-trips
transient invalid prefixes (`-`,
`1.`) through the boundary and flashes a coercion diagnostic the `role="status"`
live region announces. Text keeps live commit but defers its clear to `change` — an
instant unset would flash the field through its default mid-retype (select-all →
type). Trade-off: an explicit empty string OVER a non-empty default is
inexpressible from the UI — clear and unset collapse to one gesture.

## The address is the spine

Every editable unit is keyed by an address — a content leaf by `Addr {card?,
field?}`, a scalar by its `{card?, field}` path, a card by position. One
identifier is what `applyChange` targets, what the preview bridge speaks
(`ContentHit.field`, `FieldRegion.field`), what a diagnostic routes to, and what
Svelte keys the tree on.

But cards are **positional** in the content (`cards[i]`), and that is the prior
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
re-hydrates a leaf only on an **external** content change (a paste, a `revise`,
another edit source), gated by canonical-content equality scoped to that leaf — the
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
  content.
- **Rename** — `$ext.editor.title`, editor state that never reaches the backend
  (canon: `CARDS.md`).
- **Tips** — `$ext.editor.tips` on `main`, a sibling key of `title` in the same
  namespace (issue #71): a list of authoring hints a quill or consumer **seeds**,
  which the editor renders as a dismissable card and never adds to. It is
  **document-level**, so the channel is `model.tips` at the derive's root, not a
  field on every card, and it renders in a fixed slot after `main`. Dismissal clears
  it. Never gates, never renders to the backend, absent when the channel is empty.

**The `editor` namespace is the write unit, and one verb owns it.** Because
`storeExtNamespace` REPLACES the namespace it targets — preserving sibling
namespaces, not sibling keys — a writer that stores only its own key destroys the
others, silently. Both writers therefore go through `patchEditorExt(doc, addr,
patch)` (`ext.ts`), which merges and treats an `undefined` value as a key drop; a
consumer seeding the namespace reaches the same verb off `@quillmark/editor/visual`.
That is what keeps a dismissal from wiping every renamed card's title, and what
makes key N+1 inherit the rule instead of re-deriving it.

## Focus and the preview bridge

**One active leaf holds the caret.** The VisualEditor owns `activeAddr`; because
leaves are keyed by stable identity, this is plain state, not a value hoisted to a
parent to survive remounts (the prior art's workaround). Both directions
([PREVIEW.md](PREVIEW.md) §Click bridge):

- **preview → editor** — `visualEditor.setCaret(hit)` resolves `hit.field` to a
  leaf, which runs `codec.usvToPM(hit.pos)` and sets its PM caret; a `'segment'`
  hit just focuses the leaf (`hit.pos` is a segment start, not a cluster-exact
  caret).
- **editor → preview** — a caret move in the active leaf emits `onCaretMove(addr,
  pos)`; the consumer maps `addr` to the canonical `DocPath` field address with
  `fieldPathForAddr` (`caret.ts`, built on `formatDocPath`) and calls
  `preview.focusPosition(field, pos)`. The USV `pos` is the shared coordinate — no
  codec hop.

## Chrome

Editing chrome is thin and **per-leaf**; structural chrome is Svelte in the shell.

- **Formatting** — a selection toolbar over the active leaf in the content mark
  vocabulary (`strong`/`emph`/`underline`/`strike`/`code`/`link`, plus `anchor`
  identity), emitting PM transactions the codec lowers to `markOps`. A keymap
  mirrors the core marks (`Mod-b`/`i`/`u`); `strike`/`code`/`link` are toolbar-only
  in V1.
- **Input rules** — the markdown shorthands (`**`, `*`, `~~`, `` ` ``, `# `, `- `,
  `1. `, `> `, and a ` ``` ` code fence) are PM input rules producing ordinary
  transactions; markdown is an input *shorthand*, never the stored form. No
  table-entry rule (island authoring deferred). `- ` / `1. ` are the only way to
  START a list — there is no toggle command and no toolbar affordance — so they
  normalize a heading they wrap, and `# ` declines inside an item: `list_item` is
  `block+`, making `list_item > heading` representable and unrenderable.
- **Structural keys** — a body leaf's keymap, composed in `codec/keymap.ts` as one
  *chain* per key, innermost surface first. The list link (`codec/lists.ts`): `Tab` /
  `Shift-Tab` change an item's nesting depth, `Enter` splits an item, exits an
  empty one (one level per press), and opens a paragraph above a list's first
  item, `Backspace` at an item's start merges into the previous item or lifts at
  the list's start. The `code_block` link ahead of it (`codec/code.ts`): `Tab` /
  `Shift-Tab` are literal indentation — two spaces, since the stored text is what
  the preview typesets, and outdent takes a tab or partial spaces too because
  imported content carries either — and `Enter` is a newline. An island's cell
  traversal is the third link, when it lands. **Tab forks on the leaf's role, not
  the caret's position.** An inline/plaintext leaf is a form field: Tab stays
  unbound, so the deferred structural keymap owns field navigation outright. A body
  is a document: Tab is structural. Outside every link the key is not swallowed,
  leaving the body a keyboard exit. Cleanup is command-local (the primitives join
  the boundary they open); a global pass would fuse adjacent same-type lists, and an
  ordinal decrease is how `Content` marks that boundary.
- **Tables / islands** — driven from the PM model (a `CellSelection`,
  decorations), not reconstructed from DOM geometry. An island is one PM leaf node
  over one content `U+FFFC` slot ([CODEC.md](CODEC.md) §Islands).
- **Structure** — add-card affordance, headers, move/delete/retype controls, group
  sections, over the document mutators.

## Diagnostics

Three sources, each routed to a field address and shown inline:
`quill.validate(doc)` (`Diagnostic[]` keyed on a canonical `DocPath` `.path` — type
errors fatal, `must_fill` a soft warning), `LiveSession.warnings`, and render errors
mapped through `FieldRegion.field`. Routing runs on the boundary's `parseDocPath`
(`diagnostics.ts`), resolving the absolute card index to the editor's stable-id
keying; a local commit error is keyed at its known call-site address and carries the
thrown diagnostic's `code` (0.96 mutator failures carry one). `must_fill` and
present-null never gate; a value that fails coercion is the only hard field error
(canon: `SCHEMAS.md`).

## Surface

Two layers, per [ARCHITECTURE.md](ARCHITECTURE.md): the prose leaf is the
vanilla-TS core seam, the composition is Svelte chrome.

```ts
// core: one prose leaf — owns the codec, the PM view, and its plugin stack.
function createField(opts: {
  doc: Document;
  addr: Addr; // {card?, field?}; field-less = a body
  container: HTMLElement;
  inline?: boolean; // one-textblock schema (a richtext(inline) field)
  plaintext?: boolean; // inline + marks/islands stripped
  label?: string; // aria-label on the contenteditable
  onFocus?(addr: Addr): void;
  onCaretMove?(addr: Addr, pos: number): void;
}): FieldController;

interface FieldController {
  setCaret(pos: number): void; // preview onCaretPick → codec.usvToPM → here
  applyExternal(): void; // external content change → re-hydrate this leaf (gated)
  focus(): void;
  getContent(): Content; // the leaf's stored content (tests / reconcile)
  destroy(): void;
}
```

```svelte
<!-- chrome: renders the card tree, mounts a <ProseField> (createField) per
     content leaf and a form control per scalar field. -->
<VisualEditor
  bind:this={visualEditor}
  {doc} {quill}
  onActiveAddrChange={(addr) => …}
  onCaretMove={(addr, pos) => {
    const field = fieldPathForAddr(addr, doc.cards.map((c) => c.kind));
    if (field) preview.focusPosition(field, pos);
  }}
/>
<!-- bridge in: visualEditor.setCaret(hit) from preview.onCaretPick -->
```

## Not owned

- content↔PM, the position map, mark/island translation — the codec's
  ([CODEC.md](CODEC.md)).
- paint, page geometry, caret rects, click→content — the preview's
  ([PREVIEW.md](PREVIEW.md)).
- document truth, mutators, `validate`, the WASM boundary — the document model's
  ([DOCUMENT_MODEL.md](DOCUMENT_MODEL.md)).
- persistence, autosave, quill resolution, the editor|preview split shell — the
  consumer's (the playground wires them; [ARCHITECTURE.md](ARCHITECTURE.md)).

## Settled and deferred

- **Card-instance identity is a session key** — an in-memory id per card,
  reordered in lockstep with the content and resolved to an index only at the
  mutation boundary (`structure.ts` `IdSeq`). A stable `$id` stamped at seed time,
  so identity survives a storage round-trip, is a document-side change deferred
  past V1.
- **Layout is `ui`-driven** — `ui.group` sections, `ui.compact` packs a shared
  row (`structure.ts`); the editor adds no responsive policy of its own.
- **Undo is per-leaf** — each prose leaf carries its own PM history. A
  document-level undo spanning a structural op plus a prose edit — a coordinating
  stack above the leaves — is deferred.
- **Array/table convergence** — how far the `array`-of-`object` table control
  converges with the richtext table island (a scalar array field vs a body island,
  similar affordance) is deferred.
- **Structural keymap** — Enter-at-end-of-body to add a card, Tab between fields:
  navigation crossing leaf boundaries no single PM keymap owns. Deferred; it lands
  as a shell keymap over `activeAddr`, alongside the deferred insert surface
  (VISUAL_EDITOR_UIUX §Open). Tab is already taken inside a body (§Chrome, "List
  keys"), so field navigation reaches the inline/plaintext leaves and the body's
  unhandled Tab; what a body's keyboard exit should be — Escape blurs to the shell
  is the candidate, and it contends with the format popover's close and the card
  rename's revert — settles here rather than in the leaf.
