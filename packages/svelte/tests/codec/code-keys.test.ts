// The code-block keys: Tab/Shift-Tab as literal indentation, Enter as
// a newline. Driven through `bodyKeymap`, the composed chains the leaf binds, so
// these cover precedence as much as the commands: the code link is only correct
// relative to the list link it sits ahead of.
//
// Every mutation is also checked for representability (encode → the upstream
// normalizer → decode is a fixpoint), because indentation is only real if it
// survives the boundary verbatim.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { blockSchema, bodyKeymap, contentEdit, decode, lower, pmToContent } from '$lib/core/codec';
import { baseKeymap } from 'prosemirror-commands';
import {
	contentEqual,
	freshDoc,
	keyDriver,
	md,
	normalize,
	run,
	shape,
	startOf,
	toMarkdown
} from './_util.js';

const keys = bodyKeymap(blockSchema);
const { press, expectPress } = keyDriver(keys);

/** Content start of the doc's first `code_block`: the origin every offset below
 * counts from, so a case reads in the code's own coordinates. */
function codeStart(doc: PMNode): number {
	let pos = -1;
	doc.descendants((node, p) => {
		if (pos < 0 && node.type === blockSchema.nodes.code_block) pos = p + 1;
		return pos < 0;
	});
	if (pos < 0) throw new Error('no code_block in doc');
	return pos;
}

/** A state over `markdown` with a selection at code offsets `[from, to]` (a caret
 * when `to` is omitted). */
function sel(markdown: string, from: number, to = from): EditorState {
	const doc = decode(md(markdown), blockSchema);
	const start = codeStart(doc);
	return EditorState.create({
		doc,
		selection: TextSelection.create(doc, start + from, start + to)
	});
}

const FENCE = '```\nfoo\nbar\n```';

describe('Tab indents', () => {
	it('inserts one unit at the caret', () => {
		expectPress(sel(FENCE, 0), 'Tab', 'doc(code_block("  foo\\nbar"))');
	});

	it('indents mid-line too — a code block takes the character, not a structure', () => {
		expectPress(sel(FENCE, 2), 'Tab', 'doc(code_block("fo  o\\nbar"))');
	});

	it('replaces a single-line selection — Tab types', () => {
		expectPress(sel(FENCE, 0, 3), 'Tab', 'doc(code_block("  \\nbar"))');
	});

	it('indents every line a multi-line selection covers', () => {
		expectPress(sel(FENCE, 1, 5), 'Tab', 'doc(code_block("  foo\\n  bar"))');
	});

	it('keeps the covered lines covered', () => {
		const next = press(sel(FENCE, 1, 5), 'Tab');
		const start = codeStart(next.doc);
		expect([next.selection.from - start, next.selection.to - start]).toEqual([0, 9]);
	});

	it('leaves out a line the selection only ends at', () => {
		// `to` sits at "bar"'s first offset: the selection does not reach into it.
		expectPress(sel(FENCE, 0, 4), 'Tab', 'doc(code_block("  foo\\nbar"))');
	});

	it('indents an empty code block', () => {
		const doc = blockSchema.nodes.doc.create(null, [blockSchema.nodes.code_block.create()]);
		const state = EditorState.create({ doc, selection: TextSelection.create(doc, 1) });
		expect(shape(press(state, 'Tab'))).toBe('doc(code_block("  "))');
	});

	it('survives the boundary as literal text', () => {
		const next = press(sel(FENCE, 1, 5), 'Tab');
		expect(normalize(pmToContent(next.doc)).text).toBe('  foo\n  bar');
	});
});

