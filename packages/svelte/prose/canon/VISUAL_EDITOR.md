# Visual Editor

> **Implementation**: `src/lib/visual/`

## TL;DR

The headline WYSIWYG surface over a Quillmark document: the card/field structure, the schema-driven fields, and prose-body editing, and how they compose into one editable tree. This doc owns the **composition**; the per-field content↔ProseMirror translation is [CODEC.md](CODEC.md), the rendered view and its caret bridge are [PREVIEW.md](PREVIEW.md), the live `Document` and WASM boundary are [DOCUMENT_MODEL.md](DOCUMENT_MODEL.md). Grounds on quillmark's document and schema model (canon: quillmark `CARDS.md`, `SCHEMAS.md`, `DOCUMENT_STORAGE.md`) and the WASM edit surface (`Document`, `quill.writer(doc)`, the addressed content verbs).

## Federated, not monolithic

The VisualEditor is a **thin composition layer** over many small editors, not one ProseMirror document spanning the page. The schema is the outline, a Svelte tree renders it, and each content leaf (a body, a `richtext`/`plaintext` field) is a separate sub-document with its own PM state, view, history, and plugins; scalar fields are plain form controls.

The content already stores a document as separate leaves at distinct addresses of distinct types: a card's body, its `intro` richtext field, its `signature_block` array are three `Addr`s carrying three value types. A single PM document would re-encode that schema tree as PM nodes and re-derive every address from tree position, paying a markdown serializer into library internals, a parser that patches token handlers, and a plain-text fallback that destroys structure on the next round-trip. Federation deletes that layer. The editor renders the schema directly and lets each leaf pick its editor by type; it owns structure, control selection, card operations, focus, command dispatch, and diagnostics routing, and delegates the substance (content↔PM to the [codec](CODEC.md), geometry to the [preview](PREVIEW.md), truth and mutators to the [document model](DOCUMENT_MODEL.md)).

## Structure mirrors the schema

The layout is a direct projection of `quill.schema` (`QuillSchema { main, card_kinds? }`, each a `CardSchema { fields, ui?, body? }`) joined against the live `Document`'s payload. The editor performs that schema × payload join itself: there is no engine projection for the editing surface (canon: `SCHEMAS.md`, the editor row of the projection table).

**A card is a list of fields**, rendered in **declaration order** (the `fields` map key order; order is not a `ui` hint), then a body. The body is the field-less content leaf (`Addr {card?}`, no `field`), gated by `body.enabled`. Metadata and body are **one abstraction**: a body is a richtext leaf, a `richtext` field is a richtext leaf, and both take the same prose-field editor and codec, differing only in address form (`{card}` vs `{card, field}`) and prominence. One field list, controls chosen by type: no metadata-vs-body dual mode.

**A control per field type** (canon: `SCHEMAS.md` field table). `richtext` is a multi-line prose leaf; with `inline: true`, a single-line one (constrained PM, [CODEC.md](CODEC.md) §Inline mode). `plaintext` (± `inline`) is a prose leaf with marks and islands suppressed. `string` is a text input, `enum` a select over `values:`, `number`/`integer` a numeric input, `boolean` a toggle, `datetime` a date control. `array` is an add/remove repeater: elements hold declaration/entry order, no reorder control (see [VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md) §"Array fields"); an `object`-element array commits each element as minimal JSON in V1, not a typed table (does not ship in V1, §"Settled and open"). `object` is a nested subform over `properties`, **scalar properties only** in V1: a nested `prose`/`array`/`object` property shows a "not editable in V1" placeholder rather than recursing. The text-ish types are the model's data-vs-content × open/plain-vs-formatted 2×2 (`enum`/`string` are form controls, `plaintext`/`richtext` prose leaves), and only the content side reaches the codec.

`ui` hints drive layout, not structure: `ui.group` sections fields, `ui.compact` packs a field onto a shared row, `ui.multiline` sizes a leaf, field `ui.title` labels it. Card `ui.title` is the header (a literal or a `{field}` template interpolated with live values), overridden per instance by `$ext.editor.title` (canon: `CARDS.md`).

