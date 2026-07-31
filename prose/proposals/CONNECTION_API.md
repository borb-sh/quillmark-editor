# The Connection API

> **Status**: proposal, not canon. Nothing here is built. Canon describes what is, so this lives outside `prose/canon/` until it ships, at which point it is deleted and `ARCHITECTURE`, `VISUAL_EDITOR`, `PREVIEW` and `DOCUMENT_MODEL` carry it.

## TL;DR

Three surfaces over one session need the same four hops — an edit lands, the session recompiles, the preview repaints what moved and the mirror re-serializes, and each caret crosses to the other surface — and the package makes every consumer write all four. **A connection object owns them, and the surfaces register into it.** That is the load-bearing change. Around it sit five smaller ones: one address vocabulary in the hooks, stable card identity in the public payloads, an internal re-key that retires the remount contract, the editor's verbs reachable from outside a card header, and a severity on the error channel.

The consumer keeps the handles. A convenience constructor exists for the six lines that open them, and is not the only door.

## What a consumer writes today

The reference shell is `src/routes/editor/+page.svelte`: an open sequence, a debounced recompile, a repaint, a re-serialize, two caret hops, and a handler that reads `doc.cards.map(c => c.kind)` on the keystroke path because the bridge's signature asks for it. Three of those hops are load-bearing and undocumented as such:

- **A prose edit emits no change signal.** `bump()` is the only `onChange` caller and every call site is a scalar or structure mutation; a prose commit lowers through `core/codec/field.ts` and reports only `onCaretMove`. A consumer wiring the two as the README does gets a preview that never updates while typing.
- **`onCaretMove` fires on every transaction**, so the shell that corrects for that recompiles on every arrow key.
- **All three surfaces bind their handle in `onMount`** and ignore a later prop change. The documented fix is `{#key doc}`; nothing raises when it is missing.

Each has a one-site fix, and those fixes are not the interesting part. The interesting part is that all three are **shell-layer facts the package declines to own**, so every consumer rediscovers them.

## The connection

```ts
import { connect } from '@quillmark/editor';

const link = connect({ session, doc, caret: true });
```

```svelte
<VisualEditor {doc} {quill} {link} />
<Preview {session} {link} />
<SourceView {doc} {link} />
```

Each surface **registers itself** with the connection on mount and unregisters on destroy. The connection owns the recompile schedule, the repaint, the re-serialize, and — when `caret` is on — the two caret hops. Nothing else changes: the consumer holds the handles, passes them as it does today, and adds one prop.

```ts
interface Connection {
	/** Recompile now, dropping a pending one. Idempotent: an apply whose document
	 *  revision has not moved is skipped. */
	flush(): void;
	/** Schedule a recompile. What a consumer calls after mutating the document
	 *  itself — an import, an undo, its own card verb. */
	touch(source?: ChangeSource): void;
	/** The registered editor, for a host driving its own chrome. Undefined until
	 *  one mounts. */
	readonly editor: EditorHandle | undefined;
	/** Unregister everything and drop pending work. Does not free handles. */
	destroy(): void;
}
```

This is the spike's `connect()` with its shape defect removed. That version hands back `editorProps` / `previewProps` to spread, requires three `bind:this` refs, and requires **getters** over them — a paragraph of JSDoc explaining why, because the first version bound into a framework proxy and silently wired nothing. Registration inverts all three: the surface knows when it exists, so it says so.

**Cardinality is stated, not assumed.** One connection carries **one editor and any number of previews**: a thumbnail rail beside a main preview is an ordinary layout, and every registered preview takes `refresh`. A second editor registering is a `dev` error and does not win the caret bridge. `VisualEditor` already contemplates two editors on a page (its DOM-id prefixing exists for exactly that), so the answer has to be stated rather than left to whoever mounts first.

**Caret coupling is opt-in**, `caret: false` by default. `VISUAL_EDITOR_UIUX` §"Editor↔preview" makes it opt-in because a preview click moves focus and scrolls the editor; a host embedding Preview as passive output should not acquire that by upgrading. The headline README recipe passes `caret: true`.

