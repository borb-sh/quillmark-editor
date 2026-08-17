// The block shapes, as commands. A markdown shorthand and a slash pick are two doors
// onto the same construct, and what makes a second door cost a row rather than a second
// thing to keep true is that there is one implementation behind both: `inputrules.ts`
// runs these under a regexp, `slash.ts` under a name.
//
// A shorthand's `^` anchors it to the head of a textblock, so every command here
// declines anywhere else and a pick does what the shorthand would have done there —
// the trigger run consumed, the caret at the block's head. The menu asks each command
// whether it would run rather than restating its guards (§`slashItems`), so the two
// doors cannot disagree about where they open.
import type { Attrs, Node as PMNode, NodeType, ResolvedPos } from 'prosemirror-model';
import { Selection } from 'prosemirror-state';
import type { Command, EditorState, Transaction } from 'prosemirror-state';
import { canJoin, findWrapping } from 'prosemirror-transform';

/** The head of a textblock: where a shorthand fires, and where a pick lands once its
 *  run is consumed. */
function atHead(state: EditorState): boolean {
	const { $from, empty } = state.selection;
	return empty && $from.parent.isTextblock && $from.parentOffset === 0;
}

/** Whether the caret's parent holds `type` in its block's place. `setBlockType` and
 *  `replaceWith` both mint the shape without asking. */
function fits($from: ResolvedPos, type: NodeType): boolean {
	return $from.node(-1).canReplaceWith($from.index(-1), $from.indexAfter(-1), type);
}

/**
 * The head of an item that already exists: where a list shorthand is the text an author
 * typed rather than a shorthand at all.
 *
 * Firing there wraps the item's own paragraph in a fresh list, minting an item whose
 * only content is another item — a level with nothing on it. Tab is the indent gesture
 * and lands the shape a nesting is supposed to have, under the previous sibling. A
 * later block of the item is not this case: wrapping a continuation paragraph is how a
 * sub-list opens under text.
 */
function openingAnItem($from: ResolvedPos, item: NodeType | undefined): boolean {
	if (!item || $from.depth < 2) return false;
	return $from.node(-1).type === item && $from.index(-1) === 0;
}

/** Retype the caret's textblock. */
function retype(name: string, attrs?: Attrs): Command {
	return (state, dispatch) => {
		const type = state.schema.nodes[name];
		const { $from } = state.selection;
		if (!type || !atHead(state) || !fits($from, type)) return false;
		dispatch?.(state.tr.setBlockType($from.pos, $from.pos, type, attrs));
		return true;
	};
}

/** `wrappingInputRule`'s body: wrap the block range at `pos`, then join a preceding
 *  sibling of the same type — the one boundary the wrap itself opens (`lists.ts`
 *  §cleanup: command-local, never a global pass). */
function wrapAt(
	tr: Transaction,
	pos: number,
	type: NodeType,
	attrs: Attrs | null,
	joinBefore?: (node: PMNode) => boolean
): boolean {
	const range = tr.doc.resolve(pos).blockRange();
	const wrapping = range && findWrapping(range, type, attrs);
	if (!range || !wrapping) return false;
	tr.wrap(range, wrapping);
	const before = tr.doc.resolve(pos - 1).nodeBefore;
	if (
		before &&
		before.type === type &&
		canJoin(tr.doc, pos - 1) &&
		(!joinBefore || joinBefore(before))
	) {
		tr.join(pos - 1);
	}
	return true;
}

/** `# `: the heading `level` deep. `list_item` is `block+`, so one inside an item is a
 *  shape the content holds and `importMarkdown` produces from `- # title`. */
export function toHeading(level: number): Command {
	return retype('heading', { level });
}

/** A fence. The exit paragraph after it is the one a block island mints for the same
 *  reason, sharpened: a code block is the one block a gap cursor will not sit beside
 *  either, so a fence at the end of a body leaves the caret nowhere to go. The caret
 *  stays in the fence, not in the exit it minted. */