describe('Shift-Tab outdents', () => {
	it('removes one unit of spaces at the caret’s line', () => {
		expectPress(sel('```\n  foo\nbar\n```', 3), 'Shift-Tab', 'doc(code_block("foo\\nbar"))');
	});

	it('removes a literal tab — whatever Tab inserts, imported content carries either', () => {
		expectPress(sel('```\n\tfoo\nbar\n```', 2), 'Shift-Tab', 'doc(code_block("foo\\nbar"))');
	});

	it('removes a partial indent whole', () => {
		expectPress(sel('```\n foo\nbar\n```', 2), 'Shift-Tab', 'doc(code_block("foo\\nbar"))');
	});

	it('removes one level per line across a multi-line selection, either form', () => {
		expectPress(
			sel('```\n    foo\n\tbar\n```', 1, 12),
			'Shift-Tab',
			'doc(code_block("  foo\\nbar"))'
		);
	});

	it('declines when no covered line is indented — the key is not swallowed', () => {
		const state = sel(FENCE, 1);
		expect(run(state, keys['Shift-Tab'])).toBe(null);
		expect('Shift-Tab' in baseKeymap).toBe(false); // …so it reaches the browser: the leaf's exit
	});

	it('outdents only the lines it covers', () => {
		expectPress(sel('```\n  foo\n  bar\n```', 2, 4), 'Shift-Tab', 'doc(code_block("foo\\n  bar"))');
	});
});

describe('Enter takes a newline', () => {
	it('splits the line at the caret', () => {
		expectPress(sel(FENCE, 2), 'Enter', 'doc(code_block("fo\\no\\nbar"))');
	});
});

// Precedence is load-bearing rather than cosmetic: `list_item > code_block` is
// reachable from ordinary imported markdown, and the list link's own meanings there
// are all wrong; Tab nests the item, Shift-Tab lifts the block clean out of the
// list, Enter splits the item in two. The code link ahead of it is what these
// shapes guard.
describe('inside a list item, the code link wins', () => {
	const IN_ITEM = '- item\n\n    ```\n    code\n    ```';

	it('Tab indents the code instead of nesting the item', () => {
		expectPress(
			sel(IN_ITEM, 0),
			'Tab',
			'doc(bullet_list(list_item(paragraph("item"), code_block("  code"))))'
		);
	});

	it('Shift-Tab outdents the code instead of lifting it out of the list', () => {
		expectPress(
			sel('- item\n\n    ```\n      code\n    ```', 4),
			'Shift-Tab',
			'doc(bullet_list(list_item(paragraph("item"), code_block("code"))))'
		);
	});

	it('Enter takes a newline instead of splitting the item', () => {
		expectPress(
			sel(IN_ITEM, 2),
			'Enter',
			'doc(bullet_list(list_item(paragraph("item"), code_block("co\\nde"))))'
		);
	});

	it('Shift-Tab with nothing to remove falls through to the list link', () => {
		expectPress(
			sel(IN_ITEM, 0),
			'Shift-Tab',
			'doc(paragraph("item"), code_block("code"))' // the list link lifts the item
		);
	});
});

describe('outside a code block the links decline', () => {
	it('Tab still sinks a list item', () => {
		expectPress(
			startOf('- a\n- b', 1),
			'Tab',
			'doc(bullet_list(list_item(paragraph("a"), bullet_list(list_item(paragraph("b"))))))'
		);
	});

	it('Enter still splits a list item', () => {
		expectPress(
			startOf('- a\n- b', 1),
			'Enter',
			'doc(bullet_list(list_item(paragraph("a")), list_item(paragraph), list_item(paragraph("b"))))'
		);
	});

	it('Enter still splits a paragraph through the base keymap', () => {
		expectPress(startOf('one', 0), 'Enter', 'doc(paragraph, paragraph("one"))');
	});
});

