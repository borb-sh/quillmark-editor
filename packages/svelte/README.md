# @quillmark/svelte

Editor + live-preview components for [Quillmark](https://github.com/borb-sh/quillmark) WASM consumers. A WYSIWYG **VisualEditor**, a canvas **Preview** that paints the compiled document and round-trips clicks to the editor, and a read-only debug **source view**, over one `@quillmark/wasm` session. Vanilla-TS cores with thin Svelte 5 wrappers.

## Install

```sh
npm install @quillmark/svelte
```

`svelte@^5` and `@quillmark/wasm` are peer dependencies: the session's handles cross the package boundary, so the consumer supplies the one copy both sides mint them from. ProseMirror and the canvas paint loop live in the vanilla-TS cores, so the Svelte wrappers stay thin and a non-Svelte consumer wraps a core in a few lines.

## Subpaths

Each subpath is its own module root; a bundler pulls only what the entry you import reaches.

| Import                      | Surface                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `@quillmark/svelte/core`    | What the surfaces share: the `DocPath`/`Place` address vocabulary, the `EditorError` channel, `init`. The `@quillmark/wasm` API itself is imported from the peer directly. Framework-free. |
| `@quillmark/svelte/preview` | The live preview: `createPreview` + `<Preview>`. Reaches `/core` and nothing editor-side, so `@quillmark/preview` can promote to a re-export.                                              |
| `@quillmark/svelte/visual`  | The federated WYSIWYG: `<VisualEditor>`, the codec's `createField` prose leaf.                                                                                                             |
| `@quillmark/svelte/source`  | The read-only debug source view: `createSourceView` + `<SourceView>`.                                                                                                                      |
| `@quillmark/svelte`         | Re-exports `/core` (the shared substrate).                                                                                                                                                 |

## Open a session

The **consumer** owns the session and the handles, and drives every edit; the surfaces are views over it.

The handles come from the `@quillmark/wasm` peer: the single source of truth, never re-exported here.

```ts
import { Document, Engine, Quill } from '@quillmark/wasm';
import { init } from '@quillmark/svelte/core';

init(); // one-time WASM panic-hook install

const quill = Quill.fromTree(tree); // tree: Map<string, Uint8Array> of the quill dir

// A NEW document: seeded from the quill's blueprint.
const doc = quill.seedDocument();

// An EXISTING document: parsed back from what you stored.
const doc = Document.fromMarkdown(markdown); // canonical Quillmark markdown
const doc = Document.fromJson(json); // the versioned storage DTO (`doc.toJson()`)

const session = await new Engine().open(quill, doc);
// free() on teardown the handles you MINTED: this quill, this doc, this session.
```

A handle a registry lent you is not one of them. `@quillmark/quiver`'s `getQuill` caches its quill per ref and hands the same instance to every caller, so freeing it strands the next one; a host that wants a quill of its own mints it from `Quill.fromTree((await quiver.getQuill(ref)).toTree())` and frees that.

`toJson`/`fromJson` is the persistence pair: the wire format is frozen per schema version and byte-deterministic, so equal documents store equal bytes. `toMarkdown`/`fromMarkdown` is the human-readable pair, round-trip safe to an equal document. `Document.tryFromJson` returns `undefined` rather than throwing, to discriminate the two without exceptions as control flow.

## The quill resolves from the document

A stored document carries none of its quill's bytes, only a reference: `doc.quillRef` is `name@version`, persisted in the markdown itself. Resolution is **host code**: read the ref, map it to a `Quill`, open. No surface resolves, so one resolution per document holds by construction.

```ts
const doc = Document.fromMarkdown(stored);
const quill = await registry.getQuill(doc.quillRef); // your ref → Quill mapping
const session = await new Engine().open(quill, doc);
```

`@quillmark/quiver` is one such registry: its `getQuill` takes selector and canonical refs and caches one instance per canonical ref for the quiver's lifetime, so a second consumer resolving the same document costs no second materialization. An app bundling its one template resolves nothing and pulls no registry client.

Opening a document that names a **different** quill is the same sequence, in order: resolve the new ref, `engine.open(quill, next)`, swap the props, then free the replaced handles that were yours to free: the outgoing session always, the outgoing quill only if you minted it. `<VisualEditor>` re-keys itself on the new `doc` (see below); `<Preview>` swaps by remount (`{#key session}`).

## Preview

`createPreview` supplies exactly the layer `LiveSession` omits: viewport, DOM, DPR, click mapping. It is a pure view: it never calls `session.apply`; you drive the edit and hand it the resulting `ChangeSet`.

```ts
import { createPreview } from '@quillmark/svelte/preview';

const preview = createPreview(session, {
	container: document.querySelector('#preview')!,
	onCaretPick: (hit) => {
		/* a click resolved to a content position; see the bridge below */
	},
	onError: (err) => {
		/* a page paint the backend refused; the preview shows its error state either way */
	}
});

// after an edit lands on `doc`, from any source:
preview.refresh(session.apply(doc)); // repaint dirtyPages ∩ visible
```

In Svelte, `<Preview {session} onCaretPick={…} />` exposes the same verbs (`refresh`, `scrollToField`, `focusPosition`, `setZoom`) via `bind:this`.

`<Preview>` binds **once**, at mount: `session`, `margin`, `overlays`, `onCaretPick`, `onError` and `strings` are read when the paint loop is built and never again, so swapping one in place changes nothing on screen and reports `rebind-ignored` through `onError` at `dev` severity, naming the prop. Swap by remounting (`{#key session}`); drive in-place edits through `refresh(change)`. `<SourceView>` is the same for `doc` and `onError` (`{#key doc}`). `class` and `style` are the exceptions on both, landing on the root element and staying live.

## Visual editor

`<VisualEditor>` is a federated composition of many small editors over one document: each content leaf a ProseMirror prose surface, each scalar a form control, cards the editor's own. It commits directly to the `doc` handle.

```svelte
<script lang="ts">
	import { VisualEditor } from '@quillmark/svelte/visual';
</script>

<VisualEditor
	{doc}
	{quill}
	onChange={(change) => {
		/* an edit LANDED; `change.source` is 'prose' | 'field' | 'structure' */
	}}
	onActiveLeafChange={(active) => {
		/* the active leaf: `active.field` (a DocPath), and `active.cardId` for its card */
	}}
	onCaretMove={(at) => {
		/* the caret moved to `at.field` (a DocPath) at `at.pos` (USV) */
	}}
	onError={(err) => {
		/* a failure the editor recovered from; editing continues */
	}}
	diagnostics={external}
/>
```

Hand it a different `doc` and the editor **re-keys itself**: every leaf remounts against the new handle, and the id state, the commit-error map and the active address seed fresh. Nothing to key at the call site. Edits flow the other way, mutating the passed-in handle, so a swap is the only direction that needs saying.

`quill` is not part of that key — the schema is re-read on every derive, so a quill swap re-projects on its own. Swapping it _without_ the doc leaves the mounted leaves paired to the quill their document mounted with, and reports `rebind-ignored` through `onError` at `dev` severity rather than passing silently.

### Driving it from outside

`bind:this` reaches the same verbs the card header calls, so a toolbar, command palette or shortcut needs no second path into the document. Every one reports through `onChange` exactly as the click does.

```svelte
<script lang="ts">
	let editor: ReturnType<typeof VisualEditor> | undefined = $state();
	let activeCard = $state<string | undefined>();
</script>

<VisualEditor
	bind:this={editor}
	{doc}
	{quill}
	onActiveLeafChange={(a) => (activeCard = a.cardId)}
/>

<button onclick={() => editor?.insertCard('indorsement')}>Add indorsement</button>
<button onclick={() => activeCard && editor?.moveCard(activeCard, -1)}>Move up</button>
<button onclick={() => editor?.focusField('main.subject')}>Jump to subject</button>
```

`insertCard` hands back the new card's `cardId`; `removeCard`, `moveCard` and `setKind` take one. A card key or a path the surface does not hold is a no-op that reports `target-unknown` through `onError` at `dev` severity.

### Wording

The package ships English and a seam to replace it. `strings` is keyed and **partial**: set what you have translations for, and the rest stay the package's.

```svelte
<VisualEditor
	{doc}
	{quill}
	strings={{
		cardDelete: 'Supprimer la carte',
		addCardOfKind: (kind) => `Ajouter : ${kind}`
	}}
	formatDiagnostic={(d) =>
		d.code === 'validation::must_fill' ? `${d.path} est obligatoire` : undefined}
/>
```

Several keys are **accessible names** rather than decoration — the card controls, the add trigger, the required marker — so an untranslated surface reads the wrong language to a screen reader, not merely an inconsistent one. `DEFAULT_VISUAL_STRINGS` is the English, exported so you can compose against it. `<Preview>` takes its own three-key `strings` for the states it shows when there is nothing to paint.

`formatDiagnostic` returns `undefined` to take the diagnostic's own message, and that arm is load-bearing rather than defensive. A formatter gets `code`, a canonical `path` and the message. That re-words the **validation** lane (the constraint is in your quill's schema, the value in the document at `path`) and the **edit** lane (the refused value is your own control state, since you attempted the write). It cannot re-word the **parse** lane, whose line, column and offending key exist only inside the English message, nor **render** warnings, which are backend text. So you localize what you can route, and the built-in text stands where you cannot.

