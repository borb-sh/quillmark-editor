// Decode — content → PM, a pure function (CODEC §Decode). Fold the flat lines into
// the tree: group a `continues` run into one block (para hard breaks → `hard_break`
// nodes; a code fence's lines → one `code_block`), nest by shared `containers`
// prefix (`list_item`/`quote` → lists/blockquote), select the block node by
// `kind`, apply marks over their `[start,end)` USV ranges (PM splits inline nodes
// at mark boundaries), and lower island slots to leaf nodes (inline in a `para`
// line, block on an `island` line). Anchors are NOT applied here — they are
// decorations (field.ts). Positions throughout are USV; `Array.from` iterates by
// code point so an astral char is one unit, never a surrogate half.
import { DOMSerializer, type Mark, type Node as PMNode, type Schema } from 'prosemirror-model';
import type { Content, ContentContainer, ContentLine, ContentMark } from '@quillmark/wasm';
import { ISLAND_SLOT } from './islands.js';
import { markKey, pmMarkFromContent } from './marks.js';
import { isInlineSchema } from './schema.js';
import { isAnchorMark, isCodeLine, isHeadingLine, isListItemContainer } from '../index.js';

/** Code points of `s` (USV units) — the iteration granularity the content speaks. */
export function codePoints(s: string): string[] {
	return Array.from(s);
}
/** USV length of `s` (code points, not UTF-16 units). */
export function usvLength(s: string): number {
	let n = 0;
	for (const _ of s) n++;
	return n;
}

/** One `continues`-joined block, pre-nesting: its container path + per-line segments. */
interface Leaf {
	line: ContentLine;
	containers: ContentContainer[];
	segments: { text: string; startUSV: number }[];
}

/** A live cursor over the island entries, consumed in text (document) order. */
type IslandCursor = { i: number; rt: Content };

interface DecodeOpts {
	/** Strip all marks (a `plaintext` field). */
	plaintext?: boolean;
}

/**
 * A `Content` as READ-ONLY DOM: decode under `schema`, then the nodes' own `toDOM`.
 * The rendering half of the codec's job with no editing attached — no PM view, no
 * plugins, no `contenteditable` — for chrome that must show content in the same
 * mark vocabulary a leaf edits it in (the tips card, VISUAL_EDITOR_UIUX §"Tips
 * card"). A second renderer over the same content would drift from `decode`; this
 * cannot.
 *
 * `DOMSerializer.fromSchema` memoizes on the schema, so repeat calls build no
 * serializer.
 */
export function renderContent(rt: Content, schema: Schema, opts: DecodeOpts = {}): Node {
	return DOMSerializer.fromSchema(schema).serializeFragment(decode(rt, schema, opts).content);
}

/** Decode a `Content` to a PM document under `schema`. */
export function decode(rt: Content, schema: Schema, opts: DecodeOpts = {}): PMNode {
	const lineTexts = rt.text.split('\n');
	// Per-line USV start: line i begins after all earlier lines and their `\n`s.
	const starts: number[] = [];
	let acc = 0;
	for (let i = 0; i < lineTexts.length; i++) {
		starts.push(acc);
		acc += usvLength(lineTexts[i]) + 1; // +1 for the `\n` boundary
	}
	const marks = opts.plaintext ? [] : rt.marks.filter((m) => !isAnchorMark(m));
	const cursor: IslandCursor = { i: 0, rt };

	if (isInlineSchema(schema)) {
		return decodeInline(rt, schema, lineTexts, starts, marks, cursor);
	}

	// Build leaves (fold `continues` runs), then nest by container prefix.
	const leaves: Leaf[] = [];
	for (let i = 0; i < rt.lines.length; i++) {
		const line = rt.lines[i];
		const seg = { text: lineTexts[i] ?? '', startUSV: starts[i] };
		if (line.continues && leaves.length > 0) {
			leaves[leaves.length - 1].segments.push(seg);
		} else {
			leaves.push({ line, containers: line.containers, segments: [seg] });
		}
	}

	const blocks = groupBlocks(schema, leaves, 0, marks, cursor);
	return schema.nodes.doc.create(null, blocks.length ? blocks : schema.nodes.paragraph.create());
}

