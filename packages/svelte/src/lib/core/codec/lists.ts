// List editing: the body leaf's structural commands, over
// `prosemirror-schema-list` primitives. Indent/outdent on Tab, and the three
// structural keys lists redefine: Enter (split, exit an empty item, open a
// paragraph where nothing above the list takes a caret), Backspace (merge, or
// lift at the list's start) and Delete (Backspace at the seam below).
//
// Cleanup is command-local, never a global pass: `liftToOuterList` joins the
// boundary it opens and `sinkListItem` reuses the previous item's nested list, so
// no mutation strands a node. A whole-doc normalizer would instead fuse adjacent
// same-type lists, and that boundary is load-bearing: `Container.instance` is how
// `Content` marks one, the upstream normalizer keeps it
// (`tests/codec/list-shapes.test.ts`), and fusing renumbers an imported `1, 2, 1`
// in a region no edit touched. Reads preserve it; only an edit normalizes.
import type { Node as PMNode, NodeType, ResolvedPos, Schema } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { EditorState, Selection, TextSelection } from 'prosemirror-state';
import type { Command, Transaction } from 'prosemirror-state';
import { chainCommands, joinTextblockBackward } from 'prosemirror-commands';

/** The caret's enclosing `list_item` when it sits at the very start of that item's
 * first block: the position both structural keys branch on. `null` otherwise
 * (mid-text, a non-first block of a multi-paragraph item, a non-empty selection),
 * which is where the key keeps its ordinary meaning. */
function atItemStart(
	state: Parameters<Command>[0],
	itemType: NodeType
): { itemIndex: number; nested: boolean; listPos: number } | null {
	const { $from, empty } = state.selection;
	if (!empty || $from.parentOffset !== 0) return null;
	if ($from.depth < 3) return null; // doc > list > item > block is the shallowest
	if ($from.node(-1).type !== itemType) return null;
	if ($from.index(-1) !== 0) return null; // a later block of the item
	return {
		itemIndex: $from.index(-2),
		nested: $from.node(-3).type === itemType,
		listPos: $from.before(-2)
	};
}

/**
 * The textblock at the end of `node`: `node` itself where it is one, else its last
 * descendant that is — the block a caret above a boundary lands in, and the block a
 * join across one reaches, `joinTextblockBackward` walking to the same one. `null` on
 * an atom (an island, a rule), which `prosemirror-gapcursor` declines to sit beside
 * too, its `closedBefore` asking this question from the other side.
 */
function lastBlockIn(node: PMNode | null | undefined): PMNode | null {
	let last = node ?? null;
	while (last && !last.isTextblock && !last.isAtom) last = last.lastChild;
	return last?.isTextblock ? last : null;
}

/**
 * Whether a caret already fits immediately above the list at `pos`. The node ending
 * there answers for its last child, so a quote counts through its final paragraph; a
 * list opening its parent has no node there at all.
 */
function writableAbove(doc: PMNode, pos: number): boolean {
	return !!lastBlockIn(doc.resolve(pos).nodeBefore);
}

/**
 * Enter at the very start of a top-level list's first item, where nothing above the
 * list takes a caret → an empty paragraph above it, caret staying with the text it
 * pushed down. A list under an island or a rule has nowhere above to write and
 * nothing else that opens one; a list that opens the body is the block link's, which
 * answers the same fact for every block ahead of this chain (`blocks.ts`). Where a
 * caret already fits above, the key is the conventional split instead, at every item
 * alike: an escape a writer reaches by pressing Up needs no key of its own.
 *
 * Also only where the list itself is not inside an item: in a nested list this
 * pushes an empty paragraph into the parent item (`list_item` is `block+`, so the
 * shape is representable and wrong), where the conventional split (an empty item
 * above) is what the next link does. An empty first item falls through to that same
 * link, which exits the list instead.
 */
function paragraphAboveList(itemType: NodeType, paragraph: NodeType): Command {
	return (state, dispatch) => {
		const at = atItemStart(state, itemType);
		if (!at || at.nested || at.itemIndex !== 0) return false;
		if (state.selection.$from.parent.content.size === 0) return false;
		if (writableAbove(state.doc, at.listPos)) return false;
		if (dispatch) dispatch(state.tr.insert(at.listPos, paragraph.create()).scrollIntoView());
		return true;
	};
}

/**
 * Backspace at the start of a list's first item → lift it: one level out for a
 * nested item, out of the list entirely (to a paragraph) at the top.
 */
function liftAtListStart(itemType: NodeType): Command {
	return (state, dispatch) => {
		const at = atItemStart(state, itemType);
		if (!at || at.itemIndex !== 0) return false;
		return liftListItem(itemType)(state, dispatch);
	};
}

