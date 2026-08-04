// @vitest-environment jsdom
// The slash menu: the trigger's word boundary, the dismissals that edit no text, and
// a pick that consumes exactly the trigger run in ONE commit.
import { describe, it, expect, beforeAll } from 'vitest';
import type { EditorView } from 'prosemirror-view';
import { createField } from '$lib/core/codec';
import type { FieldController, LeafViews, SlashState } from '$lib/core/codec';
import { filterItems, slashItems, DEFAULT_SLASH_STRINGS } from '$lib/core/codec/slash.js';
import type { Document, TableProps } from '@quillmark/wasm';
import { mount, press, quill, md } from './_util.js';

// jsdom has no layout, and ProseMirror measures: the caret it scrolls into view
// after a structural key, and the trigger the menu anchors on. One stub for both,
// since neither number is what these tests assert.
beforeAll(() => {
	const rects = [new DOMRect()] as unknown as DOMRectList;
	Element.prototype.getClientRects = () => rects;
	Element.prototype.getBoundingClientRect = () => new DOMRect();
	Range.prototype.getClientRects = () => rects;
	Range.prototype.getBoundingClientRect = () => new DOMRect();
});

/** A body leaf over `markdown`, with the menu's reports captured. */
function leaf(markdown = 'para') {
	const doc: Document = quill().seedDocument();
	doc.overwrite({}, md(markdown));
	const reports: (SlashState | undefined)[] = [];
	const field = createField({
		doc,
		quill: quill(),
		addr: {},
		container: mount(),
		onSlash: (state) => reports.push(state)
	});
	const view = (field as FieldController & LeafViews).view;
	return { doc, field, view, reports, state: () => reports.at(-1) };
}

/** Type `text` at the caret, one character per transaction, the way a keyboard does:
 *  the trigger reads the char before the caret, so a bulk insert is a different edit. */
function type(view: EditorView, text: string): void {
	for (const ch of text) {
		view.dispatch(view.state.tr.insertText(ch, view.state.selection.head));
	}
}

/** Put the caret at a USV offset and type. */
function typeAt(field: FieldController, view: EditorView, pos: number, text: string): void {
	field.setCaret(pos);
	type(view, text);
}

describe('the trigger is a word boundary', () => {
	it('opens on `/` at the start of a textblock', () => {
		const { field, view, state } = leaf('');
		typeAt(field, view, 0, '/');
		expect(state()?.items.length).toBeGreaterThan(0);
		field.destroy();
	});

	it('opens on `/` after whitespace', () => {
		const { field, view, state } = leaf('para');
		typeAt(field, view, 4, ' /');
		expect(state()).toBeDefined();
		field.destroy();
	});

	it('stays shut mid-word, so `and/or` and a URL are prose', () => {
		const { field, view, state } = leaf('and');
		typeAt(field, view, 3, '/or');
		expect(state()).toBeUndefined();
		expect(field.getContent().text).toBe('and/or');
		field.destroy();
	});

	it('stays shut inside a code block, which reinterprets nothing', () => {
		const { field, view, state } = leaf('```\ncode\n```');
		typeAt(field, view, field.getContent().text.length, ' /');
		expect(state()).toBeUndefined();
		field.destroy();
	});

	it('is absent from a constrained inline leaf, which holds no island and no block', () => {
		const doc = quill().seedDocument();
		const reports: (SlashState | undefined)[] = [];
		const field = createField({
			doc,
			quill: quill(),
			addr: { field: 'subject' },
			container: mount(),
			inline: true,
			onSlash: (state) => reports.push(state)
		});
		const view = (field as FieldController & LeafViews).view;
		field.setCaret(0);
		type(view, '/');
		expect(reports.at(-1)).toBeUndefined();
		field.destroy();
	});
});

