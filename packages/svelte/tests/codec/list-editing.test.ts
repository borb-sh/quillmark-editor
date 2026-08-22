// @vitest-environment jsdom
// A list edited the way a writer edits one: keystrokes and text at a mounted leaf,
// with the stored `Content` read back after every step.
//
// The command suites drive one binding and assert a document shape; this one is the
// whole path — the key chain, the shorthand rules, the boundary guard, `lower`,
// `applyChange` — and it asserts the only thing a writer can check: that what the
// document reopens as is what they left on screen. A commit that refused and fell back
// to `overwrite` reports through `onError`, so an empty error log is half the claim.
import { describe, it, expect, beforeEach } from 'vitest';
import { TextSelection } from 'prosemirror-state';
import { Fragment, Slice } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';
import type { Document } from '@quillmark/wasm';
import { blockSchema, createField, decode } from '$lib/core/codec';
import type { FieldController } from '$lib/core/codec';
import type { EditorError } from '$lib/core';
import { md, mount, quill, textblocks } from './_util.js';

// jsdom lays nothing out, and a flagged dispatch asks PM for the caret's rect
// (`field.test.ts` stubs these for the same reason).
Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect ??= () => new DOMRect();

const n = blockSchema.nodes;

/** Type `text` the way the browser drives it, so the shorthand rules see each char. */
function type(view: EditorView, text: string): void {
	for (const ch of text) {
		const { from, to } = view.state.selection;
		const deflt = () => view.state.tr.insertText(ch, from, to);
		if (!view.someProp('handleTextInput', (f) => f(view, from, to, ch, deflt))) {
			view.dispatch(deflt());
		}
	}
}

/** Press `key` through the props the plugin stack registered. */
function press(view: EditorView, key: string, init: KeyboardEventInit = {}): void {
	view.someProp('handleKeyDown', (f) => f(view, new KeyboardEvent('keydown', { key, ...init })));
}

/** Put the caret at the start of the `index`-th textblock: the click a writer makes
 *  before editing a line they already typed. */
function clickInto(view: EditorView, index: number): void {
	const start = textblocks(view.state.doc)[index].start;
	view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start)));
}

/** A one-item bullet list on the clipboard: what copying a whole list yields. */
function listSlice(text: string): Slice {
	const item = n.list_item.create(null, n.paragraph.create(null, blockSchema.text(text)));
	return new Slice(Fragment.from(n.bullet_list.create(null, item)), 0, 0);
}