**The editor projects the commitment ladder.** Per field: show the authored value; else ghost the `default:` as placeholder (never written back; it lives in the schema). A no-`default:` field is **required** (Unendorsed: its seed carries a `!must_fill` marker; no separate `required` axis, canon `DOCUMENT_MODEL.md`): the label shows a persistent `*`, complementary to the ghost since a required field has no default to ghost. An unfilled marker still surfaces as a routed `validate()` warning (§Diagnostics): the `*` states required-ness, the warning reports unmet-ness. A field's `description:` rides its label as a tooltip; `example:` reaches the editor only through the seed cascade (§"Card operations"). Guidance is per-field **or** document-level, never a third thing hanging off a field: no field carries a tips surface of its own, and document-level hints ride the `$ext.editor.tips` card instead (§"Card operations"): a chrome channel, not a schema key, so it makes no claim about any one field (VISUAL_EDITOR_UIUX §Fields, §"Tips card"). Nothing gates: an incomplete document edits and renders fine (canon: `SCHEMAS.md` zero-fill render). Completeness is a read of `quill.validate(doc)`, not a gate.

**Clearing a scalar unsets it.** A blank number / text / date / enum control commits `undefined`; the VisualEditor lowers that to `doc.removeField(addr)` (the quill-free store lane: an unset writes no value, so no schema lane applies), never a write. An absent field resolves authored › `default:` › zero-fill at render (canon `SCHEMAS.md`), so the ghosted `default:` takes effect and the ghost is truthful, not a snapshot. Committing the default instead would freeze a value against later schema changes: the engine never persists a default, nor does the editor. `EnumField` gives unset a ghost sentinel option: picking it unsets, picking any value (the default included) writes, so "commit the default" is expressible and shown-never-written stays visible. `DateField` prints the default's digits in its empty segments, ghost-toned, rather than the primitive's `mm`/`dd`/`yyyy` hints: a format hint reads "empty" where the rung says "will render 2026-01-01". It paints the ghost into the segment text over an unset primitive, never into its `value`: a defaulted value would be indistinguishable from an authored one to everything that reads the control. `BooleanField` is exempt (a checkbox has no blank). Unset, and every numeric commit, settles at `change` (blur/Enter): a per-keystroke commit round-trips transient invalid prefixes (`-`, `1.`) through the boundary and flashes a coercion diagnostic the `role="status"` live region announces. Text keeps live commit but defers its clear to `change`: an instant unset would flash the field through its default mid-retype (select-all → type). Trade-off: an explicit empty string OVER a non-empty default is inexpressible from the UI; clear and unset collapse to one gesture.

## The address is the spine

Every editable unit is keyed by an address: a content leaf by `Addr {card?, field?}`, a scalar by its `{card?, field}` path, a card by position. One identifier is what `applyChange` targets, what the preview bridge speaks (`ContentHit.field`, `FieldRegion.field`), what a diagnostic routes to, and what Svelte keys the tree on.

But cards are **positional** in the content (`cards[i]`): index-keyed loops, stale-index write guards, reused-component reconciliation, phantom placeholders. So the VisualEditor keys each card *instance* by a **session key** and resolves that key to an index only at the mutation boundary (`moveCard`, `applyChange(addr)`). A reorder is a `moveCard` plus a key reorder; no leaf remounts, no PM instance is re-fed a swapped document, no caret is lost to a swap.

**The key leaves the editor.** No address survives a reorder — `Addr` and `DocPath` are both positional, so a host holding `cards.indorsement[2].from` names a different card after one `moveCard` and is told nothing — so every payload naming a card carries its `cardId` beside the address it already carries: `EditorChange`, and the active leaf. `'main'` is the main card's key, the same token the leaf-key space already spends. A removal carries the key with no address: the index is meaningless once the card is gone, and the key is the only handle left to drop. The tips dismissal carries neither; it is document-level chrome that rides `main`'s `$ext` and names no card.

The parallel array is not a workaround. With no card handle in the document, `cardIds` is not a cache of a document-side truth — it **is** the identity, and there is nothing to reconcile it against. So the editor **owns structural mutation for the session**: the keys track the inserts, moves and removals it performs, and a host that mutates the card array behind it re-seeds the surface rather than expecting the keys to follow. A `cardId` is session-scoped by construction: it does not survive a reload, and a host persisting one is persisting a session key.

