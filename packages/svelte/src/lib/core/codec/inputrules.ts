// Input rules: the markdown-shorthand plugin the codec owns (`**`→strong, `*`→em,
// `~~`→strike, `` ` ``→code, `# `→heading, `- `/`1. `→lists, `> `→blockquote,
// `---`→divider).
// Mark rules are hand-rolled (prosemirror-inputrules ships only node rules); the one
// block rule with no guard of its own reuses `wrappingInputRule`, and the rest mirror
// an upstream body around one. These produce transactions the codec already lowers:
// they add no new lowering surface.
//
// A rule declines only where what it would mint is unrepresentable, or is a shape
// another gesture owns — never on how a quill renders it. What a quill typesets is not
// knowable here (a quill this build has not seen is the open-sets case, CODEC §"Open
// sets"), and a construct that arrives through `importMarkdown` must stay authorable or
// a document opens carrying a shape the editor refuses to make. So one guard survives:
// `- ` / `1. ` at the head of an existing item, where Tab owns the nesting.
import { InputRule, inputRules, wrappingInputRule } from 'prosemirror-inputrules';
import type {
	Attrs,
	MarkType,
	Node as PMNode,
	NodeType,
	ResolvedPos,
	Schema
} from 'prosemirror-model';
import { canJoin, findWrapping } from 'prosemirror-transform';
import { Selection } from 'prosemirror-state';
import type { EditorState, Plugin, Transaction } from 'prosemirror-state';

/**
 * A mark input rule: when `regexp` (ending in the closing delimiter) matches
 * before the caret, wrap capture group 1 in `markType` and drop the delimiters.
 * `delimLen` is the delimiter length (opening == closing for every rule here).
 * `match[0]` anatomy is `prefix? open captured close`: the em rule's
 * `(?:^|[^*])` guard consumes one non-delimiter prefix char into the match, so
 * positions are derived from the known delimiter/capture lengths, never from
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
 * `list_item` is `block+`, so `list_item > heading` is *representable*, and `# `
 * inside the item is the gesture that mints it ({@link markdownInputRules}). A wrap
 * keeping the heading would be a second door onto that shape, so `- ` / `1. ` mint a
 * paragraph item wherever they fire.
 *
 * `item` is the second guard, and it is about the gesture rather than the shape: the
 * rule declines at the start of an item's own first block ({@link openingAnItem}).
 */
