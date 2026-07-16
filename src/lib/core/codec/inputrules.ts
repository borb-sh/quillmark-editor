// Input rules — the markdown-shorthand plugin (a Phase-3 deliverable the codec
// OWNS; Phase 4 decides which are mounted). `**`→strong, `*`→em, `~~`→strike,
// `` ` ``→code, `# `→heading, `- `/`1. `→lists, `> `→blockquote. Mark rules are
// hand-rolled (prosemirror-inputrules ships only node rules); block rules reuse
// `wrappingInputRule` / `textblockTypeInputRule`. These produce transactions the
// codec already lowers — they add no new lowering surface.
import {
	InputRule,
	inputRules,
	textblockTypeInputRule,
	wrappingInputRule
} from 'prosemirror-inputrules';
import type { MarkType, Schema } from 'prosemirror-model';
import type { EditorState, Plugin, Transaction } from 'prosemirror-state';

/**
 * A mark input rule: when `regexp` (ending in the closing delimiter) matches
 * before the caret, wrap capture group 1 in `markType` and drop the delimiters.
 * The captured text is in group 1; group 2 (if present) is the opening delimiter
 * consumed for smart re-triggering.
 */
function markInputRule(regexp: RegExp, markType: MarkType): InputRule {
	return new InputRule(
		regexp,
		(
			state: EditorState,
			match: RegExpMatchArray,
			start: number,
			end: number
		): Transaction | null => {
			const captured = match[1];
			if (captured == null) return null;
			const tr = state.tr;
			// Full match text; the capture sits at a known offset inside it.
			const full = match[0];
			const contentStart = start + full.indexOf(captured);
			const contentEnd = contentStart + captured.length;
			// Delete trailing delimiter, then leading, then mark the surviving content.
			if (end > contentEnd) tr.delete(contentEnd, end);
			if (contentStart > start) tr.delete(start, contentStart);
			const markFrom = start;
			const markTo = start + captured.length;
			tr.addMark(markFrom, markTo, markType.create());
			tr.removeStoredMark(markType); // don't let the mark bleed into the next char
			return tr;
		}
	);
}

/** The full markdown-shorthand rule set for a block schema. */
export function markdownInputRules(schema: Schema): InputRule[] {
	const rules: InputRule[] = [];
	const m = schema.marks;

	// Inline marks. Non-greedy capture between matching delimiters.
	if (m.strong) rules.push(markInputRule(/\*\*([^*]+)\*\*$/, m.strong));
	if (m.em) rules.push(markInputRule(/(?:^|[^*])\*([^*]+)\*$/, m.em));
	if (m.strike) rules.push(markInputRule(/~~([^~]+)~~$/, m.strike));
	if (m.code) rules.push(markInputRule(/`([^`]+)`$/, m.code));

	// Block shorthands (only where the schema has the node — the inline schema
	// omits them, so this stays a no-op there).
	if (schema.nodes.heading) {
		rules.push(
			textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, (match) => ({
				level: match[1].length
			}))
		);
	}
	if (schema.nodes.code_block) {
		rules.push(textblockTypeInputRule(/^```$/, schema.nodes.code_block));
	}
	if (schema.nodes.bullet_list) {
		rules.push(wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list));
	}
	if (schema.nodes.ordered_list) {
		rules.push(
			wrappingInputRule(
				/^(\d+)\.\s$/,
				schema.nodes.ordered_list,
				(match) => ({ start: +match[1] }),
				(match, node) => node.childCount + (node.attrs.start as number) === +match[1]
			)
		);
	}
	if (schema.nodes.blockquote) {
		rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote));
	}
	return rules;
}

/** The input-rules plugin the field mounts by default (opt-out via createField). */
export function inputRulesPlugin(schema: Schema): Plugin {
	return inputRules({ rules: markdownInputRules(schema) });
}
