// Mark algebra: two content classes to two PM mechanisms.
//   formatting (strong/emph/underline/strike/code/link)  ↔ PM marks
//   identity   (anchor, zero-width)                      ↔ decorations (see field.ts)
//   unknown    (a type this build does not know)         ↔ the inert `unknown` PM mark
// This module owns the type-name translation and the descriptor keying the mark
// diff groups by; the anchor↔decoration bridge is field.ts, the mark ops are
// encode.ts. `emph` is the content name; `em` the PM name: the one asymmetry.
import type { Mark, Schema } from 'prosemirror-model';
import type { ContentMark } from '@quillmark/wasm';
import { isAnchorMark, isLinkMark } from '@quillmark/wasm';
import { canonicalJson } from './reconcile.js';

/** Content formatting types that map 1:1 to a same-named PM mark. */
const PLAIN_FORMATTING = new Set(['strong', 'underline', 'strike', 'code']);

/** The `{ type, attrs? }` half of a mark, the one spelling every type's payload rides.
 *  An empty payload is omitted, as the wire omits it, so a mark spelling `attrs: null`
 *  keys as one spelling none. */
function markDescriptor(type: string, attrs: unknown): Record<string, unknown> {
	return attrs == null ? { type } : { type, attrs };
}

/** A PM mark from a content formatting/unknown mark, or `null` for an anchor. */
export function pmMarkFromContent(schema: Schema, m: ContentMark): Mark | null {
	if (isAnchorMark(m)) return null;
	if (m.type === 'emph') return schema.marks.em.create();
	if (isLinkMark(m)) return schema.marks.link.create({ href: m.attrs.url });
	if (PLAIN_FORMATTING.has(m.type)) return schema.marks[m.type].create();
	// Anything else is an unknown mark: inert, renders nothing, round-trips verbatim.
	return schema.marks.unknown.create({
		type: m.type,
		attrs: (m as { attrs?: unknown }).attrs ?? null
	});
}

/**
 * A content mark descriptor from a PM mark (range-free): the `{ type, attrs? }`
 * half of a `ContentMark` / `MarkOp`. `strong`/`emph`/… collapse to their content
 * name; the `unknown` mark re-emits its stored `type`/`attrs` verbatim.
 */
export function contentDescriptorFromPM(mark: Mark): Record<string, unknown> {
	const name = mark.type.name;
	if (name === 'em') return { type: 'emph' };
	if (name === 'link') return markDescriptor('link', { url: mark.attrs.href });
	if (name === 'unknown') return markDescriptor(mark.attrs.type as string, mark.attrs.attrs);
	// strong / underline / strike / code
	return { type: name };
}

/**
 * The range-free `{ type, attrs? }` half of a content mark: `contentDescriptorFromPM`'s
 * content-side twin, and what a `MarkOp` carries beside its range. Anchors are routed
 * by id on a separate channel and never reach here.
 */
export function descriptorOf(m: ContentMark): Record<string, unknown> {
	return markDescriptor(m.type, (m as { attrs?: unknown }).attrs);
}

/**
 * A stable grouping key for the mark diff: marks sharing a key union into one
 * coverage set. A payload-free type keys on its name; anything carrying one keys on
 * type+attrs, because `applyChange`'s `remove` matches type and attrs (verified), so
 * two links at different urls are independent mark families.
 */
export function markKey(descriptor: Record<string, unknown>): string {
	const type = descriptor.type as string;
	if (descriptor.attrs !== undefined) return `${type}\u0000${canonicalJson(descriptor.attrs)}`;
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
	for (const m of rt.marks) if (isAnchorMark(m)) out.push({ id: m.attrs.id, pos: m.start });
	return out;
}
