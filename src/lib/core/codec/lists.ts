// List editing — the body leaf's structural commands (issue #70), over
// `prosemirror-schema-list` primitives. Indent/outdent on Tab, and the two
// structural keys lists redefine: Enter (split, exit an empty item, open a
// paragraph above) and Backspace (merge, or lift at the list's start).
//
// Cleanup is COMMAND-LOCAL, never a global pass. `liftToOuterList` already joins
// the boundary it opens and `sinkListItem` reuses the previous item's nested list,
// so no mutation leaves a stray or fragmented node. A normalizer over the whole
// doc would instead FUSE adjacent same-type lists — and that shape is load-bearing:
// an ordinal decrease is how `Content` marks a sibling-list boundary, the upstream
// normalizer preserves it verbatim (`tests/codec/list-shapes.test.ts`), and fusing
// would silently renumber an imported `1, 2, 1` to `1, 2, 3` in a region the user
// never touched. Reads preserve the boundary; only what an edit touches normalizes.
import type { NodeType, Schema } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import type { Command } from 'prosemirror-state';
import { chainCommands, joinTextblockBackward } from 'prosemirror-commands';

/** The caret's enclosing `list_item` when it sits at the very start of that item's
 * FIRST block — the position both structural keys branch on. `null` otherwise
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
 * Only where the list itself is not inside an item: in a NESTED list this would
 * push an empty paragraph into the parent item (`list_item` is `block+`, so the
 * shape is representable and merely wrong), and the conventional split — an empty
 * item above — is what `splitListItem` already does one link later in the chain.
 * An empty first item is left to that same fallthrough, which exits the list
 * rather than decorating it with a paragraph.
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
 * Not the base keymap's `joinBackward`, which merges the BLOCK instead and leaves
 * `list_item(paragraph, paragraph)`: the item's marker silently gone while its text
 * stays on its own line — a shape the reference quill typesets as an unnumbered
 * continuation paragraph, so the edit reads as "my bullet disappeared".
 */
function mergeIntoPreviousItem(itemType: NodeType): Command {
	return (state, dispatch, view) => {
		const at = atItemStart(state, itemType);
		if (!at || at.itemIndex === 0) return false;
		return joinTextblockBackward(state, dispatch, view);
	};
}

/**
 * The body's `Tab` / `Shift-Tab` chains. Bound as chains because two other
 * surfaces own Tab more locally under the same rule (`prose/canon/VISUAL_EDITOR.md`
 * §Chrome): a `code_block` takes literal indentation (issue #84) and an island
 * takes cell traversal (issue #16). Each prepends a link here rather than
 * rewriting the binding.
 *
 * Outside all of them every link returns false and the key is NOT swallowed, so
 * Tab keeps its default meaning — focus leaves the leaf. That is the affordance
 * the deferred structural keymap will own; suppressing it here would strand the
 * keyboard in a body with no exit.
 */
function tabChain(itemType: NodeType): Command[] {
	return [sinkListItem(itemType)];
}
function shiftTabChain(itemType: NodeType): Command[] {
	return [liftListItem(itemType)];
}

/**
 * The list bindings for a block-schema leaf — `{}` for the inline/plaintext
 * schemas, which declare no list nodes.
 *
 * `Enter` is a chain in precedence order: the paragraph-above gesture, then
 * `splitListItem`, then `liftListItem`. The middle link carries two behaviors of
 * its own — it splits a non-empty item, and on an empty item it either splits the
 * WRAPPING item (a nested empty item, so Enter lifts exactly one level) or bails
 * so the third link lifts a top-level empty item out to a paragraph. `Backspace`
 * forks on the item's index: the first item lifts, any later one merges.
 */
export function listKeymap(schema: Schema): Record<string, Command> {
	const itemType = schema.nodes.list_item;
	const paragraph = schema.nodes.paragraph;
	if (!itemType || !paragraph) return {};
	return {
		Tab: chainCommands(...tabChain(itemType)),
		'Shift-Tab': chainCommands(...shiftTabChain(itemType)),
		Enter: chainCommands(
			paragraphAboveList(itemType, paragraph),
			splitListItem(itemType),
			liftListItem(itemType)
		),
		Backspace: chainCommands(liftAtListStart(itemType), mergeIntoPreviousItem(itemType))
	};
}
