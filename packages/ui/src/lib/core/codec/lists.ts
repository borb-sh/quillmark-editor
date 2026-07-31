// List editing: the body leaf's structural commands, over
// `prosemirror-schema-list` primitives. Indent/outdent on Tab, and the two
// structural keys lists redefine: Enter (split, exit an empty item, open a
// paragraph above) and Backspace (merge, or lift at the list's start).
//
// Cleanup is COMMAND-LOCAL, never a global pass: `liftToOuterList` joins the
// boundary it opens and `sinkListItem` reuses the previous item's nested list, so
// no mutation strands a node. A whole-doc normalizer would instead fuse adjacent
// same-type lists, and that boundary is load-bearing: an ordinal decrease is how
// `Content` marks one, the upstream normalizer stores it verbatim
// (`tests/codec/list-shapes.test.ts`), and fusing renumbers an imported `1, 2, 1`
// in a region no edit touched. Reads preserve it; only an edit normalizes.
import type { NodeType, Schema } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import type { Command } from 'prosemirror-state';
import { chainCommands, joinTextblockBackward } from 'prosemirror-commands';

/** The caret's enclosing `list_item` when it sits at the very start of that item's
 * FIRST block: the position both structural keys branch on. `null` otherwise
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
 * Enter at the very start of a top-level list's first item → an empty paragraph
 * above the list, caret staying with the text it pushed down.
 *
 * Only where the list itself is not inside an item: in a NESTED list this pushes
 * an empty paragraph into the parent item (`list_item` is `block+`, so the shape
 * is representable and wrong), where the conventional split (an empty item above)
 * is what the next link does. An empty first item falls through to that same
 * link, which exits the list instead.
 */
function paragraphAboveList(itemType: NodeType, paragraph: NodeType): Command {
	return (state, dispatch) => {
		const at = atItemStart(state, itemType);
		if (!at || at.nested || at.itemIndex !== 0) return false;
		if (state.selection.$from.parent.content.size === 0) return false;
		if (dispatch) dispatch(state.tr.insert(at.listPos, paragraph.create()).scrollIntoView());
		return true;
	};
}

/**
 * Backspace at the start of a list's FIRST item → lift it: one level out for a
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
 * Backspace at the start of any LATER item → join its text into the previous
 * item's last block, so the two items become one line.
 *
 * Not the base keymap's `joinBackward`, which merges the BLOCK and leaves
 * `list_item(paragraph, paragraph)`: the item's marker gone while its text stays
 * on its own line, which the reference quill typesets as an unnumbered
 * continuation paragraph.
 */
function mergeIntoPreviousItem(itemType: NodeType): Command {
	return (state, dispatch, view) => {
		const at = atItemStart(state, itemType);
		if (!at || at.itemIndex === 0) return false;
		return joinTextblockBackward(state, dispatch, view);
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
 * of them every link returns false and the key is NOT swallowed: Tab keeps its
 * default meaning, which is the body's only keyboard exit and the open seam for a
 * shell structural keymap (VISUAL_EDITOR §Settled and open).
 *
 * `Enter` is a chain in precedence order: the paragraph-above gesture, then
 * `splitListItem`, then `liftListItem`. The middle link carries two behaviors of
 * its own: it splits a non-empty item, and on an empty item it either splits the
 * WRAPPING item (a nested empty item, so Enter lifts exactly one level) or bails
 * so the third link lifts a top-level empty item out to a paragraph. `Backspace`
 * forks on the item's index: the first item lifts, any later one merges.
 */
export function listKeymap(schema: Schema): Record<string, Command> {
	const itemType = schema.nodes.list_item;
	const paragraph = schema.nodes.paragraph;
	if (!itemType || !paragraph) return {};
	return {
		Tab: sinkListItem(itemType),
		'Shift-Tab': liftListItem(itemType),
		Enter: chainCommands(
			paragraphAboveList(itemType, paragraph),
			splitListItem(itemType),
			liftListItem(itemType)
		),
		Backspace: chainCommands(liftAtListStart(itemType), mergeIntoPreviousItem(itemType))
	};
}
