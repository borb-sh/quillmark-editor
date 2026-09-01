// @vitest-environment jsdom
// A `{field}` card title over a prose field, on the two lanes a header is read on.
// A prose leaf commits itself and bumps nothing, so the header its field names is
// the one piece of the model that lane changes: it follows the commit on a leaf
// that stays mounted. The next bump rebuilds the header from the document, where a
// committed field rests as `Content`, and reads it by its text.
//
// On its own quill: the reference quill templates no title over a prose field
// (`section`'s `{heading}` names a `string`, which commits through the typed writer
// and a bump). Mounted at `VisualEditorInner`, which holds `getActiveLeaf`: jsdom
// drives no contenteditable, so the commit is a transaction dispatched into the
// leaf's own view, as `codec/plaintext-leaf` drives one.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Content, Document, Quill } from '@quillmark/wasm';
import { init, fieldPathForAddr, type DocPath } from '$lib/core';
import type { FieldController, LeafViews } from '$lib/core/codec';
import type { CardId, EditorChange } from '$lib/visual';
import { fieldValues } from '$lib/visual/structure';
import VisualEditorInner from '$lib/visual/VisualEditorInner.svelte';

const core = await init();

// jsdom implements none of these, and a focus into a leaf reaches them: the reveal's
// hop, the arrival wash, and the caret rect PM measures to scroll to.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const QUILL_YAML = `
quill:
  name: title_probe
  version: 0.1.0
  backend: typst
  description: One card kind titled by two of its fields, one of them prose.
typst:
  plate_file: plate.typ
main:
  body:
    example: |
      Body.
card_kinds:
  person:
    ui:
      title: "{rank} {name}"
    fields:
      rank:
        type: string
        example: TSgt
      name:
        type: plaintext
        example: John A. Doe
`;

function probeQuill(): Quill {
	// This realm's `Uint8Array`, as `codec/plaintext-leaf`: the boundary refuses
	// another realm's by identity.
	const bytes = (s: string): Uint8Array => new Uint8Array(new TextEncoder().encode(s));
	return core.Quill.fromTree(
		new Map([
			['Quill.yaml', bytes(QUILL_YAML)],
			['plate.typ', bytes('#set page(width: 200pt)\n')]
		])
	);
}

interface EditorRef {
	focusField(field: DocPath): Promise<void>;
	getActiveLeaf(): FieldController | undefined;
	insertCard(kind: string, at?: number): CardId | undefined;
}

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

function mountEditor(q: Quill, doc: Document) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const changes: EditorChange[] = [];
	const app = mount(VisualEditorInner, {
		target,
		props: { doc, quill: q, onChange: (c: EditorChange) => changes.push(c) }
	});
	flushSync();
	cleanup = () => {
		void unmount(app);
		target.remove();
		doc.free();
	};
	return { target, editor: app as unknown as EditorRef, changes };
}

const titles = (target: HTMLElement): string[] =>
	[...target.querySelectorAll<HTMLInputElement>('.qm-card-title')].map((i) => i.placeholder);

describe('a {field} title over a prose field', () => {
	it('follows the leaf commit without a bump, and survives the next one', async () => {
		const q = probeQuill();
		const doc = q.seedDocument();
		expect(doc.card(0).kind).toBe('person');
		const { target, editor, changes } = mountEditor(q, doc);
		expect(titles(target)).toEqual(['TSgt John A. Doe']);

		await editor.focusField(fieldPathForAddr({ card: 0, field: 'name' }, ['person'])!);
		const leaf = editor.getActiveLeaf() as (FieldController & LeafViews) | undefined;
		expect(leaf).toBeDefined();
		const { view } = leaf!;
		view.dispatch(view.state.tr.insertText('Jane Q. Roe', 1, view.state.doc.content.size - 1));
		flushSync();

		// The prose lane alone: nothing re-derived the tree, and the leaf that
		// committed is the one still mounted.
		expect(changes.map((c) => c.source)).toEqual(['prose']);
		expect(titles(target)).toEqual(['TSgt Jane Q. Roe']);
		expect(editor.getActiveLeaf()).toBe(leaf);

		// What the leaf committed rests as `Content`, which is what a re-derive reads.
		const rested = fieldValues(doc.card(0).payloadItems).name as Partial<Content>;
		expect(rested.text).toBe('Jane Q. Roe');

		// A bump rebuilds the header from the document, reading the `Content` by its text.
		editor.insertCard('person');
		flushSync();
		expect(changes).toHaveLength(2);
		expect(titles(target)).toEqual(['TSgt Jane Q. Roe', 'TSgt John A. Doe']);
	});
});
