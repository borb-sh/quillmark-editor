// Mark algebra: two content classes to two PM mechanisms.
//   formatting (strong/emph/underline/strike/code/link)  ↔ PM marks
//   identity   (anchor{id}, zero-width)                  ↔ decorations (see field.ts)
//   unknown    ({type, attrs})                           ↔ the inert `unknown` PM mark
// This module owns the type-name translation and the descriptor keying the mark
// diff groups by; the anchor↔decoration bridge is field.ts, the mark ops are
// encode.ts. `emph` is the content name; `em` the PM name: the one asymmetry.
import type { Mark, Schema } from 'prosemirror-model';
import type { ContentMark } from '@quillmark/wasm';
import { isAnchorMark, isLinkMark } from '../index.js';

/** Content formatting types that map 1:1 to a same-named PM mark. */
const PLAIN_FORMATTING = new Set(['strong', 'underline', 'strike', 'code']);

/** A PM mark from a content formatting/unknown mark, or `null` for an anchor. */
export function pmMarkFromContent(schema: Schema, m: ContentMark): Mark | null {
	if (isAnchorMark(m)) return null;
	if (m.type === 'emph') return schema.marks.em.create();
	if (isLinkMark(m)) return schema.marks.link.create({ href: m.url });
	if (PLAIN_FORMATTING.has(m.type)) return schema.marks[m.type].create();
	// Anything else is an unknown mark: inert, renders nothing, round-trips verbatim.
	return schema.marks.unknown.create({
		type: m.type,
		attrs: (m as { attrs: unknown }).attrs ?? null
	});
}

/**
 * A content mark descriptor from a PM mark (range-free): the `{ type, … }` half
 * of a `ContentMark` / `MarkOp`. `strong`/`emph`/… collapse to their content
 * name; the `unknown` mark re-emits its stored `type`/`attrs` verbatim.
 */
export function contentDescriptorFromPM(mark: Mark): Record<string, unknown> {
	const name = mark.type.name;
	if (name === 'em') return { type: 'emph' };
	if (name === 'link') return { type: 'link', url: mark.attrs.href };
	if (name === 'unknown') return { type: mark.attrs.type as string, attrs: mark.attrs.attrs };
	// strong / underline / strike / code
	return { type: name };
}

/**
 * The range-free `{ type, … }` half of a content mark: `contentDescriptorFromPM`'s
 * content-side twin, and what a `MarkOp` carries beside its range. An anchor keys
 * on its type alone: its `id` is identity, not a formatting family, and the diff
 * routes anchors by id on a separate channel.
 */
export function descriptorOf(m: ContentMark): Record<string, unknown> {
	if (isLinkMark(m)) return { type: 'link', url: m.url };
	if ('attrs' in m && !isAnchorMark(m)) return { type: m.type, attrs: m.attrs };
	return { type: m.type };
}

/**
 * A stable grouping key for the mark diff: marks sharing a key union into one
 * coverage set. Formatting keys on its type; a link keys on type+url and an
 * unknown on type+attrs, because `applyChange`'s `remove` matches type AND attrs
 * (verified), so different urls / attrs are independent mark families.
 */
export function markKey(descriptor: Record<string, unknown>): string {
	const type = descriptor.type as string;
	if (type === 'link') return `link\u0000${String(descriptor.url)}`;
	if (descriptor.attrs !== undefined) return `${type}\u0000${JSON.stringify(descriptor.attrs)}`;
	return type;
}

/** A held anchor position: an identity id at a USV content offset (zero-width). */
export interface AnchorPos {
	id: string;
	pos: number;
}

/**
 * The identity anchors of a `Content` as `{ id, pos }` in USV: the seed for the
 * field's anchor-position plugin and the `oldAnchors` the mark diff rebases.
 * Anchors are zero-width, so `start` is the position.
 */
export function anchorsFromContent(rt: { marks: ContentMark[] }): AnchorPos[] {
	const out: AnchorPos[] = [];
	for (const m of rt.marks) if (isAnchorMark(m)) out.push({ id: m.id, pos: m.start });
	return out;
}
