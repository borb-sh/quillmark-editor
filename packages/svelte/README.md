# @quillmark/svelte

Editor + live-preview components for [Quillmark](https://github.com/borb-sh/quillmark) WASM consumers. A WYSIWYG **VisualEditor**, a canvas **Preview** that paints the compiled document and round-trips clicks to the editor, and a read-only debug **source view**, over one `@quillmark/wasm` session. Vanilla-TS cores with thin Svelte 5 wrappers.

## Install

```sh
npm install @quillmark/svelte
```

`svelte@^5` and `@quillmark/wasm` are peer dependencies: the session's handles cross the package boundary, so the consumer supplies the one copy both sides mint them from. ProseMirror and the canvas paint loop live in the vanilla-TS cores, so the Svelte wrappers stay thin and a non-Svelte consumer wraps a core in a few lines.

## Subpaths

Each subpath is its own module root; a bundler pulls only what the entry you import reaches.

| Import                      | Surface                                                                                                                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@quillmark/svelte/core`    | The `@quillmark/wasm` boundary: `Engine`/`Quill`/`Document` handles, the content codec, every boundary type, and the `Place`/`EditorError` vocabulary the surfaces share. Framework-free. |
| `@quillmark/svelte/preview` | The live preview: `createPreview` + `<Preview>`. Reaches `/core` and nothing editor-side, so `@quillmark/preview` can promote to a re-export.                                             |
| `@quillmark/svelte/visual`  | The federated WYSIWYG: `<VisualEditor>`, the codec's `createField` prose leaf, `fieldPathForAddr`.                                                                                        |
| `@quillmark/svelte/source`  | The read-only debug source view: `createSourceView` + `<SourceView>`.                                                                                                                     |
| `@quillmark/svelte`         | Re-exports `/core` (the shared substrate).                                                                                                                                                |

## Open a session

The **consumer** owns the session and the handles, and drives every edit; the surfaces are views over it.

```ts
import { Document, Engine, Quill, init } from '@quillmark/svelte/core';

init(); // one-time WASM init

const quill = Quill.fromTree(tree); // tree: Map<string, Uint8Array> of the quill dir

// A NEW document: seeded from the quill's blueprint.
const doc = quill.seedDocument();

// An EXISTING document: parsed back from what you stored.
const doc = Document.fromMarkdown(markdown); // canonical Quillmark markdown
const doc = Document.fromJson(json); // the versioned storage DTO (`doc.toJson()`)

const session = await new Engine().open(quill, doc);
// free() quill / doc / session on teardown.
```

`toJson`/`fromJson` is the persistence pair: the wire format is frozen per schema version and byte-deterministic, so equal documents store equal bytes. `toMarkdown`/`fromMarkdown` is the human-readable pair, round-trip safe to an equal document. `Document.tryFromJson` returns `undefined` rather than throwing, to discriminate the two without exceptions as control flow.

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
	onActiveAddrChange={(addr) => {
		/* the active leaf's address */
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

Swap `doc`/`quill` by **remounting** (`{#key doc}`); edits flow the other way, mutating the passed-in handle.

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

## The caret bridge

The bridge lives at the **consumer** layer and is opt-in; the editor is unaware of the preview, the preview unaware of the editor. Both hops are pass-throughs: the editor and the preview already speak one address grammar, the canonical `DocPath`.

```ts
// preview → editor: a click resolved to a content position places the caret.
onCaretPick: (hit) => visualEditor.setCaret(hit);

// editor → preview: a caret move scrolls the preview to follow it.
onCaretMove: preview.focusPosition;
```

The editor mints the path off its own derived card tree, so following the caret costs no `doc.cards` read per keystroke. `fieldPathForAddr` (from `@quillmark/svelte/visual`) is the same mapping for a consumer holding an `Addr` of its own.

The playground's `/editor` route is the full reference split-pane shell: one session, both bridge directions, the preview following edits, diagnostics routed inline, and the source view.

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
