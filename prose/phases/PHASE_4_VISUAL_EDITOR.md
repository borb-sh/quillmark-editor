# Phase 4 — VisualEditor

**Goal:** the headline WYSIWYG surface — a **federated** composition of many small
editors over a Quillmark document: the card stack, the schema-driven fields, and
prose-body editing, composed into one editable tree that writes ops to the live
`Document`.

**Implements:** [VISUAL_EDITOR](../designs/VISUAL_EDITOR.md),
[VISUAL_EDITOR_UIUX](../designs/VISUAL_EDITOR_UIUX.md).

**Depends on:** Phases 1 and 3 (the codec is the per-leaf substance). Preview
(Phase 2) is not required to build it, but the caret bridge is wired in Phase 5.

## In scope

- **Federated composition.** A thin Svelte layer over many sub-editors, **not** one
  PM document spanning the page. Each corpus leaf (a body, a `richtext`/`plaintext`
  field) is its own PM sub-document via the codec's `createField`; scalar fields are
  plain form controls. The editor owns structure, control selection, card
  operations, focus, command dispatch, and diagnostics routing.
- **Structure mirrors the schema.** A direct projection of `quill.schema` joined
  against the live `Document` payload — the editor does the schema × payload join
  itself. A card is a field list in **declaration order**, then a body; metadata and
  body are one abstraction (both richtext leaves), differing only in address form.
- **A control per field type.** `richtext`/`plaintext` (± `inline`) → prose leaf;
  `string` → text input; `enum` → select over `values`; `number`/`integer` →
  numeric; `boolean` → toggle; `datetime` → date control; `array` → reorderable
  repeater (`items: object` → a typed table); `object` → nested subform.
- **The address spine + stable card identity.** Every editable unit keyed by `Addr`;
  each card *instance* keyed by a **stable identity**, resolved to an index only at
  the mutation boundary (`moveCard`, `applyChange`). A reorder is a `moveCard` plus a
  key reorder — no remount, no lost caret.
- **Edits are ops.** Prose leaf → codec → `applyChange`; scalar/array/object → the
  typed `writer`; structure → `insertCard`/`removeCard`/`moveCard`/`setCardKind`.
- **Card operations.** Add (seed the kind → `insertCard`), reorder/delete
  (buttons, not drag, in V1), retype (`setCardKind`), rename (`$ext.editor.title`
  via `setCardExtNamespace`).
- **Formatting chrome (V1 = the selection anchor).** A marks selection popover over
  the active leaf (`strong`/`emph`/`underline`/`strike`/`code`/`link` + `anchor`),
  its keymap mirror, a touch accessory bar, and the input-rule shorthands. Tables
  and PM-model-driven island editing for content already present.
- **Diagnostics.** Three producers (`quill.validate`, `LiveSession.warnings`, render
  errors via `FieldRegion.field`) routed to a field address and shown inline;
  nothing gates — an incomplete document edits and renders fine.

## Out of scope

corpus↔PM (Phase 3); paint/geometry (Phase 2); document truth/mutators/`validate`
(quillmark); persistence, quill resolution, the editor|preview split shell (the
consumer / Phase 5). **Deferred past V1** (named, not silent): the *position*
formatting anchor — gutter insert affordance, its menu, the slash command, and
**authoring new tables/islands**. Editing an island already in an imported document
is in scope; authoring a new one is not.

## The flow

```
quill.schema ✕ Document.payload ──(join)──► card tree (Svelte, keyed by stable id)
   each corpus leaf ─► createField (Phase 3) ─► PM sub-doc ─► applyChange
   each scalar field ─► form control ─► quill.writer(doc).set(...)
   structure ─► insertCard / moveCard / setCardKind / removeCard
   validate + warnings + render errors ─► field address ─► inline diagnostic
```

## Settled decisions

- **Card-instance identity.** A session key in V1 (identity is the editor's
  concern), with a clean path to adopt a document `$id` if identity must survive
  storage round-trips — the write boundary is the same either way.