**Registration does not make the connection reactive.** It is a plain vanilla emitter; each surface subscribes in its mount effect and unsubscribes on teardown, five lines apiece, inside the package. A rune-backed session would be the alternative, and it would put framework state in the framework-free tier `ARCHITECTURE` §"Core vs chrome" promises, which is the tier a non-Svelte consumer wraps.

**A verb that runs before its surface exists is a no-op that says so.** `link.editor` is `undefined` until an editor registers — the playground itself mounts `VisualEditor` behind a dynamic import, so the window is real, not theoretical — and every connection verb reports through `onError` at `dev` severity rather than failing quietly. The failure mode the spike's `bind:this` trap taught is not solved by hiding the timing; it is solved by making the gap observable.

### Opening, as a convenience and not a doctrine

```ts
const { quill, doc, session, link, destroy } = await openEditor({
	quill: tree, // Map<string, Uint8Array> | Quill
	document: markdown, // string | Document | undefined → quill.seedDocument()
	engine, // an Engine to share; one is minted if absent
	caret: true
});
```

`openEditor` is `init()` + `Quill.fromTree` + seed-or-parse + `engine.open` + `connect`, in order, with the failing step named on a throw. It is sugar over five calls a consumer can still make itself, and it is worth shipping for one reason: five independent cold-consumer probes concluded there was **no way to open an existing document**, because the load path is `Document.fromMarkdown` and nothing pointed at it. A named door is how a door gets found.

Two rules keep it honest. It **frees only what it minted**: hand it a `Quill` and `destroy()` leaves it alone, since a host may share one across sessions. It takes an **`engine`**, because `Engine` lazily loads and caches a backend per instance and a host with two documents open should pay that once.

What it does not claim: that teardown was the problem. The bindings ship `--weak-refs`, so `free()` is an eager option rather than a requirement, and the earlier review already withdrew teardown as a finding. And `openEditor` is still async and client-only, so a SvelteKit host still writes the `$state` + `{#if}` mount dance. The win is a findable load path and one call instead of five, not the disappearance of ceremony.

## Recompile, honestly

The connection debounces prose and scalar bursts by `debounce` (120ms) and applies a structure op at once. Every apply is **gated on `doc.revision`** — upstream's monotonic per-handle counter — and skipped when it has not moved.

That gate is **insurance, not the feature**. Once `onChange` covers all three lanes (the change-signal fix, which lands independently), every scheduled apply follows a real commit and the gate skips nothing in the steady state. What it buys is that `touch()` is free to call defensively, a future mutator that forgets to signal degrades to a delayed repaint rather than a stale preview, and a host that batches its own edits can call `touch()` per edit without counting.

It does **not** buy repaint-without-signalling. Nothing polls the counter, so a consumer mutating `doc` directly must still call `touch()` — the same obligation `flush()` carries today, and worth stating plainly rather than implying the counter removes it.

It also depends on a `@quillmark/wasm` release carrying `revision`. Until that pin moves, the connection applies unconditionally and the gate is a one-line addition later. Nothing else here waits on upstream.

## One address vocabulary in public

Canonical `DocPath` strings, everywhere a hook names a place:

```ts
interface Place {
	/** `main.subject` / `main.body` / `cards.<kind>[i].<field>`. */
	field: DocPath;
	/** The caret in USV. */
	pos: number;
}
```

Declared **once**, in `/core`. `Diagnostic.path`, `ContentHit.field` and `FieldRegion.field` already speak this grammar; the editor's hooks speak `Addr` and `fieldPathForAddr(addr, kinds)` is the toll at the boundary between them. Emitting both addressings in every payload removes the toll and keeps both vocabularies, which is the patch rather than the design. Declaring the same shape structurally in `/preview` and `/visual` to avoid an import buys nothing either: both modules already import `/core`, and two names for one type is drift with nothing to catch it.

