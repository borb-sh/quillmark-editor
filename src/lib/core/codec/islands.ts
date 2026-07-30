// Islands: the `U+FFFC` slot + `ContentIsland` entry ↔ a PM leaf node. A slot
// inside a `para` line is an inline island (an image); an `island`-kind line is a
// block island (a table). The node carries `id`, `islandType`, and the opaque
// `props` verbatim, so an unknown island type round-trips untouched.
//
// A props-aware consumer reads the shape straight off the boundary:
// `ContentIsland.props` is the typed union (`TableProps` for `table`,
// `ImageProps` for `image`; DOCUMENT_MODEL §Stability seams), so the codec
// reads it rather than hand-rolling a shape or guard. The open `type` arm means
// a discriminant check does not auto-narrow `props`; key off `type` and read
// `props` as the matching upstream type.
import type { NodeSpec } from 'prosemirror-model';
import type { ContentIsland } from '@quillmark/wasm';

/** The `U+FFFC` object-replacement char that occupies one island slot in `text`. */
export const ISLAND_SLOT = '￼';

// The three island node attributes carry the content entry verbatim: `id` is the
// stable identity (rebases like an anchor), `islandType` the discriminator, and
// `props` the opaque payload the codec preserves byte-for-byte across a
// round-trip. `loss` is not carried on the node; it is a projection hint the
// content recomputes on write, not editable state.
const islandAttrs = {
	id: { default: '' },
	islandType: { default: '' },
	props: { default: null }
};

/** Block island node (a table): one `island`-kind content line. Atom, unselectable content. */
export const islandBlockSpec: NodeSpec = {
	group: 'block',
	atom: true,
	selectable: true,
	attrs: islandAttrs,
	toDOM: (node) => [
		'div',
		{ 'data-island': node.attrs.islandType as string, 'data-island-id': node.attrs.id as string },
		`[${node.attrs.islandType || 'island'}]`
	]
};

/** Inline island node (an image): a `U+FFFC` slot inside a `para` line. */
export const islandInlineSpec: NodeSpec = {
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,
	attrs: islandAttrs,
	toDOM: (node) => [
		'span',
		{ 'data-island': node.attrs.islandType as string, 'data-island-id': node.attrs.id as string },
		`[${node.attrs.islandType || 'island'}]`
	]
};

/** Build a content island entry from a PM island node's attrs (block or inline). */
export function islandEntryFromNode(attrs: {
	id: string;
	islandType: string;
	props: unknown;
}): ContentIsland {
	return {
		id: attrs.id,
		type: attrs.islandType,
		props: attrs.props,
		// `loss` is recomputed by the content on write; a faithful default keeps
		// `install`-based test round-trips stable for known lossless types.
		loss: 'lossless'
	};
}