/** Inline / plaintext decode: one paragraph, containers and islands stripped. */
function decodeInline(
	rt: Content,
	schema: Schema,
	lineTexts: string[],
	starts: number[],
	marks: ContentMark[],
	cursor: IslandCursor
): PMNode {
	// An inline field is single-line; join any stray lines with a space (no
	// hard_break node exists in this schema). Islands are not representable inline
	// — the slot char is dropped and its entry skipped.
	const inline: PMNode[] = [];
	for (let i = 0; i < lineTexts.length; i++) {
		if (i > 0) inline.push(schema.text(' '));
		inline.push(...buildInline(schema, lineTexts[i], starts[i], marks, cursor, true));
	}
	const para = schema.nodes.paragraph.create(null, inline);
	return schema.nodes.doc.create(null, para);
}

/** Nest a run of leaves that share a `depth`-length container prefix into blocks. */
function groupBlocks(
	schema: Schema,
	leaves: Leaf[],
	depth: number,
	marks: ContentMark[],
	cursor: IslandCursor
): PMNode[] {
	const out: PMNode[] = [];
	let i = 0;
	while (i < leaves.length) {
		const path = leaves[i].containers;
		if (path.length <= depth) {
			out.push(makeLeaf(schema, leaves[i], marks, cursor));
			i++;
			continue;
		}
		const here = path[depth];
		// `ContentContainer` is an OPEN set (0.98): a bare `here.container === 'x'`
		// never narrows, so the two arms this schema builds are claimed by the
		// boundary's guard / literal check and everything else falls to the inert
		// wrapper. There is no silent-degrade branch left to get wrong.
		if (isListItemContainer(here)) {
			// Gather the maximal run of sibling `list_item` leaves at this depth
			// (same ordered/start), then split it into items by `ordinal`.
			const { ordered, start } = here;
			let j = i + 1;
			let prevOrd = here.ordinal;
			while (j < leaves.length) {
				const c = atDepth(leaves[j], depth);
				if (!c || !isListItemContainer(c) || c.ordered !== ordered || c.start !== start) break;
				// An ordinal reset is an ADJACENT SIBLING list (content preserves the
				// shape) — merging it here would re-encode `[0,1,0]` as `[0,1,2]`,
				// breaking the decode round-trip on the first edit.
				if (c.ordinal < prevOrd) break;
				prevOrd = c.ordinal;
				j++;
			}
			const run = leaves.slice(i, j);
			const items: PMNode[] = [];
			let k = 0;
			while (k < run.length) {
				const ord = ordinalAt(run[k], depth);
				let l = k + 1;
				while (l < run.length && ordinalAt(run[l], depth) === ord) l++;
				items.push(
					schema.nodes.list_item.create(
						null,
						groupBlocks(schema, run.slice(k, l), depth + 1, marks, cursor)
					)
				);
				k = l;
			}
			const listType = ordered ? schema.nodes.ordered_list : schema.nodes.bullet_list;
			out.push(listType.create(ordered ? { start } : null, items));
			i = j;
			continue;
		}
		// quote and every unknown container share one shape — a wrapper over the run
		// of leaves carrying the IDENTICAL container here (identity by `containerKey`,
		// so two adjacent unknowns differing only in `attrs` stay two wrappers).
		const key = containerKey(here);
		let j = i + 1;
		while (j < leaves.length) {
			const c = atDepth(leaves[j], depth);
			if (!c || containerKey(c) !== key) break;
			j++;
		}
		const inner = groupBlocks(schema, leaves.slice(i, j), depth + 1, marks, cursor);
		out.push(
			here.container === 'quote'
				? schema.nodes.blockquote.create(null, inner)
				: schema.nodes.unknown_container.create(
						{ container: here.container, attrs: 'attrs' in here ? here.attrs : null },
						inner
					)
		);
		i = j;
	}
	return out;
}

function atDepth(leaf: Leaf, depth: number): ContentContainer | undefined {
	return leaf.containers[depth];
}

/** The `ordinal` of a leaf's `list_item` at `depth` — only called inside a run the
 * guard has already established, so a miss is unreachable. */
function ordinalAt(leaf: Leaf, depth: number): number {
	const c = atDepth(leaf, depth);
	return c && isListItemContainer(c) ? c.ordinal : -1;
}

/** Identity of a container for run gathering: its name plus its payload. Every
 * payload-carrying arm but `list_item` (which has its own run rule) keys here. */
function containerKey(c: ContentContainer): string {
	return 'attrs' in c ? `${c.container} ${JSON.stringify(c.attrs)}` : c.container;
}

