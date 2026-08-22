// List editing: the body leaf's structural commands, over
// `prosemirror-schema-list` primitives. Indent/outdent on Tab, and the three
// structural keys lists redefine: Enter (split, exit an empty item, open a
// paragraph where nothing above the list takes a caret), Backspace (merge, or
// lift at the list's start) and Delete (that merge from the other side).
//
// Cleanup is command-local, never a global pass: `liftToOuterList` joins the
// boundary it opens and `sinkListItem` reuses the previous item's nested list, so
// no mutation strands a node. A whole-doc normalizer would instead fuse adjacent
// same-type lists, and that boundary is load-bearing: an ordinal decrease is how
// `Content` marks one, the upstream normalizer stores it verbatim
// (`tests/codec/list-shapes.test.ts`), and fusing renumbers an imported `1, 2, 1`
// in a region no edit touched. Reads preserve it; only an edit normalizes. The pair
// with no ordinal decrease to preserve is the one `Content` cannot hold at all, and
// joining exactly that pair is `boundaries.ts`, on the transaction that minted it.
import type { Node as PMNode, NodeType, Schema } from 'prosemirror-model';
import { liftListItem, sinkListItem, splitListItem } from 'prosemirror-schema-list';
import { Selection, type Command } from 'prosemirror-state';
import { chainCommands, joinTextblockBackward, joinTextblockForward } from 'prosemirror-commands';

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

/** The caret at the end of a block inside an item, with another item's text next in
 * document order: Backspace's merge position read from the other side. The next block
 * being an item's is what the key branches on, so the item after this one, the first
 * of a nested list under it, and the outer item after a nested run are one case, and a
 * block outside every list is not one at all. */
function atItemEnd(state: Parameters<Command>[0], itemType: NodeType): boolean {
	const { $from, empty } = state.selection;
	if (!empty || $from.parentOffset !== $from.parent.content.size) return false;
	if ($from.depth < 3 || $from.node(-1).type !== itemType) return false;
	const $next = Selection.near(state.doc.resolve($from.after()), 1).$head;
	return (
		$next.pos > $from.pos &&
		$next.parent.isTextblock &&
		$next.depth >= 2 &&
		$next.node(-1).type === itemType
	);
}

/**
 * Whether a caret already fits immediately above the list at `pos`. The node ending
 * there answers for its last child, so a quote counts through its final paragraph;
 * an atom (an island, a rule) does not, and neither does a list opening its parent.
 * Those are the shapes `prosemirror-gapcursor` declines too, its `closedBefore`
 * asking this question from the other side.
 */
function writableAbove(doc: PMNode, pos: number): boolean {
	let before = doc.resolve(pos).nodeBefore;
	while (before && !before.isTextblock && !before.isAtom) before = before.lastChild;
	return !!before?.isTextblock;
}

/**
 * Enter at the very start of a top-level list's first item, where nothing above the
 * list takes a caret → an empty paragraph above it, caret staying with the text it
 * pushed down. A list that opens a document, or one under an island or a rule, has
 * nowhere above to write and nothing else that opens one. Where a caret already
 * fits above, the key is the conventional split instead, at every item alike: an
 * escape a writer reaches by pressing Up needs no key of its own.
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
 * `liftListItem`, with the ordinals below the lift kept.
 *
 * A lift out of the middle of a list splits it, and the tail is a new node carrying the
 * head's attributes: an ordered list's tail restarts at the head's `start`, renumbering
 * items no edit touched — the fault a whole-doc fuse would commit, from the other
 * direction. The tail's first item stood at `start + index`, so that is what the tail
 * starts at, and lifting the first item of `3.` `4.` is the same arithmetic: the tail
 * begins at 4.
 *
 * The tail is read off the far end of the lifted range, mapped through the lift: the
 * items left below the lift are the node that position now sits in, wherever the
 * primitive put them (a sibling of the list at the top, a child of the lifted item one
 * level down), and it is the tail by still carrying the attributes it was split from.
 */
function liftItem(itemType: NodeType): Command {
	const lift = liftListItem(itemType);
	return (state, dispatch) => {
		if (!dispatch) return lift(state);
		const { $from, $to } = state.selection;
		const range = $from.blockRange(
			$to,
			(node) => node.childCount > 0 && node.firstChild!.type === itemType
		);
		const list = range?.parent;
		const split =
			range && list && list.type.name === 'ordered_list' && range.endIndex < list.childCount
				? { below: range.end, start: (list.attrs.start as number) + range.endIndex }
				: null;
		return lift(state, (tr) => {
			if (split) {
				const $tail = tr.doc.resolve(tr.mapping.map(split.below));
				const tail = $tail.parent;
				if (tail.type === list!.type && tail.attrs.start === list!.attrs.start) {
					tr.setNodeMarkup($tail.before(), undefined, { ...tail.attrs, start: split.start });
				}
			}
			dispatch(tr);
		});
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
		return liftItem(itemType)(state, dispatch);
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
 */
function mergeIntoPreviousItem(itemType: NodeType): Command {
	return (state, dispatch, view) => {
		const at = atItemStart(state, itemType);
		if (!at || at.itemIndex === 0) return false;
		return joinTextblockBackward(state, dispatch, view);
	};
}

/**
 * Delete at the end of an item, with another item's text after it → pull that text up
 * into this item, so the two items become one line.
 *
 * The same merge as Backspace's at the same seam, because which key a writer reached
 * for does not change what joining two items means. The base keymap's `joinForward`
 * answers three different ways there — the next item's block moved in whole (its
 * marker gone, its text on its own line), a nested list flattened into that same
 * continuation paragraph, an outer item pulled into the one above it — and all three
 * are shapes the reference quill typesets as unnumbered prose under a point.
 */
function mergeNextItem(itemType: NodeType): Command {
	return (state, dispatch, view) => {
		if (!atItemEnd(state, itemType)) return false;
		return joinTextblockForward(state, dispatch, view);
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
 * `splitListItem`, then the lift. The middle link carries two behaviors of
 * its own: it splits a non-empty item, and on an empty item it either splits the
 * wrapping item (a nested empty item, so Enter lifts exactly one level) or bails
 * so the third link lifts a top-level empty item out to a paragraph.
 *
 * `Backspace` and `Delete` are the two sides of one seam: at an item's start the first
 * item lifts and any later one merges backward, and at an item's end the item after it
 * merges forward. Both decline where the neighbour is not an item's, leaving the
 * list's outer boundary to the base keymap and an atom beyond it to the link after
 * this one.
 */
export function listKeymap(schema: Schema): Record<string, Command> {
	const itemType = schema.nodes.list_item;
	const paragraph = schema.nodes.paragraph;
	if (!itemType || !paragraph) return {};
	return {
		Tab: sinkListItem(itemType),
		'Shift-Tab': liftItem(itemType),
		Enter: chainCommands(
			paragraphAboveList(itemType, paragraph),
			splitListItem(itemType),
			liftItem(itemType)
		),
		Backspace: chainCommands(liftAtListStart(itemType), mergeIntoPreviousItem(itemType)),
		Delete: mergeNextItem(itemType)
	};
}
