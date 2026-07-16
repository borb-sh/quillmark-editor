// @vitest-environment jsdom
// Behavioral input-rule coverage — the rule COUNT test (edges.test.ts) cannot
// catch a rule that fires with wrong positions. Typing is simulated the way the
// browser drives it: per-char through `handleTextInput` (the inputrules plugin's
// entry), falling back to a plain insert when no rule claims the char.
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { blockSchema, inputRulesPlugin } from '$lib/core/codec';

function mountView(): EditorView {
	const state = EditorState.create({
		doc: blockSchema.nodes.doc.create(null, blockSchema.nodes.paragraph.create()),
		plugins: [inputRulesPlugin(blockSchema)]
	});
	return new EditorView(document.createElement('div'), { state });
}

function type(view: EditorView, text: string): void {
	for (const ch of text) {
		const { from, to } = view.state.selection;
		const deflt = () => view.state.tr.insertText(ch, from, to);
		const handled = view.someProp('handleTextInput', (f) => f(view, from, to, ch, deflt));
		if (!handled) view.dispatch(deflt());
	}
}

/** The first paragraph's text plus, per child, its text and mark names. */
function inlineShape(view: EditorView): { text: string; runs: [string, string[]][] } {
	const para = view.state.doc.child(0);
	const runs: [string, string[]][] = [];
	para.forEach((child) => {
		runs.push([child.text ?? '', child.marks.map((m) => m.type.name)]);
	});
	return { text: para.textContent, runs };
}

describe('mark input rules fire with exact positions', () => {
	it('*em* mid-sentence keeps the char before the delimiter', () => {
		const view = mountView();
		type(view, 'word *em*');
		expect(inlineShape(view)).toEqual({
			text: 'word em',
			runs: [
				['word ', []],
				['em', ['em']]
			]
		});
		view.destroy();
	});

	it('*em* directly after a non-space char (5*6*)', () => {
		const view = mountView();
		type(view, '5*6*');
		expect(inlineShape(view)).toEqual({
			text: '56',
			runs: [
				['5', []],
				['6', ['em']]
			]
		});
		view.destroy();
	});

	it('*em* whose prefix char equals the captured text (e*e*)', () => {
		const view = mountView();
		type(view, 'e*e*');
		expect(inlineShape(view)).toEqual({
			text: 'ee',
			runs: [
				['e', []],
				['e', ['em']]
			]
		});
		view.destroy();
	});

	it('*em* at line start', () => {
		const view = mountView();
		type(view, '*em*');
		expect(inlineShape(view)).toEqual({ text: 'em', runs: [['em', ['em']]] });
		view.destroy();
	});

	it('**strong** mid-sentence', () => {
		const view = mountView();
		type(view, 'a **b**');
		expect(inlineShape(view)).toEqual({
			text: 'a b',
			runs: [
				['a ', []],
				['b', ['strong']]
			]
		});
		view.destroy();
	});

	it('~~strike~~ and `code`', () => {
		const view = mountView();
		type(view, 'x ~~y~~');
		expect(inlineShape(view).runs).toEqual([
			['x ', []],
			['y', ['strike']]
		]);
		view.destroy();
		const view2 = mountView();
		type(view2, 'x `y`');
		expect(inlineShape(view2).runs).toEqual([
			['x ', []],
			['y', ['code']]
		]);
		view2.destroy();
	});

	it('the mark does not bleed into the next typed char', () => {
		const view = mountView();
		type(view, 'a *b* c');
		expect(inlineShape(view)).toEqual({
			text: 'a b c',
			runs: [
				['a ', []],
				['b', ['em']],
				[' c', []]
			]
		});
		view.destroy();
	});
});