describe('a list edited at a mounted leaf', () => {
	let field: FieldController;
	let view: EditorView;
	let errors: EditorError[];

	/** A body leaf over a fresh document, holding `markdown` (an empty body by default). */
	function open(markdown?: string): void {
		const doc: Document = quill().seedDocument();
		if (markdown) doc.overwrite({}, md(markdown));
		errors = [];
		field = createField({
			doc,
			quill: quill(),
			addr: {},
			container: mount(),
			onError: (e) => errors.push(e)
		});
		view = (field as FieldController & { view: EditorView }).view;
		if (!markdown) view.dispatch(view.state.tr.delete(0, view.state.doc.content.size));
	}

	beforeEach(() => open());

	/** The document the store would reopen, against the one on screen. */
	function reopens(label: string): void {
		const stored = decode(field.getContent(), blockSchema);
		expect(stored.toString(), `${label}: the store holds another document`).toBe(
			view.state.doc.toString()
		);
		expect(
			errors.map((e) => e.code),
			label
		).toEqual([]);
	}

	it('a list written from scratch', () => {
		type(view, '- one');
		reopens('first item');
		press(view, 'Enter');
		type(view, 'two');
		reopens('second item');
		press(view, 'Tab');
		reopens('nested');
		press(view, 'Enter');
		type(view, 'three');
		reopens('nested sibling');
		press(view, 'Enter');
		press(view, 'Enter');
		reopens('one level out');
		type(view, 'four');
		reopens('back at the top level');
		expect(view.state.doc.toString()).toBe(
			'doc(bullet_list(list_item(paragraph("one"), bullet_list(list_item(paragraph("two")), list_item(paragraph("three")))), list_item(paragraph("four"))))'
		);
	});

	it('deleting back through the levels', () => {
		type(view, '- one');
		press(view, 'Enter');
		type(view, 'two');
		press(view, 'Tab');
		press(view, 'Enter');
		type(view, 'three');
		reopens('built');

		clickInto(view, 2);
		press(view, 'Backspace');
		reopens('the nested pair merged');
		expect(view.state.doc.toString()).toBe(
			'doc(bullet_list(list_item(paragraph("one"), bullet_list(list_item(paragraph("twothree"))))))'
		);

		clickInto(view, 1);
		press(view, 'Backspace');
		reopens('outdented');
		press(view, 'Backspace');
		reopens('merged into the item above');
		expect(view.state.doc.toString()).toBe('doc(bullet_list(list_item(paragraph("onetwothree"))))');
	});

	it('Delete pulls the next item up, and the store agrees', () => {
		type(view, '- one');
		press(view, 'Enter');
		type(view, 'two');
		press(view, 'Tab');
		clickInto(view, 0);
		view.dispatch(
			view.state.tr.setSelection(
				TextSelection.create(view.state.doc, view.state.selection.from + 3)
			)
		);
		press(view, 'Delete');
		reopens('nested item pulled up');
		expect(view.state.doc.toString()).toBe('doc(bullet_list(list_item(paragraph("onetwo"))))');
	});

	it('a numbered list split in the middle keeps its numbering', () => {
		type(view, '3. a');
		press(view, 'Enter');
		type(view, 'b');
		press(view, 'Enter');
		type(view, 'c');
		reopens('three numbered items');

		clickInto(view, 1);
		press(view, 'Tab', { shiftKey: true });
		reopens('split around the outdented item');
		const stored = decode(field.getContent(), blockSchema);
		expect([stored.child(0).attrs.start, stored.child(2).attrs.start]).toEqual([3, 5]);
	});

	it('a list pasted against another list keeps both items', () => {
		type(view, '- a');
		press(view, 'Enter');
		press(view, 'Enter'); // out of the list, into the paragraph below it
		reopens('a paragraph under the list');

		view.dispatch(view.state.tr.replaceSelection(listSlice('P')));
		reopens('pasted');
		expect(view.state.doc.toString()).toBe(
			'doc(bullet_list(list_item(paragraph("a")), list_item(paragraph("P"))))'
		);
	});

	it('a divider opened inside an item, and taken back out', () => {
		type(view, '- a');
		press(view, 'Enter');
		type(view, '---');
		reopens('a divider in its own item');
		expect(view.state.doc.toString()).toBe(
			'doc(bullet_list(list_item(paragraph("a")), list_item(horizontal_rule, paragraph)))'
		);
		press(view, 'Backspace'); // the atom link selects it
		press(view, 'Backspace'); // the press after takes it
		reopens('divider gone');
	});

	// A merge deletes the `\n` between two lines and rewrites both lines' metadata in one
	// bundle: the two things a mark and an anchor ride separately.
	it('a mark keeps its range when the items it stands in merge', () => {
		open('- **bold** one\n- two');
		clickInto(view, 1);
		press(view, 'Backspace');
		reopens('merged');
		const stored = field.getContent();
		expect(stored.text).toBe('bold onetwo');
		expect(stored.marks.map((m) => [m.type, m.start, m.end])).toEqual([['strong', 0, 4]]);
	});

	it('an identity anchor rides the merge with the text it sat in', () => {
		open('- alpha\n- beta');
		field.insertAnchor('a1', 7); // between "b" and "eta" ("alpha\nbeta")
		expect(field.anchorsInRange(7, 7)).toEqual(['a1']);
		clickInto(view, 1);
		press(view, 'Backspace');
		reopens('merged');
		expect(field.getContent().text).toBe('alphabeta');
		expect(field.anchorsInRange(6, 6)).toEqual(['a1']);
	});

	it('a whole list selected and typed over', () => {
		type(view, '- a');
		press(view, 'Enter');
		type(view, 'b');
		reopens('two items');
		view.dispatch(
			view.state.tr.setSelection(
				TextSelection.create(view.state.doc, 0, view.state.doc.content.size)
			)
		);
		type(view, 'plain');
		reopens('replaced by a paragraph');
		expect(view.state.doc.toString()).toBe('doc(paragraph("plain"))');
	});
});
