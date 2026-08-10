// The link prompt's three questions, off the component so each is one function with
// a test: what a typed value means as an href, what the selection already carries,
// and how a link is written.
//
// `link` is the one mark carrying a VALUE, which is what keeps it off `toggleMark`:
// that command matches by TYPE (`rangeHasMark(from, to, markType)`), so a second
// href over a range already holding one REMOVES the mark rather than replacing it.
// Both commands below spell the mark ops out for that reason, and `setLink` puts
// the pair in ONE transaction so the mark diff lowers it as one link family
// exchanged for another (`codec/marks.ts` keys a link on type+url).
import type { Command } from 'prosemirror-state';
import type { EditorState } from 'prosemirror-state';

/** A scheme: a letter, then letters, digits, `+`, `-` or `.`, then `:` (RFC 3986). */
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;
/** Rooted at the page rather than at a host: an absolute path, a query, a fragment,
 *  or a protocol-relative host. Every one of them means relative on purpose. */
const ROOTED = /^[/#?]/;
/** A bare mail address: one `@`, no scheme and no path. */
const ADDRESS = /^[^\s/@]+@[^\s/@]+$/;

/**
 * The href a typed value stands for. A value with no scheme is a HOST, not a path:
 * stored verbatim, `example.com` is a relative href that resolves against whatever
 * page the editor is embedded in, so the link looks right and goes somewhere the
 * writer never named. `https://` is what a bare host means. A bare address takes
 * `mailto:` instead, since the host prefix would read it as `example.com` with
 * `jane` for userinfo — a wrong destination this normalization would itself have
 * minted.
 *
 * A rooted value is left alone, being the spelling that asks for the page it is
 * embedded in, and so is anything already carrying a scheme. `''` for a blank
 * value, which is nothing to apply.
 */
export function normalizeHref(raw: string): string {
	const value = raw.trim();
	if (!value || SCHEME.test(value) || ROOTED.test(value)) return value;
	return ADDRESS.test(value) ? `mailto:${value}` : `https://${value}`;
}

/**
 * The href under the selection: the FIRST link mark it touches, `''` where it
 * touches none. A selection may span several links; the prompt holds one value, so
 * the first is both what it seeds with and what an apply writes over the whole
 * range.
 */
export function hrefInSelection(state: EditorState): string {
	const type = state.schema.marks.link;
	if (!type) return '';
	const { from, to } = state.selection;
	let href = '';
	state.doc.nodesBetween(from, to, (node) => {
		if (href) return false;
		const mark = type.isInSet(node.marks);
		if (mark) href = String(mark.attrs.href ?? '');
		return !href;
	});
	return href;
}

/** Write `href` over the selection, replacing whatever link it already carries. */
export function setLink(href: string): Command {
	return (state, dispatch) => {
		const type = state.schema.marks.link;
		const { from, to, empty } = state.selection;
		if (!type || empty || !href) return false;
		if (dispatch)
			dispatch(state.tr.removeMark(from, to, type).addMark(from, to, type.create({ href })));
		return true;
	};
}

/** Drop every link the selection carries. */
export const clearLink: Command = (state, dispatch) => {
	const type = state.schema.marks.link;
	const { from, to, empty } = state.selection;
	if (!type || empty || !state.doc.rangeHasMark(from, to, type)) return false;
	if (dispatch) dispatch(state.tr.removeMark(from, to, type));
	return true;
};
