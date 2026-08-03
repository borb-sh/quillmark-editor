// @vitest-environment jsdom
// A `plaintext` leaf over a field resting as an authored STRING: the case where
// the declared type is the whole difference. The same bytes are markdown under
// `richtext` and literal text under `plaintext`, so a leaf that picked one codec
// for both would eat every `*` a plaintext author typed — and then commit a delta
// computed against text the document never held.
import { describe, it, expect } from 'vitest';
import { Document } from '@quillmark/wasm';
import { createField } from '$lib/core/codec';
import type { FieldController } from '$lib/core/codec';
import type { EditorView } from 'prosemirror-view';
import { quill } from '../helpers/fixtures.js';

function mount(): HTMLElement {
	const el = document.createElement('div');
	document.body.appendChild(el);
	return el;
}
const viewOf = (f: FieldController): EditorView =>
	(f as FieldController & { view: EditorView }).view;

const AUTHORED = 'Wing *Motto* Here';
/** Both content fields authored with the SAME bytes, through the transport door so
 *  neither is conformed: `letterhead_seal_subtitle` is `plaintext`, `tag_line`
 *  `richtext`. Hand-written rather than round-tripped, because a serialize would
 *  escape the asterisks and the contrast is exactly what escaping erases. */
function authored(): Document {
	return Document.fromMarkdown(
		[
			'~~~',
			'$quill: usaf_memo@0.2.0',
			'$kind: main',
			`letterhead_seal_subtitle: ${AUTHORED}`,
			`tag_line: ${AUTHORED}`,
			'~~~',
			'',
			'Body.',
			''
		].join('\n')
	);
}

describe('a plaintext leaf over an authored string', () => {
	it('reads the bytes literally, while richtext reads the same bytes as markdown', () => {
		const q = quill();
		const doc = authored();
		expect(typeof doc.getStored('letterhead_seal_subtitle')).toBe('string');

		const reader = q.reader(doc);
		const plain = reader.getContent('letterhead_seal_subtitle')!;
		const rich = reader.getContent('tag_line')!;

		expect(plain.text).toBe(AUTHORED);
		expect(plain.marks).toHaveLength(0);
		// The same string, decoded by the other declared type: delimiters consumed,
		// emphasis carried as a mark.
		expect(rich.text).toBe('Wing Motto Here');
		expect(rich.marks).toHaveLength(1);

		doc.free();
	});

	it('mounts the literal text, asterisks intact', () => {
		const q = quill();
		const doc = authored();
		const field = createField({
			doc,
			quill: q,
			addr: { field: 'letterhead_seal_subtitle' },
			container: mount(),
			plaintext: true
		});
		expect(field.getContent().text).toBe(AUTHORED);
		field.destroy();
		doc.free();
	});

	it('commits the first edit CLEANLY, taking no recovery path', () => {
		// The commit half, and the reason the leaf gates on the rest form rather than on
		// mere presence. `applyChange` reads an authored string as markdown whatever the
		// declared type, so a delta over the literal corpus meets a shorter pre-image and
		// is refused; the value survives (the whole-field install fallback catches it)
		// but the host is handed a `commit-fallback` error for an ordinary keystroke.
		// Choosing `install` up front is what makes the first edit unremarkable.
		const q = quill();
		const doc = authored();
		const errors: string[] = [];
		const field = createField({
			doc,
			quill: q,
			addr: { field: 'letterhead_seal_subtitle' },
			container: mount(),
			plaintext: true,
			onError: (e) => errors.push(e.code)
		});

		const view = viewOf(field);
		view.dispatch(view.state.tr.insertText('!', 1));
		expect(errors).toEqual([]);
		expect(field.getContent().text).toBe(`!${AUTHORED}`);
		expect(q.reader(doc).getContent('letterhead_seal_subtitle')!.text).toBe(`!${AUTHORED}`);
		// The commit brought the field to content rest, so the next edit takes ops.
		expect(typeof doc.getStored('letterhead_seal_subtitle')).toBe('object');

		// And an op-grained edit over that rest form is still literal.
		view.dispatch(view.state.tr.insertText('?', 2));
		expect(errors).toEqual([]);
		expect(field.getContent().text).toBe(`!?${AUTHORED}`);

		field.destroy();
		doc.free();
	});
});
