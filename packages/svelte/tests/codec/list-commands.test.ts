// The list structure keys: Tab/Shift-Tab indent-outdent, and what
// Enter/Backspace/Delete mean inside a list. Driven through the bound commands
// `listKeymap` returns, not through re-derived copies of them, so a rebinding
// breaks these.
//
// Every mutation is also checked for representability: the resulting PM doc is
// encoded, pushed through the upstream normalizer, and re-decoded. A command that
// produces a shape `Content` cannot hold would pass a doc-shape assertion and
// still lose the user's edit on commit.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { blockSchema, decode, listKeymap } from '$lib/core/codec';
import { md, atBlock, startOf, run, shape, textblocks, keyDriver } from './_util.js';

const keys = listKeymap(blockSchema);
const { press, expectPress } = keyDriver(keys);

/** A state over `markdown` with the caret just after the first `caretAfter`: the
 * mid-text position, where the keys keep their ordinary meaning. */
function after(markdown: string, caretAfter: string): EditorState {
	const doc = decode(md(markdown), blockSchema);
	let pos = -1;
	doc.descendants((node, p) => {
		if (pos < 0 && node.isText && node.text?.includes(caretAfter)) {
			pos = p + node.text.indexOf(caretAfter) + caretAfter.length;
		}
		return pos < 0;
	});
	if (pos < 0) throw new Error(`caret anchor not found: ${JSON.stringify(caretAfter)}`);
	return EditorState.create({ doc, selection: TextSelection.create(doc, pos) });
}

/** A state with the caret at the end of the `index`-th textblock: where Delete
 * branches, as `atBlock`'s start is where Backspace does. */
function endOf(doc: PMNode, index: number): EditorState {
	const block = textblocks(doc)[index];
	if (!block) throw new Error(`no textblock at index ${index}`);
	const at = block.start + block.node.content.size;
	return EditorState.create({ doc, selection: TextSelection.create(doc, at) });
}

// Hand-built nodes for the empty-item shapes: markdown has no spelling for an
// item with no content, so these cases cannot come from `md()`.
const n = blockSchema.nodes;
const p = (text?: string) => n.paragraph.create(null, text ? blockSchema.text(text) : undefined);
const li = (...blocks: PMNode[]) => n.list_item.create(null, blocks);
const ul = (...items: PMNode[]) => n.bullet_list.create(null, items);
const ol3 = (...items: PMNode[]) => n.ordered_list.create({ start: 3 }, items);
const docOf = (...blocks: PMNode[]) => n.doc.create(null, blocks);

describe('Tab / Shift-Tab change nesting depth', () => {
	it('Tab sinks an item under its previous sibling', () => {
		expectPress(
			startOf('- a\n- b', 1),
			'Tab',
			'doc(bullet_list(list_item(paragraph("a"), bullet_list(list_item(paragraph("b"))))))'
		);
	});

	it('Tab is inert on the first item at a level — nothing to sink under', () => {
		expect(run(startOf('- a\n- b', 0), keys['Tab'])).toBe(null);
	});

	it('Tab sinks from mid-text too — the caret’s offset is not the axis', () => {
		expectPress(
			after('- a\n- bc', 'b'),
			'Tab',
			'doc(bullet_list(list_item(paragraph("a"), bullet_list(list_item(paragraph("bc"))))))'
		);
	});

	it('Tab reuses the previous item’s existing nested list rather than adding one', () => {
		expectPress(
			startOf('- a\n    - b\n- c', 2),
			'Tab',
			'doc(bullet_list(list_item(paragraph("a"), bullet_list(list_item(paragraph("b")), list_item(paragraph("c"))))))'
		);
	});

	it('Shift-Tab outdents a nested item into the parent list', () => {
		expectPress(
			startOf('- a\n    - b', 1),
			'Shift-Tab',
			'doc(bullet_list(list_item(paragraph("a")), list_item(paragraph("b"))))'
		);
	});

	it('Shift-Tab on a top-level item lifts it out to a paragraph', () => {
		expectPress(
			startOf('- a\n- b', 1),
			'Shift-Tab',
			'doc(bullet_list(list_item(paragraph("a"))), paragraph("b"))'
		);
	});

	it('outdenting a middle item splits the parent list around it', () => {
		expectPress(
			startOf('- a\n    - b\n    - c\n    - d', 2),
			'Shift-Tab',
			'doc(bullet_list(list_item(paragraph("a"), bullet_list(list_item(paragraph("b")))), list_item(paragraph("c"), bullet_list(list_item(paragraph("d"))))))'
		);
	});

	it('Tab outside a list declines the key, leaving it to the shell', () => {
		const state = after('plain text', 'plain');
		expect(run(state, keys['Tab'])).toBe(null);
		expect(run(state, keys['Shift-Tab'])).toBe(null);
	});
});

