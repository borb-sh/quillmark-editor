// @vitest-environment jsdom
// Behavioral input-rule coverage, which is the only kind there is: counting the
// mounted rules proves nothing, a rule that fires at the wrong position still being
// one rule (edges.test.ts states the same). Typing is simulated the way the browser
// drives it: per-char through `handleTextInput` (the inputrules plugin's entry),
// falling back to a plain insert when no rule claims the char.
import { describe, it, expect } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
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

// `list_item` is `block+`, so `list_item > heading` is representable; and renders
// as nothing (the reference quill typesets an item's blocks as body paragraphs).
// Both routes into the shape are closed: the list shorthands normalize a heading
// they wrap, and `# ` declines inside an item.
describe('the heading/list shorthands never mint a heading inside an item', () => {
	it('`- ` typed in a heading wraps it as a PARAGRAPH item', () => {
		const view = mountView();
		type(view, '## title');
		expect(view.state.doc.toString()).toBe('doc(heading("title"))');
		// Back to the block start, then the list shorthand.
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
		type(view, '- ');
		expect(view.state.doc.toString()).toBe('doc(bullet_list(list_item(paragraph("title"))))');
		view.destroy();
	});

	it('`# ` inside a list item stays literal text', () => {
		const view = mountView();
		type(view, '- item');
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
		type(view, '# ');
		expect(view.state.doc.toString()).toBe('doc(bullet_list(list_item(paragraph("# item"))))');
		view.destroy();
	});

	it('`# ` outside a list still makes a heading', () => {
		const view = mountView();
		type(view, '### deep');
		expect(view.state.doc.toString()).toBe('doc(heading("deep"))');
		expect(view.state.doc.child(0).attrs.level).toBe(3);
		view.destroy();
	});
});

// `---` replaces its whole block, which is what the other block shorthands never do:
// a divider holds no content to retype into. So the cases are about what it consumes.
describe('the `---` divider shorthand', () => {
	it('replaces its block and opens the paragraph after it', () => {
		const view = mountView();
		type(view, '---');
		expect(view.state.doc.toString()).toBe('doc(horizontal_rule, paragraph)');
		// The caret is in the exit, not on the divider.
		expect(view.state.selection.$from.parent.type.name).toBe('paragraph');
		view.destroy();
	});

	it('keeps the block that already follows rather than opening a second', () => {
		const view = mountView();
		const { paragraph } = blockSchema.nodes;
		// A block after the caret's is the exit already; the rule adds none.
		view.dispatch(view.state.tr.insert(2, paragraph.create(null, blockSchema.text('after'))));
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
		type(view, '---');
		expect(view.state.doc.toString()).toBe('doc(horizontal_rule, paragraph("after"))');
		view.destroy();
	});

	it('stays literal when the block holds anything else', () => {
		const view = mountView();
		type(view, 'a---');
		expect(view.state.doc.toString()).toBe('doc(paragraph("a---"))');
		view.destroy();
	});

	it('stays literal inside a list item', () => {
		const view = mountView();
		type(view, '- item');
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
		type(view, '---');
		expect(view.state.doc.toString()).toBe('doc(bullet_list(list_item(paragraph("---item"))))');
		view.destroy();
	});
});