/** A single leaf block node (para/heading/code/rule/island, or an unknown kind
 * carried on a paragraph) from its segments. `kind` is an OPEN set (0.98), so the
 * two payload-carrying arms read through the boundary's guards; the payload-free
 * arms compare literally, and anything left is unknown. */
function makeLeaf(schema: Schema, leaf: Leaf, marks: ContentMark[], cursor: IslandCursor): PMNode {
	const line = leaf.line;
	if (line.kind === 'rule') return schema.nodes.horizontal_rule.create();
	if (line.kind === 'island') {
		return schema.nodes.island_block.create(islandAttrs(cursor));
	}
	if (isCodeLine(line)) {
		// One code_block: the segments' texts joined by literal `\n`, no marks.
		const text = leaf.segments.map((s) => s.text).join('\n');
		const content = text.length ? [schema.text(text)] : [];
		return schema.nodes.code_block.create({ lang: line.lang ?? null }, content);
	}
	// para / heading / unknown: inline content, `hard_break` between continued segments.
	const inline: PMNode[] = [];
	leaf.segments.forEach((seg, idx) => {
		if (idx > 0) inline.push(schema.nodes.hard_break.create());
		inline.push(...buildInline(schema, seg.text, seg.startUSV, marks, cursor, false));
	});
	if (isHeadingLine(line)) {
		return schema.nodes.heading.create({ level: line.level }, inline);
	}
	// An unknown kind renders as a paragraph AND rides on it, so it re-encodes
	// verbatim rather than flattening to `para` on the field's first edit.
	const unknown =
		line.kind === 'para'
			? null
			: { kind: line.kind, attrs: 'attrs' in line ? line.attrs : null };
	return schema.nodes.paragraph.create({ unknown }, inline);
}

/** Consume the next island entry as PM node attrs (text-order matched to slots). */
function islandAttrs(cursor: IslandCursor): { id: string; islandType: string; props: unknown } {
	const isl = cursor.rt.islands[cursor.i++];
	if (!isl) return { id: '', islandType: '', props: null };
	return { id: isl.id, islandType: isl.type, props: isl.props };
}

/**
 * Inline nodes for one segment: split text into maximal runs of a constant mark
 * set, lower each `U+FFFC` to an inline island node. `stripIslands` drops slots
 * (inline-field mode). Offsets are USV; `pos = segStartUSV + k` indexes into the
 * global mark ranges.
 */
function buildInline(
	schema: Schema,
	segText: string,
	segStartUSV: number,
	marks: ContentMark[],
	cursor: IslandCursor,
	stripIslands: boolean
): PMNode[] {
	const cps = codePoints(segText);
	const out: PMNode[] = [];
	let runText = '';
	let runKey = '';
	let runMarks: readonly Mark[] = [];
	const flush = () => {
		if (runText.length) out.push(schema.text(runText, runMarks));
		runText = '';
	};
	for (let k = 0; k < cps.length; k++) {
		const cp = cps[k];
		const pos = segStartUSV + k;
		if (cp === ISLAND_SLOT) {
			flush();
			const attrs = islandAttrs(cursor);
			if (!stripIslands && schema.nodes.island_inline) {
				out.push(schema.nodes.island_inline.create(attrs));
			}
			runKey = '\0slot'; // force a fresh run after a slot
			continue;
		}
		const active = marks.filter((m) => m.start <= pos && pos < m.end);
		const key = markSetKey(active);
		if (key !== runKey && runText.length) flush();
		if (key !== runKey) {
			runKey = key;
			runMarks = buildMarkSet(schema, active);
		}
		runText += cp;
	}
	flush();
	return out;
}

/** A stable key for a mark set (order-independent) to detect run boundaries. */
function markSetKey(active: ContentMark[]): string {
	if (!active.length) return '';
	// Per-mark keys via the shared NUL-delimited `markKey`; the set is JSON-joined
	// so no url/attrs content collides with a delimiter — a `link:a|strong` url
	// stays distinct from the two-mark set `{link:a} + {strong}`.
	return JSON.stringify(active.map((m) => markKey(m as unknown as Record<string, unknown>)).sort());
}

/** The PM mark array for an active content mark set (anchors already excluded). */
function buildMarkSet(schema: Schema, active: ContentMark[]): readonly Mark[] {
	let set: readonly Mark[] = [];
	for (const m of active) {
		const pm = pmMarkFromContent(schema, m);
		if (pm) set = pm.addToSet(set);
	}
	return set;
}
