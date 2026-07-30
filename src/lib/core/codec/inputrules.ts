// Input rules: the markdown-shorthand plugin the codec owns (`**`→strong, `*`→em,
// `~~`→strike, `` ` ``→code, `# `→heading, `- `/`1. `→lists, `> `→blockquote).
// Mark rules are hand-rolled (prosemirror-inputrules ships only node rules); block
// rules reuse `wrappingInputRule` / `textblockTypeInputRule`. These produce
// transactions the codec already lowers: they add no new lowering surface.
import {
	InputRule,
	inputRules,
	textblockTypeInputRule,
	wrappingInputRule
} from 'prosemirror-inputrules';
import type { Attrs, MarkType, Node as PMNode, NodeType, Schema } from 'prosemirror-model';
import { canJoin, findWrapping } from 'prosemirror-transform';
import type { EditorState, Plugin, Transaction } from 'prosemirror-state';

/**
 * A mark input rule: when `regexp` (ending in the closing delimiter) matches
 * before the caret, wrap capture group 1 in `markType` and drop the delimiters.
 * `delimLen` is the delimiter length (opening == closing for every rule here).
 * `match[0]` anatomy is `prefix? open captured close`: the em rule's
 * `(?:^|[^*])` guard consumes ONE non-delimiter prefix char into the match, so
 * positions are derived from the KNOWN delimiter/capture lengths, never from
 * `indexOf` (which both deletes that prefix char and mis-anchors when it
 * happens to equal the captured text). `[start, end)` spans `match[0]` minus
 * the just-typed text (not yet inserted when the rule fires), so the trailing
 * delete covers only the closing-delimiter chars actually in the doc.
 */
function markInputRule(regexp: RegExp, markType: MarkType, delimLen: number): InputRule {
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
			const prefixLen = match[0].length - (captured.length + 2 * delimLen);
			const openStart = start + prefixLen;
			const contentStart = openStart + delimLen;
			const contentEnd = contentStart + captured.length;
			// Delete trailing delimiter, then leading, then mark the surviving content.
			if (end > contentEnd) tr.delete(contentEnd, end);
			tr.delete(openStart, contentStart);
			tr.addMark(openStart, openStart + captured.length, markType.create());
			tr.removeStoredMark(markType); // don't let the mark bleed into the next char
			return tr;
		}
	);
}

/**
 * `wrappingInputRule` (whose body this mirrors), plus one normalization: a
 * `heading` being wrapped becomes a `paragraph` first.
 *
 * `list_item` is `block+`, so `list_item > heading` is *representable* and a bare
 * wrap mints it (a shape no quill renders): the reference quill derives an item's
 * numbering and indent from the container path and typesets the item's blocks as
 * body paragraphs (`usaf_memo`'s `render-body`), where a heading resolves to
 * nothing. This is the wrap-side route into that shape; the `# ` rule guards the
 * other, in {@link markdownInputRules}.
 */
function listWrappingRule(
	regexp: RegExp,
	listType: NodeType,
	paragraph: NodeType,
	getAttrs?: (match: RegExpMatchArray) => Attrs | null,
	joinPredicate?: (match: RegExpMatchArray, node: PMNode) => boolean
): InputRule {
	return new InputRule(
		regexp,
		(state: EditorState, match: RegExpMatchArray, start: number, end: number) => {
			const attrs = getAttrs ? getAttrs(match) : null;
			const tr = state.tr.delete(start, end);
			// Positions survive the retype: same content, same size.
			if (tr.doc.resolve(start).parent.type !== paragraph) {
				tr.setBlockType(start, start, paragraph);
			}
			const $start = tr.doc.resolve(start);
			const range = $start.blockRange();
			const wrapping = range && findWrapping(range, listType, attrs);
			if (!range || !wrapping) return null;
			tr.wrap(range, wrapping);
			// Join a preceding list of the same type: the one boundary this rule
			// itself opens (`lists.ts` §cleanup: command-local, never a global pass).
			const before = tr.doc.resolve(start - 1).nodeBefore;
			if (
				before &&
				before.type === listType &&
				canJoin(tr.doc, start - 1) &&
				(!joinPredicate || joinPredicate(match, before))
			) {
				tr.join(start - 1);
			}
			return tr;
		}
	);
}

/** The full markdown-shorthand rule set for a block schema. */
export function markdownInputRules(schema: Schema): InputRule[] {
	const rules: InputRule[] = [];
	const m = schema.marks;

	// Inline marks. Non-greedy capture between matching delimiters.
	if (m.strong) rules.push(markInputRule(/\*\*([^*]+)\*\*$/, m.strong, 2));
	if (m.em) rules.push(markInputRule(/(?:^|[^*])\*([^*]+)\*$/, m.em, 1));
	if (m.strike) rules.push(markInputRule(/~~([^~]+)~~$/, m.strike, 2));
	if (m.code) rules.push(markInputRule(/`([^`]+)`$/, m.code, 1));

	// Block shorthands (only where the schema has the node; the inline schema
	// omits them, so this stays a no-op there).
	if (schema.nodes.heading) {
		// `textblockTypeInputRule`'s body plus one guard: inside a list item, `# `
		// declines (null) and stays literal text, rather than minting the unrenderable
		// `list_item > heading` {@link listWrappingRule} normalizes away on the wrap side.
		const heading = schema.nodes.heading;
		const item = schema.nodes.list_item;
		rules.push(
			new InputRule(
				/^(#{1,6})\s$/,
				(state: EditorState, match: RegExpMatchArray, start: number, end: number) => {
					const $start = state.doc.resolve(start);
					for (let d = $start.depth; d > 0; d--) {
						if (item && $start.node(d).type === item) return null;
					}
					if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), heading)) {
						return null;
					}
					return state.tr
						.delete(start, end)
						.setBlockType(start, start, heading, { level: match[1].length });
				}
			)
		);
	}
	if (schema.nodes.code_block) {
		rules.push(textblockTypeInputRule(/^```$/, schema.nodes.code_block));
	}
	// The list shorthands are the ONLY entry point that starts a list:
	// there is no toggle command and no toolbar affordance, so `- ` / `1. ` at the
	// start of a block is how one begins, here or nested inside an item.
	if (schema.nodes.bullet_list && schema.nodes.paragraph) {
		rules.push(
			listWrappingRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list, schema.nodes.paragraph)
		);
	}
	if (schema.nodes.ordered_list && schema.nodes.paragraph) {
		rules.push(
			listWrappingRule(
				/^(\d+)\.\s$/,
				schema.nodes.ordered_list,
				schema.nodes.paragraph,
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