describe('the query filters, and a miss closes', () => {
	it('narrows on the label', () => {
		const { field, view, state } = leaf('');
		typeAt(field, view, 0, '/tab');
		expect(state()?.items.map((i) => i.id)).toEqual(['table']);
		field.destroy();
	});

	it('narrows on the id, which the label does not carry', () => {
		const { field, view, state } = leaf('');
		// `ordered` is the id; the label it draws is `Numbered list`.
		typeAt(field, view, 0, '/ord');
		expect(state()?.items.map((i) => i.id)).toEqual(['ordered']);
		field.destroy();
	});

	it('closes on a query nothing matches, leaving the text as typed', () => {
		const { field, view, state } = leaf('');
		typeAt(field, view, 0, '/zzz');
		expect(state()).toBeUndefined();
		expect(field.getContent().text).toBe('/zzz');
		field.destroy();
	});

	it('closes on a space: a menu that survives one eats a sentence', () => {
		const { field, view, state } = leaf('');
		typeAt(field, view, 0, '/ta ');
		expect(state()).toBeUndefined();
		field.destroy();
	});

	it('filters case-insensitively, over the words the chrome displays', () => {
		expect(filterItems(slashItems(DEFAULT_SLASH_STRINGS), 'BULLETED').map((i) => i.id)).toEqual([
			'bullet'
		]);
	});
});