export function toCodeBlock(): Command {
	return (state, dispatch) => {
		const { code_block: code, paragraph } = state.schema.nodes;
		const { $from } = state.selection;
		if (!code || !paragraph || !atHead(state) || !fits($from, code)) return false;
		const tr = state.tr.setBlockType($from.pos, $from.pos, code);
		const at = tr.doc.resolve($from.pos).after();
		if (!tr.doc.nodeAt(at)) tr.insert(at, paragraph.create());
		dispatch?.(tr);
		return true;
	};
}

/** `---`. A divider is a whole block, so this replaces its textblock rather than
 *  retyping one: `horizontal_rule` holds no content to retype into, and an empty block
 *  is the whole of what it may replace — anything else in one is a paragraph being
 *  edited, which a replace would eat. */
export function insertDivider(): Command {
	return (state, dispatch) => {
		const { horizontal_rule: rule, paragraph } = state.schema.nodes;
		const { $from } = state.selection;
		if (!rule || !paragraph || !atHead(state) || !fits($from, rule)) return false;
		if ($from.parent.content.size !== 0) return false;
		const from = $from.before();
		const tr = state.tr.replaceWith(from, $from.after(), rule.create());
		const at = from + 1;
		if (!tr.doc.nodeAt(at)) tr.insert(at, paragraph.create());
		tr.setSelection(Selection.near(tr.doc.resolve(at), 1));
		dispatch?.(tr);
		return true;
	};
}

/** `> `. No item guard: what this wraps an item's first block in is a container the
 *  content holds, where a list wrapping one mints an item whose only content is an
 *  item. */
export function wrapInQuote(): Command {
	return (state, dispatch) => {
		const quote = state.schema.nodes.blockquote;
		const { $from } = state.selection;
		if (!quote || !atHead(state)) return false;
		const tr = state.tr;
		if (!wrapAt(tr, $from.pos, quote, null)) return false;
		dispatch?.(tr);
		return true;
	};
}

/** `- ` / `1. `. `joinBefore` is the shorthand's ordinal test: `2. ` continues the list
 *  above where `7. ` opens one. A pick passes none, so it continues whatever is there,
 *  which is what a list under a list is. */
export function wrapInList(
	ordered: boolean,
	attrs: Attrs | null = null,
	joinBefore?: (node: PMNode) => boolean
): Command {
	return (state, dispatch) => {
		const { paragraph, list_item: item } = state.schema.nodes;
		const list = state.schema.nodes[ordered ? 'ordered_list' : 'bullet_list'];
		const { $from } = state.selection;
		if (!list || !paragraph || !atHead(state) || openingAnItem($from, item)) return false;
		const pos = $from.pos;
		const tr = state.tr;
		// A paragraph item wherever this fires: `# ` inside the item is the gesture that
		// mints `list_item > heading`, and a wrap keeping the heading is a second door onto
		// that shape. Positions survive the retype — same content, same size.
		if ($from.parent.type !== paragraph) tr.setBlockType(pos, pos, paragraph);
		if (!wrapAt(tr, pos, list, attrs, joinBefore)) return false;
		dispatch?.(tr);
		return true;
	};
}

/**
 * Run `command` in place of the text at `[from, to)`: one transaction carrying the
 * delete and the command's own steps. One rather than two because two would be two
 * commits, two undo steps and two recompiles for one gesture; the command is built
 * against the state the delete leaves, which is exactly what its steps were computed
 * for.
 *
 * `null` is a command that declined, and nothing is consumed: the shorthand stays the
 * text it was typed as.
 */
export function consuming(
	state: EditorState,
	from: number,
	to: number,
	command: Command
): { tr: Transaction; produced: Transaction } | null {
	const tr = state.tr.delete(from, to);
	let produced: Transaction | undefined;
	command(state.apply(tr), (t) => {
		produced = t;
	});
	if (!produced) return null;
	for (const step of produced.steps) tr.step(step);
	tr.setSelection(Selection.fromJSON(tr.doc, produced.selection.toJSON()));
	return { tr, produced };
}
