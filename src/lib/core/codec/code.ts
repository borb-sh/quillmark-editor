// Code-block editing: the `code_block` link of the body's key chains.
// Tab takes LITERAL indentation here rather than a structural edit, and Enter takes
// a newline, because a code block is text the author controls to the character:
// `whitespace: 'pre'`, `marks: ''` (`schema.ts`).
//
// A code block's lines are NOT `Content` lines the codec addresses one by one: a
// fence decodes to one `code_block` whose text carries literal `\n`s, and encode
// spells it back as one `kind: 'code'` line plus a `continues: true` line per extra
// newline (`decode.ts`, `encode.ts`). So indent/outdent works on offsets inside a
// single text node, and the whole multi-line edit is ONE transaction: one undo step.
//
// The indent unit is a free choice: a literal tab and leading spaces both survive
// `importMarkdown` → the upstream normalizer → `decode` → `pmToContent` byte for
// byte, so nothing downstream re-indents either form. Spaces, because the stored
// text is what the preview typesets and a space's advance is renderer-independent;
// two of them, because a memo's typeset column is narrow. Outdent accepts BOTH
// forms regardless: imported content carries whatever its author wrote.
import type { Schema } from 'prosemirror-model';
import { TextSelection, type Command, type EditorState } from 'prosemirror-state';
import { newlineInCode } from 'prosemirror-commands';

/** One indent level. */
const UNIT = '  ';

/** The enclosing code block's content start and text, or `null` when the selection
 * is not wholly inside one: a selection that escapes the block is a document-level
 * range, where the structural links keep their meaning. */
function codeBlockAt(state: EditorState): { start: number; text: string } | null {
	const { $from, $to } = state.selection;
	if (!$from.parent.type.spec.code) return null;
	if ($from.parent !== $to.parent) return null;
	return { start: $from.start(), text: $from.parent.textContent };
}

/**
 * Start offsets of the lines the range `[f, t)` covers, in document order.
 *
 * A line whose start IS `t` is excluded on a non-empty range: a selection ending at
 * a line start does not reach into that line, the editor convention (else selecting
 * whole lines by dragging to the next line's start indents one line too many).
 */
function coveredLineStarts(text: string, f: number, t: number): number[] {
	const last = t > f ? t - 1 : t;
	const starts: number[] = [];
	let s = 0;
	for (const line of text.split('\n')) {
		if (s <= last && s + line.length >= f) starts.push(s);
		s += line.length + 1;
	}
	return starts;
}

/** Width of the indent one outdent removes at line offset `s`: a leading tab, else
 * up to one unit of leading spaces (both forms, whatever Tab inserts). `0` when the
 * line carries no indent. */
function outdentWidth(text: string, s: number): number {
	if (text[s] === '\t') return 1;
	let n = 0;
	while (n < UNIT.length && text[s + n] === ' ') n++;
	return n;
}

/**
 * Tab in a code block: insert one indent unit, or indent every covered line when the
 * selection spans a newline. A single-line selection is REPLACED by the unit: Tab
 * types, the way any other key does.
 */
const indentInCode: Command = (state, dispatch) => {
	const block = codeBlockAt(state);
	if (!block) return false;
	const { from, to } = state.selection;
	const f = from - block.start;
	const t = to - block.start;
	if (!dispatch) return true;
	const tr = state.tr;
	if (!block.text.slice(f, t).includes('\n')) {
		tr.insertText(UNIT, from, to);
	} else {
		const starts = coveredLineStarts(block.text, f, t);
		// Back to front: an earlier insert would shift every later offset.
		for (const s of [...starts].reverse()) tr.insertText(UNIT, block.start + s);
		// Keep the covered lines covered. Mapping alone would push the head past
		// the indent it just inserted at the first line's start.
		tr.setSelection(TextSelection.create(tr.doc, block.start + starts[0], tr.mapping.map(to)));
	}
	dispatch(tr.scrollIntoView());
	return true;
};

/**
 * Shift-Tab in a code block: remove one indent level from every covered line.
 *
 * Declines when no covered line carries an indent, so the key is NOT swallowed: it
 * falls through to the list link and then out of the leaf, which is the body's
 * keyboard exit from inside a code block (VISUAL_EDITOR §Chrome).
 */
const outdentInCode: Command = (state, dispatch) => {
	const block = codeBlockAt(state);
	if (!block) return false;
	const { from, to } = state.selection;
	const cuts = coveredLineStarts(block.text, from - block.start, to - block.start)
		.map((s) => ({ s, width: outdentWidth(block.text, s) }))
		.filter((c) => c.width > 0);
	if (!cuts.length) return false;
	if (dispatch) {
		const tr = state.tr;
		for (const c of cuts.reverse()) {
			tr.delete(block.start + c.s, block.start + c.s + c.width);
		}
		dispatch(tr.scrollIntoView());
	}
	return true;
};

/**
 * The `code_block` link of the body's key chains: `{}` for the inline/plaintext
 * schemas, which declare no code node.
 *
 * `Enter` is upstream's `newlineInCode`, and it is load-bearing rather than
 * cosmetic: inside a `list_item > code_block` the list link's `splitListItem`
 * otherwise splits the ITEM in two, each half holding a code block. Every command
 * here declines outside a code block, so the list links keep the keys elsewhere.
 */
export function codeKeymap(schema: Schema): Record<string, Command> {
	if (!schema.nodes.code_block) return {};
	return {
		Tab: indentInCode,
		'Shift-Tab': outdentInCode,
		Enter: newlineInCode
	};
}
