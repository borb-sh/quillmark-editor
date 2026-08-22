// @vitest-environment jsdom
// The sibling boundaries `Content` cannot carry (`codec/boundaries.ts`).
//
// The claim is an equivalence rather than a table of shapes: an edit leaves a pair of
// siblings standing exactly where the content holds two, and joins it exactly where it
// does not. Both sides are read off the round-trip itself — project, normalize
// upstream, decode — so a decode rule that moves takes the expectation with it instead
// of leaving a hand-written list behind.
//
// The pair is minted by an edit in every case, never handed to `EditorState.create`:
// the guard runs on the transaction, and a document only ever arrives through decode,
// which emits no pair it would join.
import { describe, it, expect } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { Fragment, Slice } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { history, undo } from 'prosemirror-history';
import { blockSchema, boundaryPlugin, inputRulesPlugin } from '$lib/core/codec';
import { representable, textblocks } from './_util.js';

const n = blockSchema.nodes;
const p = (text?: string) => n.paragraph.create(null, text ? blockSchema.text(text) : undefined);
const li = (...blocks: PMNode[]) => n.list_item.create(null, blocks);
const ul = (...items: PMNode[]) => n.bullet_list.create(null, items);
const ol = (start: number, ...items: PMNode[]) => n.ordered_list.create({ start }, items);
const quote = (...blocks: PMNode[]) => n.blockquote.create(null, blocks);
const opaque = (container: string) =>
	n.unknown_container.create({ container, attrs: null }, p('u'));
const docOf = (...blocks: PMNode[]) => n.doc.create(null, blocks);

/** A state under the guard alone: what every edit below is dispatched against. */
function guarded(doc: PMNode, at?: number): EditorState {
	const selection = at === undefined ? undefined : TextSelection.create(doc, at);
	return EditorState.create({ doc, selection, plugins: [boundaryPlugin()] });
}

/** The document an edit appending `b` after `a` leaves the writer. */
function appended(a: PMNode, b: PMNode): PMNode {
	const state = guarded(docOf(a));
	return state.apply(state.tr.insert(state.doc.content.size, b)).doc;
}

/** The document a paste of `slice` at the start of the `index`-th textblock leaves. */
function pasted(doc: PMNode, index: number, slice: Slice): PMNode {
	const state = guarded(doc, textblocks(doc)[index].start);
	return state.apply(state.tr.replaceSelection(slice)).doc;
}

/** A clipboard slice holding whole blocks, as a copy of a whole list yields. */
const blocks = (...nodes: PMNode[]) => new Slice(Fragment.from(nodes), 0, 0);

/** Type `text` at a view the way the browser drives it (`inputrules.test.ts`). */
function type(view: EditorView, text: string): void {
	for (const ch of text) {
		const { from, to } = view.state.selection;
		const deflt = () => view.state.tr.insertText(ch, from, to);
		if (!view.someProp('handleTextInput', (f) => f(view, from, to, ch, deflt))) {
			view.dispatch(deflt());
		}
	}
}

/** A mounted leaf carrying the shorthand rules over the guard: the shorthand's own path. */
function shorthandView(doc: PMNode, index: number): EditorView {
	const state = EditorState.create({
		doc,
		selection: TextSelection.create(doc, textblocks(doc)[index].start),
		plugins: [inputRulesPlugin(blockSchema), boundaryPlugin()]
	});
	return new EditorView(document.createElement('div'), { state });
}

// One of each shape a boundary can fall between, including the three that carry a
// payload the run rule reads (an item count, an ordered `start`, a container name).
const kinds: Record<string, () => PMNode> = {
	'one-item bullet list': () => ul(li(p('a'))),
	'two-item bullet list': () => ul(li(p('a')), li(p('b'))),
	'one-item ordered list': () => ol(1, li(p('a'))),
	'two-item ordered list': () => ol(1, li(p('a')), li(p('b'))),
	'ordered list starting at 5': () => ol(5, li(p('a'))),
	quote: () => quote(p('q')),
	'two-paragraph quote': () => quote(p('q'), p('r')),
	paragraph: () => p('t'),
	heading: () => n.heading.create({ level: 1 }, blockSchema.text('h')),
	'code block': () => n.code_block.create(null, blockSchema.text('c')),
	divider: () => n.horizontal_rule.create(),
	'opaque container x': () => opaque('x'),
	'opaque container y': () => opaque('y')
};

describe('a pair an edit mints', () => {
	it('stands exactly where the content holds two of them', () => {
		for (const [aName, a] of Object.entries(kinds)) {
			for (const [bName, b] of Object.entries(kinds)) {
				const pair = docOf(a(), b());
				const left = appended(a(), b());
				expect(left.eq(pair), `${aName} + ${bName}: ${left}`).toBe(representable(pair));
			}
		}
	});

	it('survives the boundary whatever the pair was', () => {
		for (const [aName, a] of Object.entries(kinds)) {
			for (const [bName, b] of Object.entries(kinds)) {
				const left = appended(a(), b());
				expect(representable(left), `${aName} + ${bName}: ${left}`).toBe(true);
			}
		}
	});
});