// A join across a fence's edge is the one gesture that puts a literal `\n` inside a
// paragraph: `joinTextblocksAround` is a bare `replaceStep`, running neither
// `clearIncompatible` nor its whitespace pass. `paragraph: { content: 'inline*' }`
// admits the node, so the projection owes it a reading, and a line boundary is what a
// `\n` is (CODEC §Decode). These drive the whole commit path — the key, then
// `lower` → `applyChange` against a real Document — because the projection being
// *under*-specified is what the channels then do faithfully.
describe('a `\\n` inside a textblock is a line boundary', () => {
	/** Press `key` at `pos`, commit through `lower` → `applyChange`, and give back both
	 *  sides of the claim: what the store holds and what the leaf projects. */
	function commit(markdown: string, at: (doc: PMNode) => number, key: string) {
		const rt = md(markdown);
		const store = freshDoc();
		store.overwrite({}, rt);
		const opened = store.main.body;
		const doc = decode(opened, blockSchema);
		const before = EditorState.create({ doc, selection: TextSelection.create(doc, at(doc)) });
		const leaf = press(before, key).doc;
		store.applyChange({}, lower(contentEdit(opened, pmToContent(leaf))));
		return { stored: store.main.body, leaf };
	}

	// #496: the item's only block is a multi-line fence, and the caret is at its head.
	it('Backspace merging a fence into the item above leaves the store equal to the leaf', () => {
		const { stored, leaf } = commit('- a\n\n- ```\n  alpha\n  beta\n  ```', codeStart, 'Backspace');
		expect(leaf.toString()).toBe('doc(bullet_list(list_item(paragraph("aalpha\\nbeta"))))');
		expect(contentEqual(stored, normalize(pmToContent(leaf))), 'store equals leaf').toBe(true);
		expect(stored.lines).toHaveLength(2);
		expect(stored.lines[1].continues).toBe(true);
		expect(stored.lines.every((l) => l.kind === 'para')).toBe(true);
		expect(toMarkdown(stored)).toBe('- aalpha\\\n  beta');
	});

	it('the projection reads one for every textblock kind', () => {
		for (const block of [
			blockSchema.nodes.paragraph.create(null, blockSchema.text('a\nb')),
			blockSchema.nodes.heading.create({ level: 2 }, blockSchema.text('a\nb'))
		]) {
			const rt = pmToContent(blockSchema.nodes.doc.create(null, block));
			expect(rt.text).toBe('a\nb');
			expect(rt.lines).toHaveLength(2);
			expect(rt.lines[1].continues).toBe(true);
			expect(contentEqual(normalize(rt), normalize(rt)), 'the store accepts it').toBe(true);
		}
	});

	it('a mark over the break lands on both lines', () => {
		const strong = blockSchema.marks.strong.create();
		const rt = pmToContent(
			blockSchema.nodes.doc.create(
				null,
				blockSchema.nodes.paragraph.create(null, blockSchema.text('a\nb', [strong]))
			)
		);
		expect(rt.marks).toEqual([
			{ start: 0, end: 1, type: 'strong' },
			{ start: 2, end: 3, type: 'strong' }
		]);
	});
});

// `hard_break` declares `linebreakReplacement`, so the passes that do run —
// `clearIncompatible` and `setBlockType` — convert `\n` ⇄ `hard_break` rather than
// flattening a fence's lines to spaces.
describe('retyping a fence keeps its lines', () => {
	const toParagraph = (s: EditorState) =>
		s.tr.setBlockType(0, s.doc.content.size, blockSchema.nodes.paragraph);
	const toCode = (s: EditorState) =>
		s.tr.setBlockType(0, s.doc.content.size, blockSchema.nodes.code_block);

	it('a code block retyped to a paragraph breaks where it wrapped', () => {
		const state = EditorState.create({ doc: decode(md(FENCE), blockSchema) });
		expect(state.apply(toParagraph(state)).doc.toString()).toBe(
			'doc(paragraph("foo", hard_break, "bar"))'
		);
	});

	it("and back, its breaks the fence's own newlines", () => {
		const start = EditorState.create({ doc: decode(md(FENCE), blockSchema) });
		const prose = start.apply(toParagraph(start));
		expect(prose.apply(toCode(prose)).doc.toString()).toBe('doc(code_block("foo\\nbar"))');
	});
});
