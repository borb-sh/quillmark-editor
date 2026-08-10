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
import type { Node as PMNode, NodeSpec } from 'prosemirror-model';
import { isTableIsland } from '@quillmark/wasm';
import type { ContentIsland, TableProps } from '@quillmark/wasm';

/** The `U+FFFC` object-replacement char that occupies one island slot in `text`. */
export const ISLAND_SLOT = '￼';

// The four island node attributes carry the content entry verbatim: `id` is the
// stable identity (rebases like an anchor), `islandType` the discriminator, `props`
// the opaque payload the codec preserves byte-for-byte across a round-trip, and
// `loss` how faithfully markdown can carry it. `loss` is authored, not derived:
// `applyChange` stores the class an island op gives it and re-derives nothing, so
// an entry that did not carry its own would promote a degraded table to lossless
// on the first cell edit. The default is the class an unknown one reads as, so a
// node no decode produced under-claims rather than over-claims; decode always
// supplies the stored value.
const islandAttrs = {
	id: { default: '' },
	islandType: { default: '' },
	props: { default: null },
	loss: { default: 'unrepresentable' }
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

/** A PM island node's attributes: the content entry, spelled the way a node spec
 *  spells it (`islandType`, because `type` on a PM node is the node type). `loss`
 *  reads its class off the entry rather than restating the union, which the public
 *  entry point does not name (DOCUMENT_MODEL §Stability seams). */
export interface IslandNodeAttrs {
	id: string;
	islandType: string;
	props: unknown;
	loss: ContentIsland['loss'];
}

/** Build a content island entry from a PM island node's attrs (block or inline). */
export function islandEntryFromNode(attrs: IslandNodeAttrs): ContentIsland {
	return {
		id: attrs.id,
		type: attrs.islandType,
		props: attrs.props,
		loss: attrs.loss
	};
}

/** A node's `TableProps`, or `undefined` for any other island: the boundary's own
 *  guard over the entry the node carries, so the open `type` arm narrows once here
 *  rather than at each reader. */
export function tablePropsOfNode(node: PMNode): TableProps | undefined {
	const entry = islandEntryFromNode(node.attrs as IslandNodeAttrs);
	return isTableIsland(entry) ? entry.props : undefined;
}

/**
 * A minter over one document: the positional `isl-{n}` sequence continued past the
 * highest id the field already holds, handing out consecutive ids, so a caller placing
 * several islands at once keeps one minter for the lot. A minted id is this tier's to
 * produce and it is part of the document's canonical bytes (CODEC §Islands), so it is a
 * counter over the projection in hand — never a UUID, never a clock reading, and never a
 * re-numbering of the ids already there, which are identities.
 *
 * Reads the PM doc rather than the stored content because that is what the caller (an
 * insert command, a paste) holds and what the commit will project: an id minted against
 * a stale content could collide with one the same transaction places.
 */
export function islandMinter(doc: PMNode): () => string {
	let next = 0;
	doc.descendants((node) => {
		if (node.type.name !== 'island_block' && node.type.name !== 'island_inline') return true;
		const m = /^isl-(\d+)$/.exec(node.attrs.id as string);
		if (m) next = Math.max(next, Number(m[1]) + 1);
		return false;
	});
	return () => `isl-${next++}`;
}

/** The next island id for a field: one draw from {@link islandMinter}, which is what a
 *  command placing exactly one island wants. */
export function mintIslandId(doc: PMNode): string {
	return islandMinter(doc)();
}