describe('the joined pair keeps both halves', () => {
	it('two one-item bullet lists become one list of two items', () => {
		expect(appended(ul(li(p('a'))), ul(li(p('b')))).toString()).toBe(
			'doc(bullet_list(list_item(paragraph("a")), list_item(paragraph("b"))))'
		);
	});

	it('a one-item list before a two-item one keeps all three items', () => {
		expect(appended(ul(li(p('a'))), ul(li(p('b')), li(p('c')))).toString()).toBe(
			'doc(bullet_list(list_item(paragraph("a")), list_item(paragraph("b")), list_item(paragraph("c"))))'
		);
	});

	it('two quotes become one carrying both blocks', () => {
		expect(appended(quote(p('q')), quote(p('r'))).toString()).toBe(
			'doc(blockquote(paragraph("q"), paragraph("r")))'
		);
	});

	it('the ordered list keeps the start both halves agreed on', () => {
		const joined = appended(ol(5, li(p('a'))), ol(5, li(p('b'))));
		expect(joined.child(0).attrs.start).toBe(5);
		expect(joined.child(0).childCount).toBe(2);
	});
});

describe('what it leaves standing', () => {
	it('the ordinal-decrease boundary an import carries', () => {
		expect(appended(ul(li(p('a')), li(p('b'))), ul(li(p('c')))).childCount).toBe(2);
	});

	it('two ordered lists whose starts already say they are two', () => {
		expect(appended(ol(1, li(p('a'))), ol(5, li(p('b')))).childCount).toBe(2);
	});

	it('a bullet list beside an ordered one', () => {
		expect(appended(ul(li(p('a'))), ol(1, li(p('b')))).childCount).toBe(2);
	});

	it('two opaque containers of different kinds', () => {
		expect(appended(opaque('x'), opaque('y')).childCount).toBe(2);
	});

	it('a pair with a paragraph between it', () => {
		const state = guarded(docOf(ul(li(p('a'))), p('x'), ul(li(p('b')))));
		expect(state.apply(state.tr.insertText('!', 3)).doc.childCount).toBe(3);
	});
});

describe('the edits that reach it', () => {
	it('a list pasted into the empty paragraph above a list', () => {
		expect(pasted(docOf(p(), ul(li(p('b')))), 0, blocks(ul(li(p('P'))))).toString()).toBe(
			'doc(bullet_list(list_item(paragraph("P")), list_item(paragraph("b"))))'
		);
	});

	it('a list pasted into the empty paragraph below one', () => {
		expect(pasted(docOf(ul(li(p('a'))), p()), 1, blocks(ul(li(p('P'))))).toString()).toBe(
			'doc(bullet_list(list_item(paragraph("a")), list_item(paragraph("P"))))'
		);
	});

	it('a list pasted between two lists', () => {
		const doc = docOf(ul(li(p('a'))), p(), ul(li(p('b'))));
		expect(pasted(doc, 1, blocks(ul(li(p('P'))))).toString()).toBe(
			'doc(bullet_list(list_item(paragraph("a")), list_item(paragraph("P")), list_item(paragraph("b"))))'
		);
	});

	it('a "- " typed at the head of the paragraph above a list', () => {
		const view = shorthandView(docOf(p('x'), ul(li(p('b')))), 0);
		type(view, '- ');
		expect(view.state.doc.toString()).toBe(
			'doc(bullet_list(list_item(paragraph("x")), list_item(paragraph("b"))))'
		);
		expect(representable(view.state.doc)).toBe(true);
		view.destroy();
	});

	it('a "1. " typed at the head of the paragraph above an ordered list', () => {
		const view = shorthandView(docOf(p('x'), ol(1, li(p('b')))), 0);
		type(view, '1. ');
		expect(view.state.doc.toString()).toBe(
			'doc(ordered_list(list_item(paragraph("x")), list_item(paragraph("b"))))'
		);
		view.destroy();
	});

	it('a "> " typed at the head of the paragraph above a quote', () => {
		const view = shorthandView(docOf(p('x'), quote(p('q'))), 0);
		type(view, '> ');
		expect(view.state.doc.toString()).toBe('doc(blockquote(paragraph("x"), paragraph("q")))');
		view.destroy();
	});

	it('a sub-list opened on the continuation paragraph above one', () => {
		const view = shorthandView(docOf(ul(li(p('a'), p('x'), ul(li(p('b')))))), 1);
		type(view, '- ');
		expect(view.state.doc.toString()).toBe(
			'doc(bullet_list(list_item(paragraph("a"), bullet_list(list_item(paragraph("x")), list_item(paragraph("b"))))))'
		);
		view.destroy();
	});
});

describe('the join is part of the edit that minted the pair', () => {
	it('one undo returns the document to before the paste', () => {
		const before = docOf(p(), ul(li(p('b'))));
		const state = EditorState.create({
			doc: before,
			selection: TextSelection.create(before, 1),
			plugins: [history(), boundaryPlugin()]
		});
		const after = state.apply(state.tr.replaceSelection(blocks(ul(li(p('P'))))));
		expect(after.doc.childCount).toBe(1);

		let undone = after;
		undo(after, (tr) => {
			undone = after.apply(tr);
		});
		expect(undone.doc.toString()).toBe(before.toString());
	});
});
