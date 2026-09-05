// A within-block line break is a `hard_break`, in every document the leaf holds —
// and in a block that renders as one line, it is no break at all but a block
// boundary.
//
// `paragraph` and `heading` are `inline*` (`schema.ts`), so the schema admits a text
// node carrying a `\n`, and a range spanning a fence's edge leaves one: the fit that
// merges the two textblocks runs no `clearIncompatible` pass, so the fence's text
// arrives above with its newlines intact. The store reads one as the line boundary it
// is (`encode.ts` §`scanInline`) and the preview draws it, while the leaf's own DOM
// collapses it to a space and the next re-hydrate swaps in the break `decode` produces.
//
// A heading takes no continuation: the boundary refuses `setContinues` on the line
// after one (`LineKind::takes_continuations` — `para`, `code` and an unknown kind take
// one; a heading, a rule and an island do not), because export renders only that
// first line. A rule and an island are atoms holding no inline content and code keeps
// its own newlines, so a heading is the one block here a break can open and cannot
// hold. It splits into two headings, which is what the boundary's own `normalize`
// makes of such a flag, so the store's answer and the leaf's are the same document.
//
// One spelling, held over the document rather than at each command that can open one,
// so a paste and a drop are covered alongside the keys.
import type { Node as PMNode, Schema } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import { canSplit } from 'prosemirror-transform';

/** Blocks whose kind renders as one line, so a break inside one is a block boundary. */
function isSingleLine(node: PMNode): boolean {
	return node.type.name === 'heading';
}

/**
 * Rewrite every `\n` a transaction leaves in a non-`code` textblock to a `hard_break`,
 * and split a single-line block at the first break it holds.
 *
 * Reads the schema rather than a flag: the inline schemas declare neither node, and
 * nothing puts a `\n` in one — a paste parses its whitespace away and the keys type
 * characters.
 *
 * A split is one per pass: it moves every position after it, where a break and the
 * `\n` it replaces are the same width. The pass runs again on what it appended, so a
 * block holding several breaks converges one boundary at a time.
 */
export function linebreakPlugin(schema: Schema): Plugin {
	const br = schema.nodes.hard_break;
	return new Plugin({
		appendTransaction(trs, _before, state) {
			if (!br || !trs.some((tr) => tr.docChanged)) return null;
			const at: number[] = [];
			let boundary = -1;
			state.doc.descendants((node, pos) => {
				// A code block's newlines are its content (`whitespace: 'pre'`).
				if (node.type.spec.code) return false;
				if (!node.isTextblock) return true;
				const single = isSingleLine(node);
				node.forEach((child, offset) => {
					const start = pos + 1 + offset;
					if (child.isText) {
						const text = child.text ?? '';
						for (let i = text.indexOf('\n'); i >= 0; i = text.indexOf('\n', i + 1)) {
							if (!single) at.push(start + i);
							else if (boundary < 0) boundary = start + i;
						}
					} else if (single && child.type === br && boundary < 0) boundary = start;
				});
				return false;
			});
			if (boundary >= 0) {
				// The break itself is the boundary, so it goes: what remains either side
				// of it is the two blocks. A position the schema will not split at keeps
				// the text and loses only the break, which no line of the store carries.
				const tr = state.tr.delete(boundary, boundary + 1);
				return canSplit(tr.doc, boundary) ? tr.split(boundary) : tr;
			}
			if (!at.length) return null;
			// A break and the `\n` it replaces are both one position wide, so an earlier
			// replacement leaves every later one addressed.
			const tr = state.tr;
			for (const pos of at) tr.replaceWith(pos, pos + 1, br.create());
			return tr;
		}
	});
}
