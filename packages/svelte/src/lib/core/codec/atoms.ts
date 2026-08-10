// The block-atom link of the body's Backspace/Delete chains: a delete AGAINST an
// island or a divider selects it, and the press after that deletes it.
//
// This is the neighbour half of the rule the leaf already holds for a key typed OVER a
// selection (CODEC §"The table island"): a selection is the subject of the next
// command, never a thing armed for replacement. Without it the base keymap's
// `joinBackward` / `joinForward` reach their "the neighbour is an atom, delete it" arm
// and a table goes in one keystroke, from the paragraph a table insert parks the caret
// in — with nothing drawn first to say what is about to go.
//
// It runs LAST of the links, after the list ones: a Backspace at the start of a list's
// first item lifts the item, and that stays the item's answer whatever sits above the
// list.
import { NodeSelection, TextSelection, type Command } from 'prosemirror-state';
import type { ResolvedPos, Schema } from 'prosemirror-model';

/** The caret, when it sits at a textblock EDGE with an empty selection: the only place
 *  a delete is about a neighbour rather than about a character. `null` everywhere else,
 *  which is where the key keeps its ordinary meaning. */
function atEdge(state: Parameters<Command>[0], side: -1 | 1): ResolvedPos | null {
	const { selection } = state;
	if (!(selection instanceof TextSelection) || !selection.empty) return null;
	const $head = selection.$head;
	const at = side < 0 ? 0 : $head.parent.content.size;
	return $head.parentOffset === at ? $head : null;
}

/**
 * The cut the caret's block sits against on `side`: the shallowest boundary with a
 * sibling beyond it. `prosemirror-commands` walks the same one to find the node a join
 * would reach; this reads it to find the node a delete would take.
 */
function cutAt($pos: ResolvedPos, side: -1 | 1): ResolvedPos | null {
	if ($pos.parent.type.spec.isolating) return null;
	for (let d = $pos.depth - 1; d >= 0; d--) {
		if (side < 0) {
			if ($pos.index(d) > 0) return $pos.doc.resolve($pos.before(d + 1));
		} else if ($pos.index(d) + 1 < $pos.node(d).childCount) {
			return $pos.doc.resolve($pos.after(d + 1));
		}
		if ($pos.node(d).type.spec.isolating) break;
	}
	return null;
}

/** Select the block atom the caret is against, rather than deleting it. Declines when
 *  the neighbour is anything a caret can enter, so a paragraph, a heading, a quote and
 *  a list all keep the join the base keymap gives them. */
function selectAtom(side: -1 | 1): Command {
	return (state, dispatch) => {
		const $head = atEdge(state, side);
		const $cut = $head && cutAt($head, side);
		if (!$cut) return false;
		const node = side < 0 ? $cut.nodeBefore : $cut.nodeAfter;
		if (!node || !node.isAtom || !node.isBlock || !NodeSelection.isSelectable(node)) return false;
		const at = side < 0 ? $cut.pos - node.nodeSize : $cut.pos;
		dispatch?.(state.tr.setSelection(NodeSelection.create(state.doc, at)).scrollIntoView());
		return true;
	};
}

/**
 * The block-atom bindings for a block-schema leaf: `{}` for the inline/plaintext
 * schemas, which hold no block to be against.
 *
 * Both keys are the same command on opposite sides, because what a delete against an
 * atom means does not depend on which side the caret approached from.
 */
export function atomKeymap(schema: Schema): Record<string, Command> {
	if (!schema.nodes.island_block) return {};
	return {
		Backspace: selectAtom(-1),
		Delete: selectAtom(1)
	};
}