describe('Enter', () => {
	it('splits a non-empty item into two', () => {
		expectPress(
			after('- ab', 'a'),
			'Enter',
			'doc(bullet_list(list_item(paragraph("a")), list_item(paragraph("b"))))'
		);
	});

	it('on an empty top-level item, exits the list to a paragraph', () => {
		expectPress(
			atBlock(docOf(ul(li(p('a')), li(p()))), 1),
			'Enter',
			'doc(bullet_list(list_item(paragraph("a"))), paragraph)'
		);
	});

	it('on an empty NESTED item, lifts exactly one level', () => {
		expectPress(
			atBlock(docOf(ul(li(p('a'), ul(li(p('b')), li(p()))))), 2),
			'Enter',
			'doc(bullet_list(list_item(paragraph("a"), bullet_list(list_item(paragraph("b")))), list_item(paragraph)))'
		);
	});

	it('at the start of a list that opens the document, opens a paragraph above it', () => {
		expectPress(
			startOf('- a\n- b', 0),
			'Enter',
			'doc(paragraph, bullet_list(list_item(paragraph("a")), list_item(paragraph("b"))))'
		);
	});

	it('the escape-above gesture keeps the caret with the text it pushed down', () => {
		const next = press(startOf('- a', 0), 'Enter');
		expect(next.doc.textBetween(next.selection.from, next.doc.content.size)).toBe('a');
	});

	// The gesture answers on exactly the shapes where a caret cannot already go, a
	// rule and an island being atoms; everywhere else Enter is the ordinary split,
	// so the key means one thing at every item a writer can escape by pressing Up.
	it('opens a paragraph above a list that follows an atom', () => {
		expectPress(
			startOf('---\n\n- a', 0),
			'Enter',
			'doc(horizontal_rule, paragraph, bullet_list(list_item(paragraph("a"))))'
		);
	});

	it('declines where the block above the list already takes a caret', () => {
		expectPress(
			startOf('intro\n\n- a\n- b', 1),
			'Enter',
			'doc(paragraph("intro"), bullet_list(list_item(paragraph), list_item(paragraph("a")), list_item(paragraph("b"))))'
		);
	});

	it('declines under a quote, whose last paragraph is a caret position', () => {
		expectPress(
			startOf('> quoted\n\n- a', 1),
			'Enter',
			'doc(blockquote(paragraph("quoted")), bullet_list(list_item(paragraph), list_item(paragraph("a"))))'
		);
	});

	it('at the start of a NESTED first item, splits instead of reaching the parent item', () => {
		expectPress(
			startOf('- a\n    - b', 1),
			'Enter',
			'doc(bullet_list(list_item(paragraph("a"), bullet_list(list_item(paragraph), list_item(paragraph("b"))))))'
		);
	});
});

describe('Backspace', () => {
	it('at the start of a non-first item, merges its text into the previous item', () => {
		expectPress(
			startOf('- a\n- b', 1),
			'Backspace',
			'doc(bullet_list(list_item(paragraph("ab"))))'
		);
	});

	it('at the start of the first item, lifts out of the list', () => {
		expectPress(
			startOf('- a\n- b', 0),
			'Backspace',
			'doc(paragraph("a"), bullet_list(list_item(paragraph("b"))))'
		);
	});

	it('at the start of a nested first item, lifts one level', () => {
		expectPress(
			startOf('- a\n    - b', 1),
			'Backspace',
			'doc(bullet_list(list_item(paragraph("a")), list_item(paragraph("b"))))'
		);
	});

	it('mid-text, declines the key so the browser deletes a character', () => {
		expect(run(after('- ab', 'a'), keys['Backspace'])).toBe(null);
	});

	it('at a later block of a multi-paragraph item, declines to the base keymap', () => {
		expect(run(atBlock(docOf(ul(li(p('a'), p('b')))), 1), keys['Backspace'])).toBe(null);
	});
});

describe('Delete', () => {
	it('at the end of an item, pulls the next item onto this line', () => {
		expectPress(after('- a\n- b', 'a'), 'Delete', 'doc(bullet_list(list_item(paragraph("ab"))))');
	});

	it('at the end of an item owning a nested list, pulls its first child up', () => {
		expectPress(
			after('- a\n    - b', 'a'),
			'Delete',
			'doc(bullet_list(list_item(paragraph("ab"))))'
		);
	});

	// The item after a nested run is an outer one, and its text still belongs on the
	// line the caret is on: the same document Backspace at that item's start lands.
	it('at the end of a nested item, pulls the outer item after it up', () => {
		expectPress(
			after('- a\n    - b\n- c', 'b'),
			'Delete',
			'doc(bullet_list(list_item(paragraph("a"), bullet_list(list_item(paragraph("bc"))))))'
		);
	});

	it('at the end of a multi-paragraph item’s first block, merges inside the item', () => {
		expectPress(
			endOf(docOf(ul(li(p('a'), p('b')), li(p('c')))), 0),
			'Delete',
			'doc(bullet_list(list_item(paragraph("ab")), list_item(paragraph("c"))))'
		);
	});

	it('mid-text, declines the key so the browser deletes a character', () => {
		expect(run(after('- ab', 'a'), keys['Delete'])).toBe(null);
	});

	// The list's outer boundary is not an item's question: what a block after the list
	// does under a Delete is the base keymap's answer, as its start under a Backspace is.
	it('at the end of the last item, declines to the base keymap', () => {
		expect(run(after('- a\n\nafter', 'a'), keys['Delete'])).toBe(null);
	});

	it('against a divider after the list, declines so the atom link answers', () => {
		const doc = docOf(ul(li(p('a'))), blockSchema.nodes.horizontal_rule.create());
		expect(run(endOf(doc, 0), keys['Delete'])).toBe(null);
	});
});

