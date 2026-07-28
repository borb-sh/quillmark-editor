// The list structure keys — Tab/Shift-Tab indent-outdent, and what
// Enter/Backspace mean inside a list. Driven through the bound commands
// `listKeymap` returns, not through re-derived copies of them, so a rebinding
// breaks these.
//
// Every mutation is also checked for REPRESENTABILITY: the resulting PM doc is
// encoded, pushed through the upstream normalizer, and re-decoded. A command that
// produces a shape `Content` cannot hold would pass a doc-shape assertion and
// still lose the user's edit on commit.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { blockSchema, decode, listKeymap } from '$lib/core/codec';
import { md, atBlock, startOf, run, shape, keyDriver } from './_util.js';

const keys = listKeymap(blockSchema);
const { press, expectPress } = keyDriver(keys);

/** A state over `markdown` with the caret just after the first `caretAfter` — the
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

// Hand-built nodes for the empty-item shapes — markdown has no spelling for an
// item with no content, so these cases cannot come from `md()`.
const n = blockSchema.nodes;
const p = (text?: string) => n.paragraph.create(null, text ? blockSchema.text(text) : undefined);
const li = (...blocks: PMNode[]) => n.list_item.create(null, blocks);
const ul = (...items: PMNode[]) => n.bullet_list.create(null, items);
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

	it('at the start of the first item, opens a paragraph above the list', () => {
		expectPress(
			startOf('- a\n- b', 0),
			'Enter',
			'doc(paragraph, bullet_list(list_item(paragraph("a")), list_item(paragraph("b"))))'
		);
	});

	it('the paragraph-above gesture keeps the caret with the text it pushed down', () => {
		const next = press(startOf('- a', 0), 'Enter');
		expect(next.doc.textBetween(next.selection.from, next.doc.content.size)).toBe('a');
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
});