### One vocabulary in the hooks

**Paths for places, indexes for structure ops.** Every hook naming a place speaks the canonical `DocPath`: `onCaretMove`'s `Place`, `EditorChange.path`, the active leaf's `field`. It is the grammar `Diagnostic.path`, `ContentHit.field`, `FieldRegion.field` and `session.regions()` already key on, so a host wires the editor to the preview as a pass-through and routes a diagnostic back with the string it was given. `Addr` stays the MUTATOR currency — the document verbs take it, the card verbs take indexes — and `enumOptionAllowed` keeps its `Addr` because it runs per option per derive, where minting a path is a string mint on an address that has one for free.

`/core`'s `fieldPathForAddr` / `cardPath` / `addrForFieldPath` are the hop between the two, public and beside the grammar they speak. `addrForFieldPath` is also the ONE parse: the diagnostics router reads it rather than keeping a second copy of the walk.

A structure op's path names the CARD (`cards.<kind>[i]`), not the body leaf inside it: the change is the card. It is minted after the mutation, since an insert's card does not exist in the previous tree and a retype's kind is the previous kind.

**Path-only was probed against struct and lost.** A hook could carry a bare `DocPath` and nothing else; the cost measured was the sites that parse an index back out. Written both ways over the four things a host does with these signals — recompile, pin an annotation, highlight the active card, scroll a positional list — path-only saves nothing at the site it was supposed to: the struct carries the path too, so `parseDocPath` is one call under either shape. It loses at the other: an outline highlighting the active card reads `cardId` directly under the struct, and under path-only parses a path for an index that is wrong after the next reorder, which is the trap `cardId` exists to close. A shape that is never cheaper and sometimes wrong is not a trade-off.

## Edits are ops to the live Document

The VisualEditor holds the live `Document` (via `DocumentWriter = quill.writer(doc)`) and writes ops at an address: never a markdown string, never a whole-document re-serialize:

- **prose leaf** → the codec lowers each PM transaction to a `ChangeBundle` and calls `doc.applyChange(addr, bundle)` ([CODEC.md](CODEC.md)): the per-keystroke path; anchors rebase. The typed writer's markdown-import `setBody` is *not* it.
- **scalar / array / object** → the typed writer: `writer.set(name, value)`, or `writer.card(i).set(...)`. Schema-checked; an undeclared name throws.
- **structure** → `insertCard` / `removeCard` / `moveCard` / `setCardKind`.

Reconciliation is field-scoped. The editor holds its optimistic PM state and re-hydrates a leaf only on an **external** content change (a paste, a `revise`, another edit source), gated by canonical-content equality scoped to that leaf ([CODEC.md](CODEC.md) §Reconciliation). Caret continuity across the editor's *own* edits is the leaf's PM `StepMap`, not a re-hydrate.

**All three lanes report through `onChange`**, carrying an `EditorChange` whose `source` names which one. That the three exist at all is an implementation fact (a prose leaf commits itself and must NOT bump `revision`, since a re-derive would remount every leaf and cost the caret on every keystroke); that a host has to know it is not. A host recompiling off `onChange` covers prose, scalars and structure with one hook, and reads `source` only to schedule them differently: a structure op happens once per gesture and applies at once, prose and field edits arrive per keystroke and debounce.

`onCaretMove` is the *selection* signal, not a second change signal: it fires on a bare arrow key. The two are separate hooks precisely so following the caret and recompiling are not the same subscription.

**A richtext field has two stored shapes, and the leaf's read is where they meet.** `doc.getStored` is verbatim: a document the editor seeded holds `Content` (what `install`/`applyChange` write), and a document a consumer LOADED (`Document.fromMarkdown`) holds the markdown STRING it parsed, since nothing has lowered it yet. A body is `Content` either way. The leaf lifts a string through `importMarkdown` on read (`field.ts`, `readLeaf`); the first commit writes `Content` back, so the string shape is transient and appears on no other path.

## Card operations

