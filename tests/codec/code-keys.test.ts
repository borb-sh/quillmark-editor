// The code-block keys (issue #84) — Tab/Shift-Tab as literal indentation, Enter as
// a newline. Driven through `bodyKeymap`, the composed chains the leaf binds, so
// these cover PRECEDENCE as much as the commands: the code link is only correct
// relative to the list link it sits ahead of.
//
// Every mutation is also checked for REPRESENTABILITY — encode → the upstream
// normalizer → decode is a fixpoint — because indentation is only real if it
// survives the boundary verbatim.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import type { Node as PMNode } from 'prosemirror-model';
import { blockSchema, bodyKeymap, decode, pmToContent } from '$lib/core/codec';
import { baseKeymap } from 'prosemirror-commands';
import { md, normalize } from './_util.js';

const keys = bodyKeymap(blockSchema);

/** Content start of the doc's first `code_block` — the origin every offset below
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

/** Run `cmd`; the new state, or null when the command declined the key. */
function run(state: EditorState, cmd: Command): EditorState | null {
	let out: EditorState | null = null;
	const handled = cmd(state, (tr) => {
		out = state.apply(tr);
	});
	return handled ? out : null;
}

/** Run the leaf's binding for `key`, falling through to the base keymap exactly as
 * the plugin stack does (`proseLeafPlugins` mounts `editorKeymap` over `baseKeymap`). */
function press(state: EditorState, key: string): EditorState {
	const bound = keys[key] ? run(state, keys[key]) : null;
	if (bound) return bound;
	const base = baseKeymap[key] ? run(state, baseKeymap[key]) : null;
	return base ?? state;
}

const shape = (state: EditorState): string => state.doc.toString();

/** The mutation survives the boundary: encode → normalize → decode is a fixpoint. */
function representable(state: EditorState): boolean {
	const stored = normalize(pmToContent(state.doc));
	return decode(stored, blockSchema).toString() === state.doc.toString();
}

/** Assert a press's result AND its representability in one place. */
function expectPress(state: EditorState, key: string, expected: string): EditorState {
	const next = press(state, key);
	expect(shape(next)).toBe(expected);
	expect(representable(next), `not representable: ${shape(next)}`).toBe(true);
	return next;
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
// are all wrong — Tab nests the ITEM, Shift-Tab lifts the block clean out of the
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
	/** A caret at the start of the doc's `index`-th textblock. */
	function startOf(markdown: string, index: number): EditorState {
		const doc = decode(md(markdown), blockSchema);
		const blocks: number[] = [];
		doc.descendants((node, pos) => {
			if (node.isTextblock) blocks.push(pos + 1);
			return !node.isTextblock;
		});
		return EditorState.create({ doc, selection: TextSelection.create(doc, blocks[index]) });
	}

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