function listWrappingRule(
	regexp: RegExp,
	listType: NodeType,
	paragraph: NodeType,
	item: NodeType | undefined,
	getAttrs?: (match: RegExpMatchArray) => Attrs | null,
	joinPredicate?: (match: RegExpMatchArray, node: PMNode) => boolean
): InputRule {
	return new InputRule(
		regexp,
		(state: EditorState, match: RegExpMatchArray, start: number, end: number) => {
			if (openingAnItem(state.doc.resolve(start), item)) return null;
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

/**
 * Whether `$start` is the head of an item that already exists: offset 0 of a
 * `list_item`'s first block, which is where a list shorthand is the text an author
 * typed rather than a shorthand at all.
 *
 * Firing there wraps the item's own paragraph in a fresh list, minting an item whose
 * only content is another item — a level with nothing on it. Tab is the indent gesture
 * and lands the shape a nesting is supposed to have, under the previous sibling, so
 * what the rule adds here is a second door onto a worse answer. A later block of the
 * item is not this case: wrapping a continuation paragraph is how a sub-list opens
 * under text.
 */
function openingAnItem($start: ResolvedPos, item: NodeType | undefined): boolean {
	if (!item || $start.depth < 2 || $start.parentOffset !== 0) return false;
	return $start.node(-1).type === item && $start.index(-1) === 0;
}

/** The full markdown-shorthand rule set for a block schema. */
export function markdownInputRules(schema: Schema): InputRule[] {
	const rules: InputRule[] = [];
	const m = schema.marks;
	const item = schema.nodes.list_item;

	// Inline marks. Non-greedy capture between matching delimiters.
	if (m.strong) rules.push(markInputRule(/\*\*([^*]+)\*\*$/, m.strong, 2));
	if (m.em) rules.push(markInputRule(/(?:^|[^*])\*([^*]+)\*$/, m.em, 1));
	if (m.strike) rules.push(markInputRule(/~~([^~]+)~~$/, m.strike, 2));
	if (m.code) rules.push(markInputRule(/`([^`]+)`$/, m.code, 1));

	// Block shorthands (only where the schema has the node; the inline schema
	// omits them, so this stays a no-op there).
	if (schema.nodes.heading) {
		// `textblockTypeInputRule`'s body. It fires inside a list item like anywhere else:
		// `list_item > heading` is a shape the content holds and `importMarkdown` produces
		// from `- # title`, so a rule that declined there would refuse to author what a
		// document can arrive carrying.
		const heading = schema.nodes.heading;
		rules.push(
			new InputRule(
				/^(#{1,6})\s$/,
				(state: EditorState, match: RegExpMatchArray, start: number, end: number) => {
					const $start = state.doc.resolve(start);
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
	if (schema.nodes.code_block && schema.nodes.paragraph) {
		// `textblockTypeInputRule`'s body plus the exit the `---` rule mints below, for a
		// sharper version of its reason: a code block is the one block a GAP CURSOR will
		// not sit beside either (`closedBefore`/`closedAfter` both fail on a textblock), so
		// a fence at the end of a body leaves the caret with no way forward at all.
		const code = schema.nodes.code_block;
		const paragraph = schema.nodes.paragraph;
		rules.push(
			new InputRule(
				/^```$/,
				(state: EditorState, _match: RegExpMatchArray, start: number, end: number) => {
					const $start = state.doc.resolve(start);
					if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), code)) {
						return null;
					}
					const tr = state.tr.delete(start, end).setBlockType(start, start, code);
					const at = tr.doc.resolve(start).after();
					if (!tr.doc.nodeAt(at)) tr.insert(at, paragraph.create());
					// The caret stays in the fence, not in the exit it minted.
					return tr;
				}
			)
		);
	}
	if (schema.nodes.horizontal_rule && schema.nodes.paragraph) {
		// A divider is a whole block, so this rule replaces its textblock rather than
		// retyping one: `horizontal_rule` holds no content to retype into.
		const rule = schema.nodes.horizontal_rule;
		const paragraph = schema.nodes.paragraph;
		rules.push(
			new InputRule(
				/^---$/,
				(state: EditorState, _match: RegExpMatchArray, start: number, end: number) => {
					const $start = state.doc.resolve(start);
					// The block entirely, not a prefix of one. `[start, end)` is the match minus
					// the just-typed `-`, so the block holds `--` when this fires; anything else
					// in it is a paragraph being edited, which a replace would eat.
					if ($start.parentOffset !== 0 || $start.parent.content.size !== end - start) {
						return null;
					}
					if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), rule)) {
						return null;
					}
					const from = $start.before();
					const tr = state.tr.replaceWith(from, $start.after(), rule.create());
					// A divider at the end of a body leaves nowhere to type; the paragraph after
					// it is the exit, and it is where the caret lands (`slash.ts` §insertBlock
					// opens the same block for the same reason).
					const at = from + 1;
					if (!tr.doc.nodeAt(at)) tr.insert(at, paragraph.create());
					tr.setSelection(Selection.near(tr.doc.resolve(at), 1));
					return tr;
				}
			)
		);
	}
	// `- ` / `1. ` at the start of a block, here or nested inside an item — but not at
	// the start of an item's own first block, where {@link openingAnItem} declines.
	if (schema.nodes.bullet_list && schema.nodes.paragraph) {
		rules.push(
			listWrappingRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list, schema.nodes.paragraph, item)
		);
	}
	if (schema.nodes.ordered_list && schema.nodes.paragraph) {
		rules.push(
			listWrappingRule(
				/^(\d+)\.\s$/,
				schema.nodes.ordered_list,
				schema.nodes.paragraph,
				item,
				(match) => ({ start: +match[1] }),
				(match, node) => node.childCount + (node.attrs.start as number) === +match[1]
			)
		);
	}
	// No item guard: a quote wrapping an item's own first block is a container the
	// content holds, where a list wrapping one is an item whose only content is an item.
	if (schema.nodes.blockquote) {
		rules.push(wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote));
	}
	return rules;
}

/** The input-rules plugin the field mounts by default (opt-out via createField). */
export function inputRulesPlugin(schema: Schema): Plugin {
	return inputRules({ rules: markdownInputRules(schema) });
}