// Backspace at an item's start and Delete at the end of the line above it are one
// edit reached from two sides, so they land one document. The first item is the pair's
// one exception and has its own tests above: Backspace lifts the item out where there
// is no previous item to merge into, and Delete still merges.
describe('the merge reads the same from either side', () => {
	const cases: Record<string, [string, string, number]> = {
		'two items': ['- a\n- b', 'a', 1],
		'an outer item after a nested run': ['- a\n    - b\n- c', 'b', 2],
		'a nested item after its sibling': ['- a\n    - b\n    - c', 'b', 2],
		'an ordered pair': ['1. a\n2. b', 'a', 1]
	};
	for (const [name, [markdown, caretAfter, index]] of Object.entries(cases)) {
		it(name, () => {
			const forward = press(after(markdown, caretAfter), 'Delete');
			const backward = press(startOf(markdown, index), 'Backspace');
			expect(shape(forward)).toBe(shape(backward));
		});
	}
});

describe('ordered lists carry their numbering through a mutation', () => {
	it('Tab nests a fresh ordered list starting at 1', () => {
		expectPress(
			startOf('1. a\n2. b', 1),
			'Tab',
			'doc(ordered_list(list_item(paragraph("a"), ordered_list(list_item(paragraph("b"))))))'
		);
	});

	it('a list that starts at 3 keeps its start when an item sinks', () => {
		const next = expectPress(
			startOf('3. a\n4. b', 1),
			'Tab',
			'doc(ordered_list(list_item(paragraph("a"), ordered_list(list_item(paragraph("b"))))))'
		);
		expect(next.doc.child(0).attrs.start).toBe(3);
	});

	// A lift splits the list, and the tail is a new node: it takes the number its first
	// item already stood at, so an outdent renumbers nothing below it.
	it('outdenting a middle item starts the tail at that item’s own ordinal', () => {
		const next = expectPress(
			startOf('3. a\n4. b\n5. c', 1),
			'Shift-Tab',
			'doc(ordered_list(list_item(paragraph("a"))), paragraph("b"), ordered_list(list_item(paragraph("c"))))'
		);
		expect([next.doc.child(0).attrs.start, next.doc.child(2).attrs.start]).toEqual([3, 5]);
	});

	it('the same split from an Enter on an empty middle item', () => {
		const next = expectPress(
			atBlock(docOf(ol3(li(p('a')), li(p()), li(p('c')))), 1),
			'Enter',
			'doc(ordered_list(list_item(paragraph("a"))), paragraph, ordered_list(list_item(paragraph("c"))))'
		);
		expect(next.doc.child(2).attrs.start).toBe(5);
	});

	it('lifting the first item leaves the rest numbered where they stood', () => {
		const next = expectPress(
			startOf('3. a\n4. b', 0),
			'Backspace',
			'doc(paragraph("a"), ordered_list(list_item(paragraph("b"))))'
		);
		expect(next.doc.child(1).attrs.start).toBe(4);
	});

	it('a nested ordered list splits by the same rule', () => {
		const doc = docOf(ul(li(p('head'), ol3(li(p('x')), li(p('y')), li(p('z'))))));
		const next = expectPress(
			atBlock(doc, 2),
			'Shift-Tab',
			'doc(bullet_list(list_item(paragraph("head"), ordered_list(list_item(paragraph("x")))), list_item(paragraph("y"), ordered_list(list_item(paragraph("z"))))))'
		);
		const items = next.doc.child(0);
		expect([items.child(0).child(1).attrs.start, items.child(1).child(1).attrs.start]).toEqual([
			3, 5
		]);
	});

	it('outdenting the last item leaves no tail to renumber', () => {
		const next = expectPress(
			startOf('3. a\n4. b', 1),
			'Shift-Tab',
			'doc(ordered_list(list_item(paragraph("a"))), paragraph("b"))'
		);
		expect(next.doc.child(0).attrs.start).toBe(3);
	});
});