The slogan is **paths for places, indexes for structure ops**. `Addr` stays exported from `/core` — it is the mutator currency for a consumer driving `doc.applyChange` directly — with `addrForPath` / `pathForAddr` beside it. Card verbs take indices. `enumOptionAllowed` keeps its `Addr`: it is called per option per derive, and formatting a path there is a string mint on a path that has one for free.

## Stable identity in the public vocabulary

Nothing either review named: **no public payload survives a reorder.** `Addr` and `DocPath` are both positional, so a host that remembers "last active field: `cards.indorsement[2].from`" is silently wrong after one `moveCard`. The stable handle exists — the editor's session ids internally, `$id` and `doc.cardIndexById` at the boundary — and appears in no hook.

So: **the editor mints `$id` on insert and resolves through `cardIndexById`**, and every payload that names a card carries `cardId` beside `path`.

This deletes the parallel id array (`IdSeq`, `cardIds`, and the index resolution at every mutation boundary) rather than adding to it, and it retires the desync a consumer's own `doc.insertCard` causes, because there is no second source of identity left to fall out of step. The rejected alternative was reconciling the id array against the document by length and kind: with two cards of one kind and an external insert it cannot say which existing id maps where, and mis-pinning is worse than shifting because the commit-error map and the active address are both id-keyed. The reconcile would also run on a derive that an external mutation never triggers.

The cost is real and belongs to the document: ids enter the persisted bytes, and a counter is history-dependent, so two documents reaching identical content differ. Upstream canon makes `$id` caller-minted and opt-in for exactly that reason. `cardIds: 'persist' | 'session'` is the dial, and `persist` is the default an editor wants.

## Swapping the document, without a session

`VisualEditor` observes its own `doc` prop identity and re-keys internally. No new object, no new protocol, and it works for all three surfaces today.

It has to be an internal `{#key}`, not a reseed: the composable cards key on session id, but the **main card is not keyed at all**, and inside every card the prose leaves mount once per stable leaf key with `createField` closing over the `doc` handle. After an in-place swap, `main:subject`'s key is unchanged, its leaf never remounts, and every main-card leaf commits to the previous handle. Reseeding by hand means threading a generation token through every leaf key and resetting the id array, the commit-error map, the active address, the leaf registry, the card refs, and any pending scroll — which is a remount, spelled out. Spell it as one.

The `rebind` dev error stays. A prop the surface ignores is still reachable — `session` on `<Preview>`, `link` on any of them — so the identity guard covers what the re-key does not.

## The verbs are reachable from outside

The editor exposes its own verbs as component instance exports, beside the `setCaret` and `getActiveLeaf` that already are:

```ts
interface EditorHandle {
	setCaret(at: Place): void;
	focusField(path: DocPath): void;
	insertCard(card: CardInput, after?: number): void;
	removeCard(index: number): void;
	moveCard(from: number, to: number): void;
	setKind(index: number, kind: string): void;
}
```

`bind:this` reaches them with zero new machinery, and `link.editor` reaches them without a ref. The editor owns card identity, so a consumer calling `doc.insertCard` behind it desyncs today; with `$id` above, that stops being a correctness trap and stays a convenience gap — a host toolbar, a command palette, or a keyboard shortcut in the shell wants the same door the card-header snippet gets.

`cardActions` and its `CardContext` stay as the spike shaped them, carrying `{ path, cardId, kind, index, isMain }` and the three bound verbs.

## Teardown and in-flight work

Named by neither review, and a real race today: `setCaret` awaits a `tick()` and then touches leaves, and card scrolling does the same. A `free()` — or `destroy()`, or a document swap — landing in that window touches a freed handle. Today it is the consumer's problem by accident. The protocol is one order, stated once and held by every surface: **unregister, cancel pending timers and awaited ticks, then free.** `destroy()` on the connection does the first two and frees nothing; `openEditor`'s `destroy` does all three for what it minted.

## Errors and wording

