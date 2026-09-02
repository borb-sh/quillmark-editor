// One spelling of a within-block line break, whatever gesture opens one. A range
// crossing a fence's edge is what does: the delete merges the two textblocks and the
// fence's text arrives in the survivor with its `\n`s, which the leaf's DOM collapses
// to a space while the store and the preview read them as the line boundaries they are.
//
// Driven over a state carrying the plugin, the way `proseLeafPlugins` mounts it:
// `appendTransaction` runs on `state.apply`, so the keymap chains and the normalizer
// compose here as they do in a leaf.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { blockSchema, bodyKeymap, decode, inlineSchema } from '$lib/core/codec';
import { linebreakPlugin } from '$lib/core/codec/breaks.js';
import { breakKeymap } from '$lib/core/codec/breaks.js';
import { md, endOf, keyDriver, representable, shape, startOf } from './_util.js';

const { press } = keyDriver(bodyKeymap(blockSchema));

/** A state over `markdown`, normalizer mounted, selecting PM range `[from, to]`. */
function sel(markdown: string, from: number, to: number): EditorState {
	const doc = decode(md(markdown), blockSchema);
	return EditorState.create({
		doc,
		selection: TextSelection.create(doc, from, to),
		plugins: [linebreakPlugin(blockSchema)]
	});
}

const PARA_THEN_FENCE = 'para\n\n```\nalpha\nbeta\n```';

describe('a range across a fence edge', () => {
	// `doc(paragraph("para"), code_block("alpha\nbeta"))`: PM 5 ends the paragraph's
	// text and PM 7 opens the fence's, so the range is the boundary between them and
	// nothing else.
	it('leaves breaks where Backspace merges the fence into the paragraph', () => {
		const next = press(sel(PARA_THEN_FENCE, 5, 7), 'Backspace');
		expect(shape(next)).toBe('doc(paragraph("paraalpha", hard_break, "beta"))');
		expect(representable(next)).toBe(true);
	});

	it('leaves breaks where Delete does', () => {
		const next = press(sel(PARA_THEN_FENCE, 5, 7), 'Delete');
		expect(shape(next)).toBe('doc(paragraph("paraalpha", hard_break, "beta"))');
	});

	it('leaves breaks where Enter splits what the delete merged', () => {
		const next = press(sel(PARA_THEN_FENCE, 5, 7), 'Enter');
		expect(shape(next)).toBe('doc(paragraph("para"), paragraph("alpha", hard_break, "beta"))');
		expect(representable(next)).toBe(true);
	});
});

describe('what it leaves alone', () => {
	it('a code block keeps its own newlines', () => {
		const doc = decode(md('```\nalpha\nbeta\n```'), blockSchema);
		const state = EditorState.create({
			doc,
			selection: TextSelection.create(doc, 3),
			plugins: [linebreakPlugin(blockSchema)]
		});
		expect(shape(press(state, 'Enter'))).toBe('doc(code_block("al\\npha\\nbeta"))');
	});

	it('a schema with no break node mounts it as a no-op', () => {
		const doc = decode(md('one'), inlineSchema);
		const state = EditorState.create({ doc, plugins: [linebreakPlugin(inlineSchema)] });
		expect(shape(state.apply(state.tr.insertText('x', 2)))).toBe('doc(paragraph("oxne"))');
	});
});

describe('Shift-Enter', () => {
	it('breaks the line rather than the paragraph', () => {
		const next = press(endOf('alpha', 0), 'Shift-Enter');
		expect(shape(next)).toBe('doc(paragraph("alpha", hard_break))');
		expect(representable(next)).toBe(true);
	});

	it('breaks mid-paragraph, where Enter would split', () => {
		const state = press(startOf('alphabeta', 0), 'Shift-Enter');
		expect(shape(state)).toBe('doc(paragraph(hard_break, "alphabeta"))');
	});

	it('breaks a line inside a list item without opening a second item', () => {
		const next = press(endOf('- alpha', 0), 'Shift-Enter');
		expect(shape(next)).toBe('doc(bullet_list(list_item(paragraph("alpha", hard_break))))');
		expect(representable(next)).toBe(true);
	});

	it('breaks a line inside a quote, where a paragraph would take a blank line', () => {
		const next = press(endOf('> alpha', 0), 'Shift-Enter');
		expect(shape(next)).toBe('doc(blockquote(paragraph("alpha", hard_break)))');
		expect(representable(next)).toBe(true);
	});

	it("is the fence's own newline inside one", () => {
		const next = press(endOf('```\nalpha\n```', 0), 'Shift-Enter');
		expect(shape(next)).toBe('doc(code_block("alpha\\n"))');
		expect(representable(next)).toBe(true);
	});

	it('binds nothing over a schema with no break node', () => {
		expect(breakKeymap(inlineSchema)).toEqual({});
	});
});