- **Add**: pick the kind (a transient menu, skipped when the quill declares one kind), then `quill.seedCard(kind, doc.main.seed?.[kind])` → `insertCard(index, card)` in one mutation. No placeholder card exists before it is real; the seed cascade is `$seed` overlay › `example:` › absent (canon: `CARDS.md`).
- **Reorder / delete**: `moveCard` / `removeCard`, over stable keys.
- **Retype**: `setCardKind`; the field list re-projects, kept fields keep their content.
- **Rename**: `$ext.editor.title`, editor state that never reaches the backend (canon: `CARDS.md`).
- **Tips**: `$ext.editor.tips` on `main`, a sibling key of `title` in the same namespace: a list of authoring hints a quill or consumer **seeds**, which the editor renders as a dismissable card and never adds to. It is **document-level**, so the channel is `model.tips` at the derive's root, not a field on every card, and it renders in a fixed slot attached under `main` (VISUAL_EDITOR_UIUX §"Tips card"). Dismissal clears it. Never gates, never renders to the backend, absent when the channel is empty.

**The `editor` namespace is the write unit, and one verb owns it.** Because `storeExtNamespace` REPLACES the namespace it targets (preserving sibling namespaces, not sibling keys), a writer that stores only its own key destroys the others, silently. Both writers therefore go through `patchEditorExt(doc, addr, patch)` (`ext.ts`), which merges and treats an `undefined` value as a key drop; a consumer seeding the namespace reaches the same verb off `@quillmark/svelte/visual`. That is what keeps a dismissal from wiping every renamed card's title, and what makes key N+1 inherit the rule instead of re-deriving it.

## Focus and the preview bridge

**One active leaf holds the caret.** The VisualEditor owns the active address; because leaves are keyed by stable identity, this is plain state, not a value hoisted to a parent to survive remounts. It reports it as an `ActiveLeaf` — the leaf's `DocPath` and its card's session key — which is the pair `getActiveLeaf` reaches the controller by. Both directions ([PREVIEW.md](PREVIEW.md) §Click bridge):

- **preview → editor**: `visualEditor.setCaret(hit)` resolves `hit.field` to a leaf, which runs `codec.usvToPM(hit.pos)` and sets its PM caret; a `'segment'` hit just focuses the leaf (`hit.pos` is a segment start, not a cluster-exact caret). It reveals first and awaits the render before landing, so it is the one async entry point (VISUAL_EDITOR_UIUX §"Editor↔preview").
- **editor → preview**: a caret move in the active leaf emits `onCaretMove(at)` with a `Place` (`/core`): the canonical `DocPath` field address and the USV caret, which is `preview.focusPosition`'s own argument, so the hop is `onCaretMove={preview.focusPosition}` and translates nothing. The editor mints the path off its DERIVED card tree, which already holds every kind, so following the caret costs no `doc.cards` read per keystroke (`doc.cards` serializes every card on each read). The USV `pos` is the shared coordinate: no codec hop.

## Teardown

One order, held by every surface: **unregister, cancel, then free**. Nothing new resolves through a surface on its way out, the work already scheduled is dropped before what it would have touched, and what both were holding is released last. `core/teardown.ts` carries it as a `Lifespan`: a surface builds one, registers its cancellers in the order they must run, and ends the span once, rather than writing the sequence out at each exit.

Deferred work is why it is an order at all. Three sites cross an `await tick()` — `setCaret` (reveal, flush, then land the caret in a leaf it looked up before it), `scrollCardIntoView` (flush, then resolve an id and scroll a card), and an array field's post-commit focus — and a destroy landing in that window leaves a continuation acting on a surface that is gone. Not a use-after-free: past the flush each touches a captured controller and the DOM, and a selection-only transaction never routes to a commit, so no handle is reached. What it is, is a dispatch into a destroyed ProseMirror view, or an export called on a destroyed component: a throw in a continuation nobody catches. Each site asks `span.resumes(tick())` and drops out, rather than checking a flag it captured before the await.

A document swap arrives as a destroy (leaves and card ids seed once, so a swap remounts), which is what makes one span cover both. Coalescing a surface already does sits inside it and answers a different question: `scrollCardIntoView`'s single pending id says whether this continuation is still the current one, the span says whether there is still a surface to act on.

