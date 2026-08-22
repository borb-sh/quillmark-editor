// The sibling boundaries `Content` cannot carry, joined on the transaction that mints
// one.
//
// The block tree is derived from the flat lines, so two adjacent siblings are two only
// where the lines say so: a quote (and every unknown container) is one wrapper per
// `containers` identity, and a list run breaks on an ordinal decrease alone. A pair
// outside that image encodes to lines that decode as one node — `ul(li(x)) ul(li(y))`
// re-reads as one item holding two paragraphs, the second item's marker gone — so the
// edit that minted it loses the writer's structure at the next commit, and a doc-shape
// assertion over the PM tree sees nothing wrong.
//
// This is not the whole-doc normalizer `lists.ts` §cleanup refuses, which fuses a
// boundary `Content` does hold: a run of two or more items carries its ordinal
// decrease, the upstream normalizer stores it verbatim, and an imported `1, 2, 1` must
// survive an edit in a region it did not touch. Decode emits no pair this joins (a run
// it broke has two items above the break), so the guard cannot reach a shape a document
// arrived with — only one an edit put there, and the edits that do are the ones no list
// command runs: a paste beside a list, a drop, a shorthand at the head of the paragraph
// above one.
import type { Node as PMNode } from 'prosemirror-model';
import { Plugin, type Transaction } from 'prosemirror-state';
import { canJoin } from 'prosemirror-transform';
import { valueEqual } from './reconcile.js';

/**
 * Whether two adjacent siblings encode to one node: the pair a join heals.
 *
 * A list's boundary is its second run's ordinal 0 landing under the first run's last,
 * so a first list of one item leaves nothing to decrease from; two items above it and
 * the decrease is the boundary itself. `start` and orderedness are the run's other two
 * keys, and a bullet list's `start` is fixed, so an ordered pair differing in it is
 * already two runs.
 */
function fuses(a: PMNode, b: PMNode): boolean {
	if (a.type !== b.type) return false;
	switch (a.type.name) {
		case 'bullet_list':
			return a.childCount === 1;
		case 'ordered_list':
			return a.childCount === 1 && a.attrs.start === b.attrs.start;
		case 'blockquote':
			return true;
		case 'unknown_container':
			return a.attrs.container === b.attrs.container && valueEqual(a.attrs.attrs, b.attrs.attrs);
		default:
			return false;
	}
}

/** The boundary position of every fusable pair in `doc`, in document order. */
function fusable(doc: PMNode): number[] {
	const out: number[] = [];
	const walk = (parent: PMNode, contentStart: number) => {
		let pos = contentStart;
		let prev: PMNode | undefined;
		parent.forEach((child) => {
			if (prev && fuses(prev, child) && canJoin(doc, pos)) out.push(pos);
			if (child.isBlock && !child.isTextblock && !child.isAtom) walk(child, pos + 1);
			prev = child;
			pos += child.nodeSize;
		});
	};
	walk(doc, 0);
	return out;
}

/**
 * Join every fusable pair in `tr`'s document; whether any did.
 *
 * Joining in reverse document order leaves the earlier positions of one pass valid,
 * and each pass re-reads the document because a join opens the pair its two halves
 * were holding apart (two quotes joining brings their lists together). Every pass
 * drops a node, so the loop ends.
 */
export function joinFusedBoundaries(tr: Transaction): boolean {
	let joined = false;
	for (let at = fusable(tr.doc); at.length; at = fusable(tr.doc)) {
		for (let i = at.length - 1; i >= 0; i--) tr.join(at[i]);
		joined = true;
	}
	return joined;
}

/**
 * The guard as a plugin: appended to the transaction that minted the pair, so the join
 * is that edit's own — one commit, and one undo step (`prosemirror-history` groups an
 * appended transaction into the event it was appended to).
 *
 * A plugin rather than a link in each command, because the commands are not where the
 * shape comes from: PM's own paste, drop and `replaceSelection` reach it with nothing
 * of this package's on the path.
 */
export function boundaryPlugin(): Plugin {
	return new Plugin({
		appendTransaction: (trs, _before, state) => {
			if (!trs.some((tr) => tr.docChanged)) return null;
			const tr = state.tr;
			return joinFusedBoundaries(tr) ? tr : null;
		}
	});
}