`onError` stays **per surface**, because a preview-only consumer — the audience the reserved `@quillmark/preview` promotion exists for — has no connection in their world and still needs the hook. The connection supplies a default to every surface that registers, so a consumer wires it once and a standalone surface wires its own. That is the honest claim: the replication lives in the implementation, where it is unavoidable, and not in the consumer's hands.

Same for wording. One `QuillmarkStrings` on the connection, namespaced by surface, delivered by context; a standalone `createPreview` keeps its own `strings`. The preview's message states keep the spike's shape entirely — the core draws a default, `onState` reports it, and passing a `message` snippet to `<Preview>` suppresses the built-in without the consumer touching a boolean. A vanilla core that drew nothing by default would hand the share-page and CI audience a blank container on empty, unsupported, and error alike.

```ts
interface EditorError {
	code: EditorErrorCode;
	severity: 'error' | 'dev';
	message: string;
	cause?: unknown;
	path?: DocPath;
	cardId?: string;
	page?: number;
}
```

`severity` separates a paint failure an app routes to telemetry from a contract violation aimed at the developer building against the package. Without it every consumer's sink filters the dev codes by hand.

**Diagnostics remain the hole.** A product that overrides every string key still shows every validation error, commit refusal and parse warning in English, because `Diagnostic.message` is quillmark's text. `formatDiagnostic?: (d: Diagnostic) => string` is the seam; what makes it usable is structured `args` upstream.

## Theming: three claims become true

No API change. Register the private length rungs with `@property` so `--qm-space: 4` is contained at one rung instead of collapsing every `calc()` downstream — the constraint `THEMING.md` cites applies to registering the public dial, not the private rung the derivation reads it into. Name the cascade layers with the `@layer qm, app;` prelude, since a consumer who declares their own layers loses in both bundler orders without it. Name the stable `qm-*` class set as contract and census it in `check:style`, and give the rhythm and stroke axes the marker lane the colour axis has, so a geometry value minted in `.ts` stops walking past the gate.

## What this rejects

**A session object as the door in** (`openEditor` returning a handle that owns lifecycle, with surfaces taking only `{qm}`). It reads well and it does not survive contact:

- The rebind footgun relocates rather than retires — `qm` is a prop too, and swapping it is the same silent desync one tier up.
- The document swap it was supposed to buy is an internal re-key that needs no session at all.
- Making surfaces observe a session means either framework state in the framework-free tier or the same subscribe boilerplate per surface, which is the replication the design claimed to delete.
- `free()` is not the burden it was sold as: `--weak-refs` reclaims dropped handles, and the async, client-only mount ceremony survives the change.

What is worth keeping from it is the registration insight, which the connection takes, and the findable open path, which `openEditor` takes as sugar.

**Moving the preview's message rendering into the Svelte wrapper.** It reads as deleting a mechanism; it deletes the vanilla floor.

**Revision-gating as the scheduling story.** Kept as insurance, demoted from a feature.

## Landing order

The correctness work is independent of everything above and every consumer hits it: the loaded-document read, the change signal split, the caret payload, the error channel, then the four theme and gate items. Land it as the spike already has it.

Then, each on its own: the connection with self-registering surfaces (deleting `connect()`'s props-and-getters shape); `DocPath` in the hooks with `Place` declared in `/core`; `$id` identity replacing `IdSeq`, with `cardId` in the payloads; the internal re-key; the editor's verbs as instance exports; `severity`; the teardown order.

Upstream: structured `args` on `Diagnostic` is the one open ask that matters, then Python parity for `getContent` and `revision`. Nothing here blocks on any of it.

## Open questions

- **`cardIds: 'persist'` as the default** puts editor-minted ids into the persisted bytes and makes two documents of identical content differ. That is a document-level choice the editor would be making on a consumer's behalf.
- **Whether the connection should swap the document**, given the surfaces re-key on their own props. A `link.open(next)` is one call against three prop swaps; it is also a second way to do one thing.
- **`DocPath`-only in the hooks** trades a struct for a string parse at the few sites that need an index back. The measurement that settles it is a cold-consumer probe on both shapes, which is the method this review established works.
