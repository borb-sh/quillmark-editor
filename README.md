# @quillmark/editor

Editor + live-preview components for [Quillmark](https://github.com/borb-sh/quillmark) WASM consumers. A WYSIWYG **VisualEditor**, a canvas **Preview** that paints the compiled document and round-trips clicks to the editor, and a read-only debug **source view**, over one `@quillmark/wasm` session. Vanilla-TS cores with thin Svelte 5 wrappers.

## Install

```sh
npm install @quillmark/editor
```

`svelte@^5` is a peer dependency; `@quillmark/wasm` comes as a dependency. ProseMirror and the canvas paint loop live in the vanilla-TS cores, so the Svelte wrappers stay thin and a non-Svelte consumer wraps a core in a few lines.

## Subpaths

Each subpath is its own module root; a bundler pulls only what the entry you import reaches.

| Import                      | Surface                                                                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `@quillmark/editor/core`    | The `@quillmark/wasm` boundary: `Engine`/`Quill`/`Document` handles, the content codec, and every boundary type. Framework-free.              |
| `@quillmark/editor/preview` | The live preview: `createPreview` + `<Preview>`. Reaches `/core` and nothing editor-side, so `@quillmark/preview` can promote to a re-export. |
| `@quillmark/editor/visual`  | The federated WYSIWYG: `<VisualEditor>`, the codec's `createField` prose leaf, the emitted payload types.                                     |
| `@quillmark/editor/source`  | The read-only debug source view: `createSourceView` + `<SourceView>`.                                                                         |
| `@quillmark/editor`         | Re-exports `/core` (the shared substrate).                                                                                                    |

## Open a session

The **consumer** owns the session and the handles, and drives every edit; the surfaces are views over it.

```ts
import { Engine, Quill, init } from '@quillmark/editor/core';

init(); // one-time WASM init

const quill = Quill.fromTree(tree); // tree: Map<string, Uint8Array> of the quill dir
const doc = quill.seedDocument();
const session = await new Engine().open(quill, doc);
// free() quill / doc / session on teardown.
```

## Preview

`createPreview` supplies exactly the layer `LiveSession` omits: viewport, DOM, DPR, click mapping. It is a pure view: it never calls `session.apply`; you drive the edit and hand it the resulting `ChangeSet`.

```ts
import { createPreview } from '@quillmark/editor/preview';

const preview = createPreview(session, {
	container: document.querySelector('#preview')!,
	onCaretPick: (hit) => {
		/* a click resolved to a content position; see the bridge below */
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
	import { VisualEditor } from '@quillmark/editor/visual';
</script>

<VisualEditor
	{doc}
	{quill}
	onChange={(change) => {
		/* an edit landed: change.source is 'prose' | 'field' | 'structure' */
	}}
	onActiveAddrChange={(at) => {
		/* the active leaf, as `{ addr, field }` */
	}}
	onCaretMove={(at) => {
		/* the caret moved: `{ addr, field, pos }`. A selection signal, not a
		   change signal — an arrow key fires it and commits nothing. */
	}}
	diagnostics={external}
/>
```

Every surface takes an `onError`. The surfaces recover from what goes wrong inside them — a refused commit keeps the edit and pins a diagnostic, a paint that throws shows a message, a serialize that throws prints itself into the mirror — so this is a report, not a gate; without it each failure is a `console.error` an app cannot route.

`onChange` fires for **every** edit — prose keystroke, form control, card operation — and `change.source` says which, so a host can recompile a structure op at once and let a burst of typing settle. `onCaretMove` is a selection signal and never a change signal.

Swap `doc`/`quill` by **remounting** (`{#key doc}`); edits flow the other way, mutating the passed-in handle. Swapping in place is not observed; in a dev build the surface says so on the console.

## The caret bridge

The bridge lives at the **consumer** layer and is opt-in; the editor is unaware of the preview, the preview unaware of the editor. Wire the two directions:

Each surface emits the argument the other one takes, so both directions are pass-throughs:

```ts
// preview → editor: a click resolved to a content position places the caret.
onCaretPick: (hit) => visualEditor.setCaret(hit);

// editor → preview: a caret move scrolls the preview to follow it.
onCaretMove: (at) => preview.focusPosition(at);
```

The editor mints the canonical field path off the card tree it already derives, so this costs no per-keystroke work. `fieldPathForAddr(addr, kinds)` is exported for the other case: addressing a leaf the editor has not just reported (a saved cursor, a deep link).

`src/routes/editor/+page.svelte` is the full reference split-pane shell: one session, both bridge directions, the preview following edits, diagnostics routed inline, and the source view.

## Source view (debug)

A read-only mirror of `Document.toMarkdown()`: the canonical Quillmark markdown, not an editable dual mode.

```ts
import { createSourceView } from '@quillmark/editor/source';

const source = createSourceView({ container: el, doc });
// after an edit lands:
source.refresh();
```

Or `<SourceView {doc} />` with a `refresh()` method.

## Wording, and the two extension points

Every user-visible string the surfaces draw is one key in a `strings` contract, overridden key by key; unset keys take the package's English. Several are accessible names, not decoration.

```svelte
<VisualEditor {doc} {quill} strings={{ cardDelete: t('card.delete'), tipNext: t('tip.next') }} />
<Preview {session} strings={{ empty: t('preview.empty') }} />
```

`DEFAULT_STRINGS` / `DEFAULT_PREVIEW_STRINGS` / `DEFAULT_SOURCE_STRINGS` are exported to compose against. The empty-body ghost is the entry that takes a function: `strings={{ bodyPlaceholder: ({ kind }) => … }}`, consulted once per kind and cached.

Two snippets reach inside the chrome:

```svelte
<VisualEditor {doc} {quill}>
	{#snippet cardActions(card)}
		<!-- card: { addr, kind, isMain, insertAfter, remove, move } -->
		<button onclick={() => card.insertAfter(doc.cards[card.addr.card])}>Duplicate</button>
	{/snippet}
</VisualEditor>

<Preview {session}>
	{#snippet message({ state, text })}
		{#if state === 'empty'}<EmptyIllustration />{:else}<p>{text}</p>{/if}
	{/snippet}
</Preview>
```

The card snippet is handed **verbs**, not only an address: the editor owns card identity, so a consumer inserting into `doc.cards` behind it desyncs the card tree silently. All three surface roots take rest props, so `id`, `data-*` and `aria-*` land on the mounted element.

## Theming

The surfaces carry the behavior against a neutral, overridable visual baseline: a set of `--qm-*` CSS custom properties you override on any ancestor. See [`THEMING.md`](THEMING.md).

## Development

```sh
npm run dev     # the playground (preview / visual / editor routes)
npm run build   # svelte-package → dist/
npm test        # Vitest (codec, diagnostics, geometry, chain)
npm run check   # svelte-check
npm run lint    # prettier
```

The playground under `src/routes/` consumes **only** the public subpath API; a needed internal is an API gap to fix, not a reach-in. All development runs against the one reference quill, `fixtures/quills/usaf_memo` (a dev fixture, never published). The settled architecture lives in [`prose/`](prose/).
