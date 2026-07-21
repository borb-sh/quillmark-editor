# @quillmark/editor

Editor + live-preview components for [Quillmark](https://github.com/borb-sh/quillmark)
WASM consumers. A WYSIWYG **VisualEditor**, a canvas **Preview** that paints the
compiled document and round-trips clicks to the editor, and a read-only debug
**source view** — over one `@quillmark/wasm` session. Vanilla-TS cores with thin
Svelte 5 wrappers.

## Install

```sh
npm install @quillmark/editor
```

`svelte@^5` is a peer dependency; `@quillmark/wasm` comes as a dependency. The
heavy libraries (ProseMirror, CodeMirror, the canvas paint loop) live in the
vanilla-TS cores, so the Svelte wrappers stay thin and a non-Svelte consumer
wraps a core in a few lines.

## Subpaths

Each subpath is its own module root — a bundler pulls only what the entry you
import reaches.

| Import                      | Surface                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `@quillmark/editor/core`    | The `@quillmark/wasm` boundary: `Engine`/`Quill`/`Document` handles, the content codec, and every boundary type. Framework-free.               |
| `@quillmark/editor/preview` | The live preview — `createPreview` + `<Preview>`. Reaches `/core` and nothing editor-side, so `@quillmark/preview` can promote to a re-export. |
| `@quillmark/editor/visual`  | The federated WYSIWYG — `<VisualEditor>`, the codec's `createField` prose leaf, `fieldPathForAddr`.                                            |
| `@quillmark/editor/source`  | The read-only debug source view — `createSourceView` + `<SourceView>`.                                                                         |
| `@quillmark/editor`         | Re-exports `/core` (the shared substrate).                                                                                                     |

## Open a session

The **consumer** owns the session and the handles, and drives every edit; the
surfaces are views over it.

```ts
import { Engine, Quill, init } from '@quillmark/editor/core';

init(); // one-time WASM init

const quill = Quill.fromTree(tree); // tree: Map<string, Uint8Array> of the quill dir
const doc = quill.seedDocument();
const session = await new Engine().open(quill, doc);
// free() quill / doc / session on teardown.
```

## Preview

`createPreview` supplies exactly the layer `LiveSession` omits — viewport, DOM,
DPR, click mapping. It is a pure view: it never calls `session.apply`; you drive
the edit and hand it the resulting `ChangeSet`.

```ts
import { createPreview } from '@quillmark/editor/preview';

const preview = createPreview(session, {
	container: document.querySelector('#preview')!,
	onCaretPick: (hit) => {
		/* a click resolved to a content position — see the bridge below */
	}
});

// after an edit lands on `doc`, from any source:
preview.refresh(session.apply(doc)); // repaint dirtyPages ∩ visible
```

In Svelte, `<Preview {session} onCaretPick={…} />` exposes the same verbs
(`refresh`, `scrollToField`, `focusPosition`, `setZoom`) via `bind:this`.

## Visual editor

`<VisualEditor>` is a federated composition of many small editors over one
document — each content leaf a ProseMirror prose surface, each scalar a form
control, cards the editor's own. It commits directly to the `doc` handle.

```svelte
<script lang="ts">
	import { VisualEditor } from '@quillmark/editor/visual';
</script>

<VisualEditor
	{doc}
	{quill}
	onChange={() => {
		/* a scalar/structure mutation landed */
	}}
	onActiveAddrChange={(addr) => {
		/* the active leaf's address */
	}}
	onCaretMove={(addr, pos) => {
		/* the active leaf's caret moved (USV) */
	}}
	diagnostics={external}
/>
```

Swap `doc`/`quill` by **remounting** (`{#key doc}`); edits flow the other way,
mutating the passed-in handle.

## The caret bridge

The bridge lives at the **consumer** layer and is opt-in — the editor is unaware
of the preview, the preview unaware of the editor. Wire the two directions:

```ts
// preview → editor: a click resolved to a content position places the caret.
onCaretPick: (hit) => visualEditor.setCaret(hit);

// editor → preview: a caret move scrolls the preview to follow it.
import { fieldPathForAddr } from '@quillmark/editor/visual';
onCaretMove: (addr, pos) => {
	const field = fieldPathForAddr(
		addr,
		doc.cards.map((c) => c.kind)
	);
	if (field) preview.focusPosition(field, pos);
};
```

`src/routes/editor/+page.svelte` is the full reference split-pane shell — one
session, both bridge directions, the preview following edits, diagnostics routed
inline, and the source view.

## Source view (debug)

A read-only mirror of `Document.toMarkdown()` — the canonical Quillmark markdown,
not an editable dual mode.

```ts
import { createSourceView } from '@quillmark/editor/source';

const source = createSourceView({ container: el, doc });
// after an edit lands:
source.refresh();
```

Or `<SourceView {doc} />` with a `refresh()` method.

## Theming

The surfaces carry the behavior against a neutral, overridable visual baseline —
a set of `--qm-*` CSS custom properties you override on any ancestor. See
[`THEMING.md`](THEMING.md).

## Development

```sh
npm run dev     # the playground (preview / visual / editor routes)
npm run build   # svelte-package → dist/
npm test        # Vitest (codec, diagnostics, geometry, chain)
npm run check   # svelte-check
npm run lint    # prettier
npm run test:e2e # Playwright — the browser tier (paint, bridge, virtualization)
```

The playground under `src/routes/` consumes **only** the public subpath API — a
needed internal is an API gap to fix, not a reach-in. All development runs against
the one reference quill, `fixtures/quills/usaf_memo` (a dev fixture, never
published). The settled architecture lives in [`prose/`](prose/).
