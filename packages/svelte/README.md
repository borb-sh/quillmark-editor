# @quillmark/svelte

Editor + live-preview components for [Quillmark](https://github.com/borb-sh/quillmark) WASM consumers. A WYSIWYG **VisualEditor**, a canvas **Preview** that paints the compiled document and round-trips clicks to the editor, and a read-only debug **source view**, over one `@quillmark/wasm` session. Vanilla-TS cores with thin Svelte 5 wrappers.

## Install

```sh
npm install @quillmark/svelte
```

`svelte@^5` and `@quillmark/wasm` are peer dependencies: the session's handles cross the package boundary, so the consumer supplies the one copy both sides mint them from.

## Subpaths

Each subpath is its own module root; a bundler pulls only what the entry you import reaches.

| Import                      | Surface                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@quillmark/svelte/core`    | What the surfaces share: the `DocPath`/`Place` address vocabulary, the `EditorError` channel, `init`. Framework-free. |
| `@quillmark/svelte/preview` | The live preview: `createPreview` + `<Preview>`. Reaches nothing editor-side.                                         |
| `@quillmark/svelte/visual`  | The federated WYSIWYG: `<VisualEditor>`, the codec's `createField` prose leaf.                                        |
| `@quillmark/svelte/source`  | The read-only debug source view: `createSourceView` + `<SourceView>`.                                                 |
| `@quillmark/svelte`         | Re-exports `/core`.                                                                                                   |

## Open a session

The **consumer** owns the session and the handles, and drives every edit; the surfaces are views over it. The handles come from the `@quillmark/wasm` peer, never re-exported here.

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

## The quill resolves from the document

A stored document carries none of its quill's bytes, only a reference: `doc.quillRef` is `name@version`, persisted in the markdown itself. Resolution is **host code**: read the ref, map it to a `Quill`, open. No surface resolves, so one resolution per document holds by construction.

```ts
const doc = Document.fromMarkdown(stored);
const quill = await registry.getQuill(doc.quillRef); // your ref → Quill mapping
const session = await new Engine().open(quill, doc);
```

`@quillmark/quiver` is one such registry, and the quill it hands back is **borrowed**: it is cached per ref and shared with every caller, so freeing it strands the next one.

Opening a document that names a **different** quill is the same sequence, in order: resolve the new ref, `engine.open(quill, next)`, swap the props, then free the replaced handles that were yours to free. `<VisualEditor>` re-keys itself on the new `doc` (see below); `<Preview>` swaps by remount (`{#key session}`).

## Preview

`createPreview` supplies the layer the session omits: viewport, DOM, DPR, click mapping. It is a pure view: it never calls `session.apply`; you drive the edit and hand it the resulting `ChangeSet`.

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
preview.refresh(session.update(doc)); // repaint dirtyPages ∩ visible
```

In Svelte, `<Preview {session} onCaretPick={…} />` exposes the same verbs (`refresh`, `scrollToField`, `focusPosition`, `setZoom`) via `bind:this`.

`<Preview>` binds **once**, at mount: swapping `session`, `margin`, `overlays`, `onCaretPick`, `onError` or `strings` in place changes nothing on screen and reports `rebind-ignored` through `onError` at `dev` severity, naming the prop. Swap by remounting (`{#key session}`); drive in-place edits through `refresh(change)`. `<SourceView>` is the same for `doc` and `onError`. `class` and `style` are the exceptions on both, landing on the root element and staying live.

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

Hand it a different `doc` and the editor **re-keys itself**: every leaf remounts against the new handle, and the id state, the commit-error map and the active address seed fresh. Nothing to key at the call site. `quill` is not part of that key — the schema is re-read on every derive, so a quill swap re-projects on its own; swapping it _without_ the doc reports `rebind-ignored`.

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

The package ships English and a seam to replace it. `strings` is keyed and **partial**: set what you have translations for, and the rest stay the package's. Several keys are **accessible names** rather than decoration (the card controls, the add trigger, the required marker), so an untranslated surface reads the wrong language to a screen reader. `DEFAULT_VISUAL_STRINGS` is the English, exported so you can compose against it. `<Preview>` takes its own three-key `strings` for the states it shows when there is nothing to paint.

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

`formatDiagnostic` gets the whole `Diagnostic` and returns `undefined` to take its own message. Validation and edit diagnostics re-word from `code`, `path` and `args`; parse errors and render warnings carry their detail inside English text and stand as they are ([VISUAL_EDITOR.md](prose/canon/VISUAL_EDITOR.md)).

### Recompiling

`onChange` is the signal to recompile, and it covers **all three lanes**: a prose keystroke, a scalar write, a card operation. `onCaretMove` is a _selection_ signal, not a change signal: it fires on a bare arrow key, so a recompile hung off it recompiles on every one.

```ts
let timer: ReturnType<typeof setTimeout> | undefined;

onChange: (change) => {
	// a structure op happens once per gesture, so it applies at once;
	// prose and field edits arrive per keystroke, so they debounce.
	if (change.source === 'structure') recompileNow();
	else {
		clearTimeout(timer);
		timer = setTimeout(recompileNow, 120);
	}
};

function recompileNow() {
	timer = undefined;
	const change = session.update(doc);
	preview.refresh(change);
	source.refresh();
	diagnostics = [...session.warnings]; // → the editor's `diagnostics` prop
}
```

`session.warnings` is a **getter on a handle Svelte does not track**: pull it per apply, or the editor shows the previous compile's diagnostics.

This shell layer is deliberately yours: the debounce value, what applies at once, and which surfaces refresh are host policy, so the package ships no scheduler over them. Three obligations ride with that: an edit of your own (an import, an undo, a direct `doc` write) recompiles by the same calls, since nothing polls the document; a compile owes the diagnostics re-read above, since nothing polls the session; and teardown clears the timer **before** freeing the handles, so a pending recompile never touches a freed session.

## The caret bridge

The bridge lives at the **consumer** layer and is opt-in; the editor is unaware of the preview, the preview unaware of the editor. Both hops are pass-throughs: the two surfaces already speak one address grammar, the canonical `DocPath`.

```ts
// preview → editor: a click resolved to a content position places the caret.
onCaretPick: (hit) => visualEditor.setCaret(hit);

// editor → preview: a caret move scrolls the preview to follow it.
onCaretMove: preview.focusPosition;
```

A consumer holding an `Addr` of its own maps it with `fieldPathForAddr` (from `@quillmark/svelte/core`). The playground app's split-pane route is the full reference shell: one session, both bridge directions, the preview following edits, diagnostics routed inline, and the source view.

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

This package is one workspace of [`quillmark-js`](../..); the gates are the root's, and the settled architecture lives in [`prose/`](prose/).

```sh
npm run build -w packages/svelte   # svelte-package → dist/
npm run test  -w packages/svelte   # Vitest (codec, diagnostics, geometry, chain)
npm run check -w packages/svelte   # svelte-check
npm run dev                        # the playground, from the root
```
