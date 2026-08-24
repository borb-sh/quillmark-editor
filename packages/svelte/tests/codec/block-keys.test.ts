// The block link: the two Enter cases that are about the body rather than about the
// surface the caret is in — its very start, the one position no surface owns and the
// only route to a block above a first block a gap cursor will not sit beside; and a
// selection spanning two textblocks, which upstream's `splitBlock` computes against
// the pre-delete document. Driven through `bodyKeymap` over `baseKeymap`, so
// the link is under test at its place in the chain rather than on its own.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { blockSchema, bodyKeymap, decode } from '$lib/core/codec';
import { md, startOf, keyDriver, textblocks } from './_util.js';

const { expectPress, press } = keyDriver(bodyKeymap(blockSchema));

/** A state over `markdown` with the caret at `offset` in the `index`-th textblock. */
function at(markdown: string, index: number, offset: number): EditorState {
	const doc = decode(md(markdown), blockSchema);
	const block = textblocks(doc)[index];
	return EditorState.create({
		doc,
		selection: TextSelection.create(doc, block.start + offset)
	});
}

describe('a first block a gap cursor declines gets a paragraph above it', () => {
	it('a fence that opens the body', () => {
		expectPress(startOf('```\ncode\n```', 0), 'Enter', 'doc(paragraph, code_block("code"))');
	});

	it('a quote that opens the body', () => {
		expectPress(startOf('> quoted', 0), 'Enter', 'doc(paragraph, blockquote(paragraph("quoted")))');
	});

	it('a list that opens the body', () => {
		expectPress(
			startOf('- a\n- b', 0),
			'Enter',
			'doc(paragraph, bullet_list(list_item(paragraph("a")), list_item(paragraph("b"))))'
		);
	});

	it('a fence in an item that opens the body', () => {
		expectPress(
			startOf('- ```\n  code\n  ```', 0),
			'Enter',
			'doc(paragraph, bullet_list(list_item(code_block("code"))))'
		);
	});

	it('an empty fence that opens the body becomes the paragraph', () => {
		expectPress(startOf('```\n\n```', 0), 'Enter', 'doc(paragraph)');
	});

	it("an empty fence in an item that opens the body becomes the item's paragraph", () => {
		expectPress(startOf('- ```\n  \n  ```', 0), 'Enter', 'doc(bullet_list(list_item(paragraph)))');
	});

	it('the caret stays with the text it pushed down', () => {
		const next = press(startOf('```\ncode\n```', 0), 'Enter');
		expect(next.selection.$from.parent.type.name).toBe('code_block');
		expect(next.selection.$from.parentOffset).toBe(0);
	});
});

describe('everywhere else the key keeps its meaning', () => {
	it('a paragraph that opens the body splits', () => {
		expectPress(startOf('head', 0), 'Enter', 'doc(paragraph, paragraph("head"))');
	});

	it('a heading that opens the body splits', () => {
		expectPress(startOf('# head', 0), 'Enter', 'doc(paragraph, heading("head"))');
	});

	it('a fence below a block takes a newline — there is a block above to reach', () => {
		expectPress(
			at('head\n\n```\ncode\n```', 1, 0),
			'Enter',
			'doc(paragraph("head"), code_block("\\ncode"))'
		);
	});

	it('an empty fence below a block takes a newline — there is a block above to reach', () => {
		expectPress(
			at('head\n\n```\n\n```', 1, 0),
			'Enter',
			'doc(paragraph("head"), code_block("\\n"))'
		);
	});

	it('mid-fence takes a newline', () => {
		expectPress(at('```\ncode\n```', 0, 2), 'Enter', 'doc(code_block("co\\nde"))');
	});

	it('an empty first item still exits the list', () => {
		expectPress(
			startOf('- \n- b', 0),
			'Enter',
			'doc(paragraph, bullet_list(list_item(paragraph("b"))))'
		);
	});

	it('a list under a rule is still the list link', () => {
		expectPress(
			at('---\n\n- a', 0, 0),
			'Enter',
			'doc(horizontal_rule, paragraph, bullet_list(list_item(paragraph("a"))))'
		);
	});
});

describe('Enter over a selection spanning two textblocks', () => {
	/** A state over `markdown` selecting `[from, to]` in PM coordinates. */
	function span(markdown: string, from: number, to: number): EditorState {
		const doc = decode(md(markdown), blockSchema);
		return EditorState.create({
			doc,
			selection: TextSelection.between(doc.resolve(from), doc.resolve(to))
		});
	}

	// The shape is the selection's own delete plus a split at the caret it leaves:
	// upstream throws here instead, retyping a `list_item` to a paragraph.
	it("a range from a heading's head into a list", () => {
		expectPress(
			span('# head\n\n1. item\n2. two', 1, 10),
			'Enter',
			'doc(ordered_list(list_item(paragraph, paragraph("tem")), list_item(paragraph("two"))))'
		);
	});

	it("a range from a heading's head into a nested list", () => {
		expectPress(
			span('# head\n\n1. - # a\n\n   x', 1, 12),
			'Enter',
			'doc(ordered_list(list_item(bullet_list(list_item(heading, paragraph)), paragraph("x"))))'
		);
	});

	it('a range across two paragraphs', () => {
		expectPress(span('a\n\nb', 1, 5), 'Enter', 'doc(paragraph, paragraph)');
	});

	it('a range inside one textblock is still the ordinary split', () => {
		expectPress(span('head line', 1, 5), 'Enter', 'doc(paragraph, paragraph(" line"))');
	});
});
