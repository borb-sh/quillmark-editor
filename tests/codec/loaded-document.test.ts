// @vitest-environment jsdom
// A document a consumer LOADED rather than seeded (`Document.fromMarkdown`, the
// door every real app opens a saved document through) stores its richtext fields
// as the markdown it parsed, not as content: `getStored` is the verbatim read, and
// verbatim is what is there. The prose leaf takes both, and the round-trip through
// an edit lands back in the same document.
import { describe, it, expect } from 'vitest';
import { Document, Quill, init } from '$lib/core';
import { createField } from '$lib/core/codec';
import type { FieldController } from '$lib/core/codec';
import type { EditorView } from 'prosemirror-view';
import { loadFixtureTree } from '../helpers/fixtures.js';

function mount(): HTMLElement {
	const el = document.createElement('div');
	document.body.appendChild(el);
	return el;
}
const viewOf = (f: FieldController): EditorView =>
	(f as FieldController & { view: EditorView }).view;

/** A saved document: seeded, written, serialized, and parsed back. */
function loaded(): { quill: Quill; doc: Document } {
	init();
	const quill = Quill.fromTree(loadFixtureTree());
	const seed = quill.seedDocument();
	quill.writer(seed).set('subject', 'Reloaded subject');
	const doc = Document.fromMarkdown(seed.toMarkdown());
	seed.free();
	return { quill, doc };
}

describe('a document loaded from markdown', () => {
	it('round-trips through toMarkdown → fromMarkdown', () => {
		const { quill, doc } = loaded();
		const again = Document.fromMarkdown(doc.toMarkdown());
		expect(again.toMarkdown()).toBe(doc.toMarkdown());
		expect(again.cardCount).toBe(doc.cardCount);
		again.free();
		doc.free();
		quill.free();
	});

	it('mounts a prose leaf over a field it stores as a STRING', () => {
		const { quill, doc } = loaded();
		expect(typeof doc.getStored({ field: 'subject' })).toBe('string');

		const field = createField({
			doc,
			addr: { field: 'subject' },
			container: mount(),
			inline: true
		});
		expect(field.getContent().text).toContain('Reloaded subject');

		// And an edit commits back, which is the half a tolerant read alone would not buy.
		const view = viewOf(field);
		view.dispatch(view.state.tr.insertText('!', 1));
		expect(doc.toMarkdown()).toContain('!Reloaded subject');

		field.destroy();
		doc.free();
		quill.free();
	});

	it('mounts the body leaf too', () => {
		const { quill, doc } = loaded();
		const field = createField({ doc, addr: {}, container: mount() });
		expect(typeof field.getContent().text).toBe('string');
		field.destroy();
		doc.free();
		quill.free();
	});
});