## The document swap

`VisualEditor` is a door over `VisualEditorInner`, and the door's whole content is `{#key doc}`: a consumer hands it a different document and the editor remounts under it. The split exists because the state a swap invalidates is not one field. Composable cards key on session id and would re-mount unprompted, the main card is keyed on nothing, and each prose leaf mounts once per stable leaf key with `createField` closing over the `doc` it was handed — so an unkeyed swap leaves the main card rendering and committing to the previous document with every id and index still agreeing. Reseeding by hand means threading a generation token through every leaf key and resetting the id state, the commit-error map, the active address, the leaf registry, the card refs and any pending scroll, which is a remount written out one field at a time. The `{#key}` writes it once.

`quill` is deliberately outside the key: the schema is re-read on every derive, so a quill swap re-projects correctly and keying on it would discard a card tree that needed no rebuilding. What a re-derive cannot do is re-mount the leaves, so a quill swapped without its document reports `rebind-ignored` at `dev` severity. `Preview` reports the same code for `session`, which it cannot re-key on at all: the paint loop owns scroll position, mounted slots and an observer set that a remount would discard on every apply, so that swap stays the consumer's `{#key session}` and the guard is what stops it being silent.

## Chrome

Editing chrome is thin and **per-leaf**; structural chrome is Svelte in the shell.