/**
 * Backspace at the start of any later item → join its text into the previous
 * item's last block, so the two items become one line.
 *
 * Not the base keymap's `joinBackward`, which merges the block and leaves
 * `list_item(paragraph, paragraph)`: the item's marker gone while its text stays
 * on its own line, which the reference quill typesets as an unnumbered
 * continuation paragraph.
 *
 * Only between two blocks of one kind. A fence is not a line to put another line on,
 * and the join across that edge would retype one side's whole text as the other's
 * (`code.ts`, which refuses the same join between siblings); the base keymap's answer
 * stands here instead, merging the items with each block kept whole.
 */
function mergeIntoPreviousItem(itemType: NodeType): Command {
	return (state, dispatch, view) => {
		const at = atItemStart(state, itemType);
		if (!at || at.itemIndex === 0) return false;
		const into = lastBlockIn(state.doc.nodeAt(at.listPos)?.child(at.itemIndex - 1));
		if (!into || !!into.type.spec.code !== !!state.selection.$from.parent.type.spec.code) {
			return false;
		}
		return joinTextblockBackward(state, dispatch, view);
	};
}

/** Whether the caret sits inside a `list_item` at any depth: a quote's paragraph
 * inside an item is still an item's, and a caret outside every list is at no seam of
 * one. */
function inItem($pos: ResolvedPos, itemType: NodeType): boolean {
	for (let depth = $pos.depth; depth > 0; depth--) {
		if ($pos.node(depth).type === itemType) return true;
	}
	return false;
}

/**
 * Delete at the very end of a block inside an item → `press`, the Backspace chain, at
 * the head of the block below: one seam, one edit, whichever side a writer approaches
 * it from. Not the base keymap's `joinForward`, which merges the blocks and leaves the
 * `list_item(paragraph, paragraph)` above.
 *
 * The reflection carries the edit and not the caret, which stays where the key was
 * pressed: a lift moves the item below, and Delete does not follow it.
 *
 * Declining wherever the chain does is what keeps this to the list's own seams: a
 * boundary inside one item, and the list's outer edge, stay the base keymap's, where
 * the two keys already answer alike.
 */
function backspaceBelow(itemType: NodeType, press: Command): Command {
	return (state, dispatch) => {
		const { $from, empty } = state.selection;
		if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
		if (!inItem($from, itemType)) return false;
		const below = Selection.near(state.doc.resolve($from.after()), 1);
		if (below.from <= $from.pos) return false;
		const pressed = $from.pos;
		const keepCaret = (tr: Transaction): void =>
			dispatch?.(tr.setSelection(TextSelection.create(tr.doc, tr.mapping.map(pressed))));
		return press(EditorState.create({ doc: state.doc, selection: below }), dispatch && keepCaret);
	};
}

/**
 * The list bindings for a block-schema leaf: `{}` for the inline/plaintext
 * schemas, which declare no list nodes.
 *
 * `Tab` / `Shift-Tab` hold the list link of the body's Tab chain. Surfaces that own
 * Tab more locally under the same rule (`prose/canon/VISUAL_EDITOR.md` §Chrome)
 * prepend a link ahead of these in `keymap.ts`: a `code_block` takes literal
 * indentation (`code.ts`), an island takes cell traversal once added. Outside all
 * of them every link returns false and the key is not swallowed: Tab keeps its
 * default meaning, which is the body's only keyboard exit and the open seam for a
 * shell structural keymap (VISUAL_EDITOR §Settled and open).
 *
 * `Enter` is a chain in precedence order: the escape-above gesture, then
 * `splitListItem`, then `liftListItem`. The middle link carries two behaviors of
 * its own: it splits a non-empty item, and on an empty item it either splits the
 * wrapping item (a nested empty item, so Enter lifts exactly one level) or bails
 * so the third link lifts a top-level empty item out to a paragraph. `Backspace`
 * forks on the item's index: the first item lifts, any later one merges. `Delete` is
 * that same chain at the seam below rather than a second table of cases beside it, so
 * the two keys cannot come to differ over a seam this link reaches. An empty line is
 * not one: the block link takes it ahead of this chain (`blocks.ts`), the caret's own
 * line being a nearer fact than the boundary under it.
 */
export function listKeymap(schema: Schema): Record<string, Command> {
	const itemType = schema.nodes.list_item;
	const paragraph = schema.nodes.paragraph;
	if (!itemType || !paragraph) return {};
	const backspace = chainCommands(liftAtListStart(itemType), mergeIntoPreviousItem(itemType));
	return {
		Tab: sinkListItem(itemType),
		'Shift-Tab': liftListItem(itemType),
		Enter: chainCommands(
			paragraphAboveList(itemType, paragraph),
			splitListItem(itemType),
			liftListItem(itemType)
		),
		Backspace: backspace,
		Delete: backspaceBelow(itemType, backspace)
	};
}