describe('a dismissal edits no text; a pick consumes exactly the run', () => {
	it('Escape closes and leaves the trigger run in the document', () => {
		const { field, view, state } = leaf('');
		typeAt(field, view, 0, '/ta');
		press(view, 'Escape');
		expect(state()).toBeUndefined();
		expect(field.getContent().text).toBe('/ta');
		field.destroy();
	});

	it('a caret move out of the run closes it', () => {
		const { field, view, state } = leaf('para');
		typeAt(field, view, 4, ' /ta');
		field.setCaret(0);
		expect(state()).toBeUndefined();
		field.destroy();
	});

	it('an undo closes it', () => {
		const { field, view, state } = leaf('');
		typeAt(field, view, 0, '/ta');
		view.someProp('handleKeyDown', (f) =>
			f(view, new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
		);
		expect(state()).toBeUndefined();
		field.destroy();
	});

	it('the arrows walk the offers and wrap', () => {
		const { field, view, state } = leaf('');
		typeAt(field, view, 0, '/');
		const count = state()!.items.length;
		press(view, 'ArrowDown');
		expect(state()?.index).toBe(1);
		press(view, 'ArrowUp');
		press(view, 'ArrowUp');
		expect(state()?.index).toBe(count - 1);
		field.destroy();
	});

	it('Enter picks: the run is gone and the block wrapped, in ONE commit', () => {
		const { field, view, state } = leaf('');
		typeAt(field, view, 0, '/bul');
		expect(state()?.items[0].id).toBe('bullet');
		const before = view.state.doc.toString();
		press(view, 'Enter');
		expect(before).not.toBe(view.state.doc.toString());
		const stored = field.getContent();
		expect(stored.text).toBe('');
		expect(stored.lines[0].containers).toEqual([
			{ container: 'list_item', ordered: false, start: 1, ordinal: 0 }
		]);
		expect(stored.lines).toHaveLength(1); // one block, not a split and a wrap
		field.destroy();
	});

	it('a pick mid-paragraph keeps the text and takes only the run', () => {
		const { field, view } = leaf('para');
		typeAt(field, view, 4, ' /ordered');
		press(view, 'Enter');
		const stored = field.getContent();
		expect(stored.text).toBe('para ');
		expect(stored.lines[0].containers).toEqual([
			{ container: 'list_item', ordered: true, start: 1, ordinal: 0 }
		]);
		field.destroy();
	});

	it('a table pick mints the next island id and lands the caret in the first cell', () => {
		const { doc, field, view } = leaf('para');
		field.setCaret(4);
		view.dispatch(view.state.tr.split(view.state.selection.head));
		type(view, '/table');
		press(view, 'Enter');
		const body = doc.main.body;
		expect(body.islands.map((i) => i.id)).toEqual(['isl-0']);
		expect(body.islands[0].type).toBe('table');
		expect(body.islands[0].loss).toBe('lossless');
		const props = body.islands[0].props as TableProps;
		expect(props.header).toHaveLength(3);
		expect(props.rows).toHaveLength(2);
		// The island opened a line of its own, and a paragraph after it: a block island
		// at the end of a body would otherwise leave nowhere to type.
		expect(body.text).toBe('para\n￼\n');
		expect(body.lines.map((l) => l.kind)).toEqual(['para', 'island', 'para']);
		// And the caret is in the fresh table rather than on it.
		const focused = (field as FieldController & LeafViews).focusedView();
		expect((field as FieldController & LeafViews).nestedViews()).toContain(focused);
		field.destroy();
	});

	it('a pointer pick runs the same path as Enter', () => {
		const { field, view } = leaf('');
		typeAt(field, view, 0, '/bul');
		field.slashPick('bullet');
		expect(field.getContent().lines[0].containers).toEqual([
			{ container: 'list_item', ordered: false, start: 1, ordinal: 0 }
		]);
		field.destroy();
	});

	it('a pointer entering an item moves the ONE highlight the keys drive', () => {
		const { field, view, state } = leaf('');
		typeAt(field, view, 0, '/');
		field.slashFocus('ordered');
		const items = state()!.items;
		expect(items[state()!.index].id).toBe('ordered');
		field.destroy();
	});
});

describe('the menu does not disturb the body it sits in', () => {
	it('Enter with no menu open still splits a paragraph', () => {
		const { field, view } = leaf('para');
		field.setCaret(2);
		press(view, 'Enter');
		expect(field.getContent().lines).toHaveLength(2);
		field.destroy();
	});

	it('Escape with no menu open is not swallowed', () => {
		const { view } = leaf('para');
		const handled = view.someProp('handleKeyDown', (f) =>
			f(view, new KeyboardEvent('keydown', { key: 'Escape' }))
		);
		expect(handled).toBeFalsy();
	});

	it("a leaf given no `onSlash` mounts no trigger, so the keys stay the body's", () => {
		const doc = quill().seedDocument();
		doc.overwrite({}, md(''));
		const field = createField({ doc, quill: quill(), addr: {}, container: mount() });
		const view = (field as FieldController & LeafViews).view;
		field.setCaret(0);
		type(view, '/');
		// The `/` is prose, and nothing claimed Enter.
		expect(field.getContent().text).toBe('/');
		press(view, 'Enter');
		expect(field.getContent().lines).toHaveLength(2);
		field.destroy();
	});
});

describe('the menu anchors to a reference, not a measurement', () => {
	it('reports an anchor carrying the leaf as `contextElement`', () => {
		const { field, view, state } = leaf('');
		typeAt(field, view, 0, '/');
		// The field floating-ui unwraps to decide what to observe for scroll, resize and
		// layout shift (SURFACES §Anchoring). Dropping it leaves the menu anchored to
		// numbers taken at this keystroke, which nothing then refreshes.
		expect(state()?.anchor.contextElement).toBe(view.dom);
		field.destroy();
	});

	it('measures on demand, so a second read follows the leaf', () => {
		const { field, view, state } = leaf('');
		typeAt(field, view, 0, '/');
		const anchor = state()!.anchor;
		// The trigger's caret is a `Range` measure, and the stub stands in for the layout
		// jsdom has none of; moving it is the leaf scrolling under an open menu.
		let top = 10;
		Range.prototype.getBoundingClientRect = () => new DOMRect(0, top, 1, 12);
		expect(anchor.getBoundingClientRect().top).toBe(10);
		top = 90;
		expect(anchor.getBoundingClientRect().top).toBe(90);
		field.destroy();
	});

	it('holds its last rect once the position stops measuring', () => {
		const { field, view, state } = leaf('');
		typeAt(field, view, 0, '/');
		const anchor = state()!.anchor;
		Range.prototype.getBoundingClientRect = () => new DOMRect(0, 42, 1, 12);
		expect(anchor.getBoundingClientRect().top).toBe(42);
		// floating-ui calls the measure at moments none of its callers choose, a torn-down
		// view among them, so it may not throw out of a positioning pass.
		field.destroy();
		expect(() => anchor.getBoundingClientRect()).not.toThrow();
		expect(anchor.getBoundingClientRect().top).toBe(42);
	});
});
