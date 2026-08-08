// The quickstart's code, one string per step: the smallest thing that reaches
// each surface, as a consumer writes it. Strings in their own module because a
// Svelte sample carries a `</script>` that would close the route's own script
// block.
//
// Lines stay under ~68 characters: a sample sits in half of the step's column
// beside the surface it runs, and a wrapped line of code reads as two.

export const INSTALL = `npm install @quillmark/svelte @quillmark/wasm`;

export const OPEN_SESSION = `import { Engine, Quill } from '@quillmark/wasm';
import { init } from '@quillmark/svelte/core';

await init(); // one-time, instantiates the WASM core

const quill = Quill.fromTree(tree); // the quill's files
const doc = quill.seedDocument(); // or Document.fromMarkdown(md)
const session = await new Engine().open(quill, doc);`;

export const PREVIEW = `<script lang="ts">
  import { Preview } from '@quillmark/svelte/preview';
</script>

<Preview
  {session}
  onPick={(at) => console.log(at.field, at.pos)}
/>`;

export const VISUAL = `<script lang="ts">
  import { VisualEditor } from '@quillmark/svelte/visual';
</script>

<VisualEditor
  {doc}
  {quill}
  onChange={() => preview.refresh(session.update(doc))}
/>`;