### Recompiling

`onChange` is the signal to recompile, and it covers **all three lanes**: a prose keystroke, a scalar write, a card operation. `onCaretMove` is a _selection_ signal, not a change signal: it fires on a bare arrow key, so a recompile hung off it recompiles on every one.

```ts
onChange: (change) => {
	// a structure op happens once per gesture, so it applies at once;
	// prose and field edits arrive per keystroke, so they debounce.
	if (change.source === 'structure') recompileNow();
	else scheduleRecompile();
};
```

The recompile itself is one apply and a fan-out to whatever you mounted:

```ts
let timer: ReturnType<typeof setTimeout> | undefined;
function scheduleRecompile() {
	clearTimeout(timer);
	timer = setTimeout(recompileNow, 120);
}
function recompileNow() {
	timer = undefined;
	const change = session.apply(doc);
	preview.refresh(change);
	source.refresh();
	diagnostics = [...session.warnings]; // → the editor's `diagnostics` prop
}
```

`session.warnings` is a **getter on a handle Svelte does not track**: pull it per apply, or the editor shows the previous compile's diagnostics.

This is the whole shell layer, and it is deliberately yours: the debounce value, what applies at once, and which surfaces refresh are host policy, so the package ships no scheduler over them. Three obligations ride with ownership: an edit of your own (an import, an undo, a direct `doc` write) recompiles by the same calls, since nothing polls the document; a compile owes the diagnostics re-read above, since nothing polls the session; and teardown clears the timer **before** freeing the handles, so a pending recompile never touches a freed session.

