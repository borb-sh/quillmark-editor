// Islands — the `U+FFFC` slot + `RichTextIsland` entry ↔ a PM leaf node. A slot
// inside a `para` line is an inline island (an image); an `island`-kind line is a
// block island (a table). The node carries `id`, `islandType`, and the opaque
// `props` verbatim, so an unknown island type round-trips untouched; the local
// typed schemas below (`table`, `image`) are what a props-aware consumer reads —
// `RichTextIsland.props` is `unknown` at the WASM boundary (DOCUMENT_MODEL seam),
// so the codec owns the shape, it is not pinned upstream.
import type { NodeSpec } from 'prosemirror-model';
import type { RichTextIsland } from '../wasm-types.js';

/** The `U+FFFC` object-replacement char that occupies one island slot in `text`. */
export const ISLAND_SLOT = '￼';

/** A richtext cell inside a table island — a mini corpus (marks over flat text). */
export interface IslandTableCell {
	text: string;
	marks: { start: number; end: number; type: string; [k: string]: unknown }[];
}
/** Column alignment as the corpus reports it. */
export type IslandTableAlign = 'none' | 'left' | 'center' | 'right';
/** Typed props for a `table` island (codec-local; not pinned by the boundary). */
export interface IslandTableProps {
	header: IslandTableCell[];
	rows: IslandTableCell[][];
	aligns: IslandTableAlign[];
}
/** Typed props for an `image` island (codec-local). */
export interface IslandImageProps {
	url: string;
	alt: string;
}

/** Read an `image` island's props, or `undefined` if the shape does not match. */
export function imageProps(island: RichTextIsland): IslandImageProps | undefined {
	if (island.type !== 'image') return undefined;
	const p = island.props as Partial<IslandImageProps> | null;
	if (!p || typeof p.url !== 'string') return undefined;
	return { url: p.url, alt: typeof p.alt === 'string' ? p.alt : '' };
}

/** Read a `table` island's props, or `undefined` if the shape does not match. */
export function tableProps(island: RichTextIsland): IslandTableProps | undefined {
	if (island.type !== 'table') return undefined;
	const p = island.props as Partial<IslandTableProps> | null;
	if (!p || !Array.isArray(p.rows) || !Array.isArray(p.header)) return undefined;
	return {
		header: p.header as IslandTableCell[],
		rows: p.rows as IslandTableCell[][],
		aligns: (Array.isArray(p.aligns) ? p.aligns : []) as IslandTableAlign[]
	};
}

// The three island node attributes carry the corpus entry verbatim: `id` is the
// stable identity (rebases like an anchor), `islandType` the discriminator, and
// `props` the opaque payload the codec preserves byte-for-byte across a
// round-trip. `loss` is not carried on the node — it is a projection hint the
// corpus recomputes on write, not editable state.
const islandAttrs = {
	id: { default: '' },
	islandType: { default: '' },
	props: { default: null }
};

/** Block island node (a table): one `island`-kind corpus line. Atom, unselectable content. */
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

/** Build a corpus island entry from a PM island node's attrs (block or inline). */
export function islandEntryFromNode(attrs: {
	id: string;
	islandType: string;
	props: unknown;
}): RichTextIsland {
	return {
		id: attrs.id,
		type: attrs.islandType,
		props: attrs.props,
		// `loss` is recomputed by the corpus on write; a faithful default keeps
		// `install`-based test round-trips stable for known lossless types.
		loss: 'lossless'
	} as RichTextIsland;
}
