// @vitest-environment jsdom
// A `plaintext` leaf over a field resting as an authored string: the case where the
// declared type is the whole difference. The same bytes are markdown under `richtext`
// and literal text under `plaintext`, so a leaf that picked one codec for both would
// eat every `*` a plaintext author typed, then commit a delta computed against text
// the document never held.
//
// The one suite that does not run on the reference quill, because that quill cannot
// declare the shape under test: its `plate.typ` hands every field to a vendored Typst
// package, `plaintext` resolves to content for a backend exactly as `richtext` does,
// and the string-typed slots there coerce with `str()`, which content is not. Retyping
// a field would be a plate change rather than a fixture change. So the schema is built
// here and stays minimal: two content fields differing only in declared type, which is
// the entire variable.
import { describe, it, expect } from 'vitest';
import { init, type Document, type Quill } from '@quillmark/wasm';
import { createField } from '$lib/core/codec';
import type { FieldController } from '$lib/core/codec';
import type { EditorView } from 'prosemirror-view';

const core = await init();

const QUILL_YAML = `
quill:
  name: codec_probe
  version: 0.1.0
  backend: typst
  description: Two content fields differing only in declared type.
typst:
  plate_file: plate.typ
main:
  body:
    example: |
      Body.
  fields:
    note:
      type: plaintext
      example: literal
    tag:
      type: richtext
      inline: true
      example: markdown
`;

function probeQuill(): Quill {
	// Re-wrapped in this realm's `Uint8Array`: under jsdom the encoder's output comes
	// from another realm and the boundary refuses it by identity.
	const bytes = (s: string): Uint8Array => new Uint8Array(new TextEncoder().encode(s));
	return core.Quill.fromTree(
		new Map([
			['Quill.yaml', bytes(QUILL_YAML)],
			['plate.typ', bytes('#set page(width: 200pt)\n')]
		])
	);
}

function mount(): HTMLElement {
	const el = document.createElement('div');
	document.body.appendChild(el);
	return el;
}
const viewOf = (f: FieldController): EditorView =>
	(f as FieldController & { view: EditorView }).view;

const AUTHORED = 'Wing *Motto* Here';
/** Both content fields authored with the same bytes, through the transport door so
 *  neither is conformed. Hand-written rather than round-tripped, because a serialize
 *  would escape the asterisks and the contrast is what escaping erases. */
const authored = (): Document =>
	core.Document.fromMarkdown(
		[
			'~~~',
			'$quill: codec_probe@0.1.0',
			'$kind: main',
			`note: ${AUTHORED}`,
			`tag: ${AUTHORED}`,
			'~~~',
			'',
			'Body.',
			''
		].join('\n')
	);

describe('a plaintext leaf over an authored string', () => {
	it('reads the bytes literally, while richtext reads the same bytes as markdown', () => {
		const q = probeQuill();
		const doc = authored();
		expect(typeof doc.getStored('note')).toBe('string');

		const reader = q.reader(doc);
		const plain = reader.getContent('note')!;
		const rich = reader.getContent('tag')!;

		expect(plain.text).toBe(AUTHORED);
		expect(plain.marks).toHaveLength(0);
		// The same string, decoded by the other declared type: delimiters consumed,
		// emphasis carried as a mark.
		expect(rich.text).toBe('Wing Motto Here');
		expect(rich.marks).toHaveLength(1);

		doc.free();
	});

	it('mounts the literal text, asterisks intact', () => {
		const q = probeQuill();
		const doc = authored();
		const field = createField({
			doc,
			quill: q,
			addr: { field: 'note' },
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
		// declared type, so a delta over the literal content meets a shorter pre-image and
		// is refused; the value survives (the whole-field install fallback catches it)
		// but the host is handed a `commit-fallback` error for an ordinary keystroke.
		// Choosing `install` up front is what makes the first edit unremarkable.
		const q = probeQuill();
		const doc = authored();
		const errors: string[] = [];
		const field = createField({
			doc,
			quill: q,
			addr: { field: 'note' },
			container: mount(),
			plaintext: true,
			onError: (e) => errors.push(e.code)
		});

		const view = viewOf(field);
		view.dispatch(view.state.tr.insertText('!', 1));
		expect(errors).toEqual([]);
		expect(field.getContent().text).toBe(`!${AUTHORED}`);
		expect(q.reader(doc).getContent('note')!.text).toBe(`!${AUTHORED}`);
		// The commit brought the field to content rest, so the next edit takes ops.
		expect(typeof doc.getStored('note')).toBe('object');

		// And an op-grained edit over that rest form is still literal.
		view.dispatch(view.state.tr.insertText('?', 2));
		expect(errors).toEqual([]);
		expect(field.getContent().text).toBe(`!?${AUTHORED}`);

		field.destroy();
		doc.free();
	});
});