## The caret bridge

The bridge lives at the **consumer** layer and is opt-in; the editor is unaware of the preview, the preview unaware of the editor. Both hops are pass-throughs: the editor and the preview already speak one address grammar, the canonical `DocPath`.

```ts
// preview → editor: a click resolved to a content position places the caret.
onCaretPick: (hit) => visualEditor.setCaret(hit);

// editor → preview: a caret move scrolls the preview to follow it.
onCaretMove: preview.focusPosition;
```

The editor mints the path off its own derived card tree, so following the caret costs no `doc.cards` read per keystroke. `fieldPathForAddr` (from `@quillmark/svelte/core`) is the same mapping for a consumer holding an `Addr` of its own. Its second argument is that card tree, the card kinds by document index, which is why the signature takes one rather than a `Document`:

```ts
const path = fieldPathForAddr(
	addr,
	doc.cards.map((c) => c.kind)
);
```

A consumer calling this once reads `doc.cards` and moves on; the per-keystroke path is the one that cannot afford to, since each read serializes every card.

The playground app's split-pane route is the full reference shell: one session, both bridge directions, the preview following edits, diagnostics routed inline, and the source view.

## Errors

Every surface takes `onError`. It reports failures the surface **recovered from**: a commit the boundary refused, a card operation that threw, a page paint that failed, a serialize that threw. None of them stop editing. Wire nothing and each lands in the console, which an app cannot route, filter or count.

```ts
onError: (err) => {
	// err.code: 'commit-refused' | 'paint-failed' | … (see EditorErrorCode)
	// err.severity: 'error' (runtime) | 'dev' (a contract violation)
	// err.cause: whatever was thrown, unwrapped
	if (err.severity === 'error') telemetry.capture(err);
};
```

This is not the diagnostics channel. A `Diagnostic` is about the **document** and draws on the field it belongs to; an `EditorError` is about the **surface** and draws nowhere. A refused scalar commit produces both.

## Source view (debug)

A read-only mirror of `Document.toMarkdown()`: the canonical Quillmark markdown, not an editable dual mode.

```ts
import { createSourceView } from '@quillmark/svelte/source';

const source = createSourceView({ container: el, doc });
// after an edit lands:
source.refresh();
```

Or `<SourceView {doc} />` with a `refresh()` method.

## Theming

The surfaces carry the behavior against a neutral, overridable visual baseline: a set of `--qm-*` CSS custom properties you override on any ancestor. See [`THEMING.md`](THEMING.md).

## Development

This package is one workspace of [`quillmark-js`](../..); the gates are the root's.

```sh
npm run build -w packages/svelte   # svelte-package → dist/
npm run test  -w packages/svelte   # Vitest (codec, diagnostics, geometry, chain)
npm run check -w packages/svelte   # svelte-check
npm run dev                    # the playground, from the root
```

The playground consumes **only** the public subpath API; a needed internal is an API gap to fix, not a reach-in. All development runs against the one reference quill, `fixtures/quills/usaf_memo` at the workspace root (a dev fixture, never published). The settled architecture lives in [`prose/`](prose/).