- **Formatting**: a selection toolbar over the active leaf in the content mark vocabulary (`strong`/`emph`/`underline`/`strike`/`code`/`link`, plus `anchor` identity), emitting PM transactions the codec lowers to `markOps`. A keymap mirrors the core marks (`Mod-b`/`i`/`u`); `strike`/`code`/`link` are toolbar-only in V1.
- **Input rules**: the markdown shorthands (`**`, `*`, `~~`, `` ` ``, `# `, `- `, `1. `, `> `, and a ` ``` ` code fence) are PM input rules producing ordinary transactions; markdown is an input *shorthand*, never the stored form. No table-entry rule (island authoring does not ship). `- ` / `1. ` are the only way to START a list: there is no toggle command and no toolbar affordance, so they normalize a heading they wrap, and `# ` declines inside an item: `list_item` is `block+`, making `list_item > heading` representable and unrenderable.
- **Structural keys**: a body leaf's keymap, composed in `codec/keymap.ts` as one *chain* per key, innermost surface first. The list link (`codec/lists.ts`): `Tab` / `Shift-Tab` change an item's nesting depth, `Enter` splits an item, exits an empty one (one level per press), and opens a paragraph above a list's first item, `Backspace` at an item's start merges into the previous item or lifts at the list's start. The `code_block` link ahead of it (`codec/code.ts`): `Tab` / `Shift-Tab` are literal indentation (two spaces, since the stored text is what the preview typesets, and outdent takes a tab or partial spaces too because imported content carries either), and `Enter` is a newline. An island's cell traversal is the third link, when it lands. **Tab forks on the leaf's role, not the caret's position.** An inline/plaintext leaf is a form field: Tab stays unbound, so field navigation is open for a shell keymap. A body is a document: Tab is structural. Outside every link the key is not swallowed, leaving the body a keyboard exit. Cleanup is command-local (the primitives join the boundary they open); a global pass would fuse adjacent same-type lists, and an ordinal decrease is how `Content` marks that boundary.
- **Tables / islands**: driven from the PM model (a `CellSelection`, decorations), not reconstructed from DOM geometry. An island is one PM leaf node over one content `U+FFFC` slot ([CODEC.md](CODEC.md) §Islands).
- **Structure**: add-card affordance, headers, move/delete/retype controls, group sections, over the document mutators.

## Diagnostics

Three sources, each routed to a field address and shown inline: `quill.validate(doc)` (`Diagnostic[]` keyed on a canonical `DocPath` `.path`: type errors fatal, `must_fill` a soft warning), `LiveSession.warnings`, and render errors mapped through `FieldRegion.field`. Routing runs on the boundary's `parseDocPath` (`diagnostics.ts`), resolving the absolute card index to the editor's stable-id keying; a local commit error is keyed at its known call-site address and carries the thrown diagnostic's `code` (0.96 mutator failures carry one). `must_fill` and present-null never gate; a value that fails coercion is the only hard field error (canon: `SCHEMAS.md`).

**What a diagnostic SAYS is the consumer's, up to a permanent residue.** `formatDiagnostic(d)` turns a boundary `Diagnostic` into the text under its field; returning `undefined` renders `d.message` unchanged. The formatter reads the whole `Diagnostic`, so what it can re-word tracks what that type carries per lane. **Validation** (`enum_violation`, `type_mismatch`, `format_violation`, `must_fill`): the CONSTRAINT re-words from the quill's schema at `path`, the offending VALUE does not. Validation runs post-coercion, so the value the validator saw is the coerced one while the document at `path` holds the authored one, and a consumer reading it back words a sentence about a spelling the user never typed. **Edit** (`field_conform`): re-words by a third route, the refused value sitting in neither document (unchanged on throw) nor schema but in the app's own control state, which the app has because it attempted the write. **Parse** (`yaml_error_with_location`, `invalid_structure`): does not re-word. No `path`, no `location`, and the line, column, offending key and snippet all inside the English message. **Render** (`LiveSession.warnings`): does not re-word. Backend text the editor already treats as an external feed.

The residue is a property of the boundary rather than a gap in it: a backend's compile diagnostics are minted from that backend's own message text, an open set no string table can key, and the parse lane's parameters are engine prose that structuring would launder rather than expose. So the contract is that a product localizes what it can route and the built-in text stands where it cannot. The fallback arm is load-bearing rather than defensive, and `Diagnostic.code` being optional at this pin makes it reachable by type: a formatter switching on `code` hits its default arm on a real payload, not only in principle.

**A diagnostic's displayed text is `message` or the formatter's replacement, and nothing beside it.** `code`, `path`, `hint`, `location` and `sourceChain` route, count and log; none of them renders. `hint` is the tail of the message it accompanies, so rendering it next to a formatter's replacement ships a two-language diagnostic: a surface that wants a hint puts it through the same formatter and falls back wholesale with it.

**Diagnostics are not the error channel** (`core/errors.ts`). A `Diagnostic` is about the DOCUMENT and draws on the field it belongs to; an `EditorError` is about the SURFACE and draws nowhere: a commit the boundary refused, a card operation that threw, a `validate`/`resolve` that threw, a prose commit that fell back. Every one of them is a path the surface already RECOVERED from, so nothing gates on the handler and an absent handler still logs; the hook exists because a `console.error` is not something an app can route, filter or count. A refused scalar commit produces both, deliberately: the diagnostic pins to the field, the error reaches the sink.

## What the surface says

Every built-in string is a key on `strings`, partial: unset keys take the package's English, so wording is an override rather than a fork. It covers the card controls, the add trigger, the array control, the required marker, the formatting popover and its link prompt, the tips card, the unknown-kind recovery shell and the empty body's ghost. Several are ACCESSIBLE NAMES rather than decoration — an untranslated card control does not read as inconsistent to a screen reader, it reads as the wrong language, which is why this is a seam and not a list of literals to grep for. `bodyPlaceholder` is a key inside the set rather than a prop beside it: the per-kind hook and the flat string it falls back to are one decision.

The strings reach the tree through **context**, not props. They are ambient, read-only and wanted eight components deep, so threading them by hand would put a `strings` prop on every component between the root and each leaf that means nothing to any of them. The channel exposes getters, so a consumer swapping locale mid-session re-renders rather than freezing the wording at mount; a component rendered off-tree falls to the package's English and still has every key.

`Preview` carries its own three-key set for the message states it shows when there is nothing to paint. Separate from the editor's rather than pooled: `/preview` reaches `/core` and nothing editor-side, and a shared strings module would be an edge back across the line that lets it promote to its own package.

## Surface

Two layers, per [ARCHITECTURE.md](ARCHITECTURE.md): the prose leaf is the vanilla-TS core seam, the composition is Svelte chrome.

```ts
// core: one prose leaf; owns the codec, the PM view, and its plugin stack.
function createField(opts: {
  doc: Document;
  addr: Addr; // {card?, field?}; field-less = a body
  container: HTMLElement;
  inline?: boolean; // one-textblock schema (a richtext(inline) field)
  plaintext?: boolean; // inline + marks/islands stripped
  label?: string; // aria-label on the contenteditable
  onFocus?(addr: Addr): void;
  onCaretMove?(addr: Addr, pos: number): void; // an edit OR a bare selection move
  onChange?(addr: Addr): void; // a commit that LANDED: the change signal
  onError?: EditorErrorHandler; // a commit the boundary refused (recovered)
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
  onActiveLeafChange={({ field, cardId }) => …}
  onCaretMove={preview.focusPosition}
  onChange={(change) => change.source === 'structure' ? recompileNow() : schedule()}
  onError={(err) => …}
/>
<!-- bridge in: visualEditor.setCaret(hit) from preview.onCaretPick -->
```

The instance surface, reached by that `bind:this`:

```ts
setCaret(hit: ContentHit): Promise<void>;      // preview → editor
getActiveLeaf(): FieldController | undefined;  // the popover's observation seam
focusField(field: DocPath): Promise<void>;     // reveal + focus, no caret placed
insertCard(kind: string, at?: number): CardId | undefined;  // the new card's key
removeCard(cardId: CardId): void;
moveCard(cardId: CardId, dir: -1 | 1): void;   // one slot; a no-op at either edge
setKind(cardId: CardId, kind: string): void;
```

**The verbs are the card header's own, and the door is the point.** A host toolbar, command palette or shortcut wants what the chrome has, and every call reports through `onChange` exactly as the click does, so a host that recompiles off the hook needs no second path for its own gestures. They speak the public vocabulary — a `CardId` for a card, a `DocPath` for a place — so a host drives them with what the hooks handed it, and a `bind:this` held across a document swap keeps working: the door delegates to the live mount, so a call landing between a swap and the incoming mount is a no-op.

A target the surface does not hold — a `cardId` from a previous session or an already-removed card, a path naming no mounted leaf — is a no-op reporting `target-unknown` at `dev`. The chrome cannot mint a bad one, so it only ever fires on a host.

## Not owned

- content↔PM, the position map, mark/island translation: the codec's ([CODEC.md](CODEC.md)).
- paint, page geometry, caret rects, click→content: the preview's ([PREVIEW.md](PREVIEW.md)).
- document truth, mutators, `validate`, the WASM boundary: the document model's ([DOCUMENT_MODEL.md](DOCUMENT_MODEL.md)).
- persistence, autosave, quill resolution, the editor|preview split shell: the consumer's (the playground wires them; [ARCHITECTURE.md](ARCHITECTURE.md)).

## Settled and open

- **Card-instance identity is a session key**: an in-memory id per card, reordered in lockstep with the content and resolved to an index only at the mutation boundary (`structure.ts` `IdSeq`). Identity is the editor's, not the document's: nothing document-side backs it, and it does not survive a reload. It rides every card-naming payload (§"The address is the spine"), so the reorder trap is a host's to fall into only by ignoring it.
- **Layout is `ui`-driven**: `ui.group` sections, `ui.compact` packs a shared row (`structure.ts`); the editor adds no responsive policy of its own.
- **Undo is per-leaf**: each prose leaf carries its own PM history. A document-level undo spanning a structural op plus a prose edit (a coordinating stack above the leaves) does not ship in V1.
- **Array/table convergence**: how far the `array`-of-`object` table control converges with the richtext table island (a scalar array field vs a body island, similar affordance) is not carried in V1.
- **Structural keymap**: Enter-at-end-of-body to add a card, Tab between fields: navigation crossing leaf boundaries no single PM keymap owns. Does not ship in V1; it lands as a shell keymap over `activeAddr`, alongside the insert surface (VISUAL_EDITOR_UIUX §Open). Tab is already taken inside a body (§Chrome, "List keys"), so field navigation reaches the inline/plaintext leaves and the body's unhandled Tab; what a body's keyboard exit should be (Escape blurs to the shell is the candidate, and it contends with the format popover's close and the card rename's revert) settles here rather than in the leaf.