- **Group ordering source.** Read group order from the schema JSON's `ui.groups`
  when present, else first-appearance order. The typed `QuillCardUi` exposes
  only `title` while real quills carry `ui.groups` (the fixture's
  `main.ui.groups: [addressing, letterhead, classification, additional]`) — a
  recorded seam in the boundary ledger, and a candidate for widening the typed
  surface upstream.
- **Structural keymap.** Enter-at-end-of-body → add a card, Tab between fields —
  navigation crossing leaf boundaries no single PM keymap owns — is a shell
  keymap over `activeAddr` above the leaves.
- **Undo across leaves.** Per-leaf PM history; add a coordinating stack only if
  a document-level undo spanning a structural op plus a prose edit proves
  necessary.
- **Array/table convergence.** The `array`-of-`object` table control and the
  richtext table island stay separate citizens in V1; converge the affordance
  later.

## Exit criteria

- Full WYSIWYG edit of `usaf_memo`: every main field type edits (arrays reorder,
  the inline `subject` and body take prose, enums/dates/numbers commit), and
  `indorsement` cards add / reorder / delete / retype / rename over stable keys with
  no caret loss.
- Formatting popover + keymap + input rules produce correct `markOps`; diagnostics
  from all three producers surface inline against the right fields.
- Group sectioning and `compact` layout follow the fixture's `ui` hints.
- The editor emits `activeAddr` and caret moves (consumed by Phase 5's bridge).

## New dependencies

`prosemirror-tables`; `bits-ui` (already present) for the headless chrome. Pinned.

## Risks / watch-items

- Federation's whole point is deleting the prior art's whole-document serialize
  layer — resist any temptation to reintroduce a single spanning PM document or a
  markdown round-trip for the body.
- Stable-key resolution must happen **only** at the mutation boundary; keying Svelte
  loops on index reintroduces exactly the prior art's phantom-placeholder pain.
- Reconciliation is field-scoped (Phase 3's gate) — the editor holds optimistic PM
  state and re-hydrates one leaf on external change, never the whole tree.

## Implementation deviations (recorded)

- **Stable identity is a getter-backed `Addr`.** A prose leaf mounts once with an
  `Addr` whose `card` is a getter resolving `cardIndexOf(id)` at commit time, so a
  reorder is `moveCard` + a session-id splice — no remount, no lost caret. Cards
  key on a session id (`IdSeq`), resolved to an index only at the mutation boundary.
- **The formatting `anchor` button is deferred** ([quillmark-issues/0003](../quillmark-issues/0003-no-anchor-insert-command.md)):
  an anchor is a decoration, and `createField` exposes no verb to insert one at an
  arbitrary selection. The button renders disabled; the six formatting marks
  (`strong`/`em`/`underline`/`strike`/`code`/`link`) fully work via `toggleMark` →
  the codec's `markOps`. Consistent with the design's "revisit if comment-thread UX
  wants anchors in the document proper."
- **`number` fields use `type="text"`** — a native number input sanitizes an invalid
  string to `""` before JS sees it, hiding the commit-time coercion diagnostic; a
  non-parseable entry forwards the raw string so `writer.set`'s coercion is the judge.
- **Array-of-richtext elements commit by whole-array `writer.set`** (value semantics)
  — an element is not `applyChange`-addressable (`Addr.field` is a flat name), so
  each renders as a prose leaf but its commit replaces the whole array, dropping
  element-internal anchors per commit. Acceptable for inline references.
- **Diagnostics producers:** the editor runs `quill.validate` (empty for the valid
  fixture — no `!must_fill`) and constructs commit-time coercion errors at the
  `commitScalar` call site (the visible producer); `LiveSession.warnings` + render
  errors route in via a prop (Phase 5 supplies them). Card-path routing of
  `Diagnostic.path` is a best-effort grammar assumption (unverifiable against the
  fixture). Retype is a header control (degenerate for the single `indorsement` kind).
