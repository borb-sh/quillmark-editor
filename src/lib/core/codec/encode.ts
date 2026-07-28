// Encode — PM → a `ChangeBundle` for `applyChange` (CODEC §Encode). Direction:
// content is truth, PM its projection, edits are OPS. We do NOT re-`install`; we
// lower to `{ delta?, lineOps?, markOps? }` so identity anchors rebase through the
// splice.
//
// Implementation (per the phase brief's permitted route): `pmToContent` is a pure
// inverse of decode; `lower` diffs old→new into ops. Empirically grounded (see
// scratchpad probes): a raw `\n` in the `delta` splits a line and a deleted `\n`
// joins — so ALL text routes through `delta`, `lineOps` carry per-line `setKind` /
// `setContainers` / `setContinues` metadata, and every op reads in ONE coordinate
// space, the post-delta (final) USV content. `applyChange` auto-rebases existing
// marks with start-assoc `after` / end-assoc `before` (== `mapPos`), so the mark
// diff replicates that rebase exactly and is coverage-precise. The one op-
// unreachable edit is island creation: a `delta` insert carrying an island slot
// throws `IslandSlotInInsert`, so `insertReintroducesIslandSlot` flags it for the
// field's `install` fallback.
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { mapPos, isAnchorMark } from '../index.js';
import type {
	ChangeBundle,
	Delta,
	LineOp,
	MarkOp,
	Content,
	ContentContainer,
	ContentIsland,
	ContentLine,
	ContentMark
} from '@quillmark/wasm';
import { codePoints, usvLength } from './decode.js';
import { ISLAND_SLOT, islandEntryFromNode } from './islands.js';
import { contentDescriptorFromPM, descriptorOf, markKey } from './marks.js';

// ── Position-map runs (consumed by positions.ts) ────────────────────────────
// A run is one segment of exact PM↔USV correspondence, in document order.
export type PosRun =
	| { kind: 'text'; pmStart: number; usvStart: number; s: string }
	| { kind: 'nl'; pmStart: number; pmEnd: number; usvStart: number }
	| { kind: 'atom'; pmStart: number; usvStart: number };

export interface Scan {
	text: string;
	lines: ContentLine[];
	marks: ContentMark[];
	islands: ContentIsland[];
	runs: PosRun[];
	/** Total PM position at the end of the document content (doc.content.size). */
	pmEnd: number;
	/** Total USV length of `text`. */
	usvEnd: number;
}

/** A working accumulator threaded through the walk. `usvEnd` is the RUNNING USV
 * length of `text` — every run's `usvStart` reads it and every append advances it.
 * It is a counter rather than a measurement of `text` because the walk runs twice
 * per keystroke and `usvLength` is O(n): measuring per run makes the scan
 * quadratic in the field's length. */
interface Acc extends Scan {
	rawMarks: ContentMark[]; // per-text-node marks, merged into `marks` at the end
	lastContentEndPm: number; // PM position after the previous content line's content
}

/** Append `s` to the accumulated text, advancing the running USV length. */
function appendText(acc: Acc, s: string): void {
	acc.text += s;
	acc.usvEnd += usvLength(s);
}

/**
 * Walk a PM document once, producing the content projection AND the position-map
 * runs (they share the traversal so they can never disagree). This is the single
 * source both `pmToContent` and the position map draw from.
 */
export function scanDoc(doc: PMNode): Scan {
	const acc: Acc = {
		text: '',
		lines: [],
		marks: [],
		islands: [],
		runs: [],
		pmEnd: doc.content.size,
		usvEnd: 0,
		rawMarks: [],
		lastContentEndPm: 0
	};
	scanBlocks(acc, doc, 0, []);
	acc.marks = mergeMarks(acc.rawMarks);
	return acc;
}

/** `pmToContent` — the pure inverse of decode (drops the position runs). */
export function pmToContent(doc: PMNode): Content {
	const { text, lines, marks, islands } = scanDoc(doc);
	return { text, lines, marks, islands };
}

/** Walk a block-content fragment; `contentStart` is the PM pos before its first child. */
function scanBlocks(
	acc: Acc,
	parent: PMNode,
	contentStart: number,
	containers: ContentContainer[]
): void {
	let pm = contentStart;
	parent.forEach((child) => {
		scanBlock(acc, child, pm, containers);
		pm += child.nodeSize;
	});
}

function scanBlock(acc: Acc, node: PMNode, nodePos: number, containers: ContentContainer[]): void {
	const name = node.type.name;
	const contentStart = nodePos + 1;
	switch (name) {
		case 'paragraph':
		case 'heading': {
			// One kind value per block: the opening line and its hard-break
			// continuations read the SAME object, so they cannot disagree.
			const kind = textblockKind(node);
			beginLine(acc, contentStart, containers, kind);
			scanInline(acc, node, contentStart, containers, kind);
			acc.lastContentEndPm = contentStart + node.content.size;
			break;
		}
		case 'code_block': {
			const lang = (node.attrs.lang as string | null) ?? undefined;
			const kind: KindPart = lang != null ? { kind: 'code', lang } : { kind: 'code' };
			beginLine(acc, contentStart, containers, kind);
			const codeText = node.textContent;
			if (codeText.length) emitText(acc, codeText, contentStart, []);
			// Internal `\n`s already sit in the text (and its run); add the extra
			// content lines they imply as `continues` code lines.
			const extra = codeText.split('\n').length - 1;
			for (let i = 0; i < extra; i++) acc.lines.push({ containers, continues: true, ...kind });
			acc.lastContentEndPm = contentStart + node.content.size;
			break;
		}
		case 'horizontal_rule':
			beginLine(acc, nodePos, containers, { kind: 'rule' });
			acc.lastContentEndPm = nodePos + 1;
			break;
		case 'island_block':
			beginLine(acc, nodePos, containers, { kind: 'island' });
			acc.runs.push({ kind: 'atom', pmStart: nodePos, usvStart: acc.usvEnd });
			appendText(acc, ISLAND_SLOT);
			acc.islands.push(
				islandEntryFromNode(node.attrs as { id: string; islandType: string; props: unknown })
			);
			acc.lastContentEndPm = nodePos + 1;
			break;
		case 'blockquote':
			scanBlocks(acc, node, contentStart, [...containers, { container: 'quote' }]);
			break;
		case 'unknown_container':
			scanBlocks(acc, node, contentStart, [
				...containers,
				{ container: node.attrs.container as string, attrs: node.attrs.attrs }
			]);
			break;
		case 'bullet_list':
		case 'ordered_list': {
			const ordered = name === 'ordered_list';
			const start = ordered ? (node.attrs.start as number) : 1;
			let itemPos = contentStart;
			node.forEach((item, _off, index) => {
				const container: ContentContainer = {
					container: 'list_item',
					ordered,
					start,
					ordinal: index
				};
				scanBlocks(acc, item, itemPos + 1, [...containers, container]);
				itemPos += item.nodeSize;
			});
			break;
		}
		default:
			// Unknown block type: treat as an empty paragraph line (defensive).
			beginLine(acc, contentStart, containers, { kind: 'para' });
			acc.lastContentEndPm = contentStart;
	}
}

/** A textblock's line kind: a heading's `level`, or — for a paragraph — `para`, or
 * the unknown kind it carries (schema.ts) re-emitted verbatim. */
function textblockKind(node: PMNode): KindPart {
	if (node.type.name === 'heading') return { kind: 'heading', level: node.attrs.level as number };
	const u = node.attrs.unknown as { kind: string; attrs: unknown } | null;
	return u ? { kind: u.kind, attrs: u.attrs } : { kind: 'para' };
}

/** Open a new content line: emit the boundary `\n` (except the first line) + record. */
function beginLine(
	acc: Acc,
	thisContentStart: number,
	containers: ContentContainer[],
	kind: KindPart
): void {
	if (acc.lines.length > 0) {
		acc.runs.push({
			kind: 'nl',
			pmStart: acc.lastContentEndPm,
			pmEnd: thisContentStart,
			usvStart: acc.usvEnd
		});
		appendText(acc, '\n');
	}
	acc.lines.push({ containers, ...kind });
}

/** Walk a textblock's inline content; emit text/atom/hard-break runs + marks. */
function scanInline(
	acc: Acc,
	block: PMNode,
	contentStart: number,
	containers: ContentContainer[],
	kind: KindPart
): void {
	let pm = contentStart;
	block.forEach((child) => {
		if (child.isText) {
			emitText(acc, child.text ?? '', pm, child.marks);
		} else if (child.type.name === 'hard_break') {
			// A within-block hard break: the content `\n` (a `continues` line).
			acc.runs.push({ kind: 'nl', pmStart: pm, pmEnd: pm + 1, usvStart: acc.usvEnd });
			appendText(acc, '\n');
			acc.lines.push({ containers, continues: true, ...kind });
		} else if (child.type.name === 'island_inline') {
			acc.runs.push({ kind: 'atom', pmStart: pm, usvStart: acc.usvEnd });
			appendText(acc, ISLAND_SLOT);
			acc.islands.push(
				islandEntryFromNode(child.attrs as { id: string; islandType: string; props: unknown })
			);
		}
		pm += child.nodeSize;
	});
}

/** Append a text node's chars: one position run + a content mark per formatting/unknown mark. */
function emitText(acc: Acc, s: string, pmStart: number, marks: readonly Mark[]): void {
	if (!s.length) return;
	const usvStart = acc.usvEnd;
	acc.runs.push({ kind: 'text', pmStart, usvStart, s });
	appendText(acc, s);
	for (const mark of marks) {
		acc.rawMarks.push({
			start: usvStart,
			end: acc.usvEnd,
			...contentDescriptorFromPM(mark)
		} as ContentMark);
	}
}

/** The line-kind half a scanned block contributes — `ContentLineKind` as this
 * encoder emits it, the unknown arm included (a paragraph carrying one re-emits it
 * verbatim rather than flattening to `para`). */
type KindPart =
	| { kind: 'para' }
	| { kind: 'heading'; level: number }
	| { kind: 'code'; lang?: string }
	| { kind: 'island' }
	| { kind: 'rule' }
	| { kind: string; attrs: unknown };

/**
 * Merge adjacent/overlapping same-descriptor marks into maximal ranges — the
 * per-text-node marks the walk emits, folded into the content's normalized form.
 * Same two primitives the mark diff runs on (`groupFormatting` + `union`), so the
 * projection and the diff group and merge by one rule.
 */
function mergeMarks(raw: ContentMark[]): ContentMark[] {
	const out: ContentMark[] = [];
	for (const g of groupFormatting(raw, (m) => ({ start: m.start, end: m.end })).values()) {
		for (const iv of union(g.intervals)) out.push({ ...iv, ...g.descriptor } as ContentMark);
	}
	// Stable, content-like order: by start, then end.
	return out.sort((a, b) => a.start - b.start || a.end - b.end);
}

// ── Lowering: diff old→new into a ChangeBundle ──────────────────────────────

interface LowerOpts {
	/** Anchor decoration positions before the edit (post-nothing) — see field.ts. */
	oldAnchors?: { id: string; pos: number }[];
	/** Anchor decoration positions after the edit, in FINAL (new) USV coords. */
	newAnchors?: { id: string; pos: number }[];
}

/**
 * Lower an edit to a `ChangeBundle` — the diff old→new content into ops.
 *
 * BOTH sides are content, never a PM doc. The caller has already projected the new
 * doc (`pmToContent`) to gate the island-slot fallback, so the projection is
 * theirs to hold: a doc-taking overload re-walks the whole tree, once per
 * keystroke, for a value the caller has in hand.
 */
export function lower(oldRt: Content, newRt: Content, opts: LowerOpts = {}): ChangeBundle {
	const delta = diffText(oldRt.text, newRt.text);
	const lineOps = diffLines(oldRt, newRt);
	const markOps = diffMarks(oldRt, newRt, delta, opts);
	const bundle: ChangeBundle = {};
	if (delta) bundle.delta = delta;
	if (lineOps.length) bundle.lineOps = lineOps;
	if (markOps.length) bundle.markOps = markOps;
	return bundle;
}

/** A minimal single-splice text delta over USV code points, or `undefined` if equal. */
function diffText(oldText: string, newText: string): Delta | undefined {
	if (oldText === newText) return undefined;
	const a = codePoints(oldText);
	const b = codePoints(newText);
	let p = 0;
	const min = Math.min(a.length, b.length);
	while (p < min && a[p] === b[p]) p++;
	let s = 0;
	while (s < min - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
	const ops: Delta['ops'] = [];
	if (p > 0) ops.push({ retain: p });
	const del = a.length - p - s;
	if (del > 0) ops.push({ delete: del });
	const ins = b.slice(p, b.length - s).join('');
	if (ins.length > 0) ops.push({ insert: ins });
	if (s > 0) ops.push({ retain: s });
	return { ops };
}

/** Per-line `setContainers` / `setKind` / `setContinues` when line metadata changed; else none. */
function diffLines(oldRt: Content, newRt: Content): LineOp[] {
	if (lineMetaEqual(oldRt.lines, newRt.lines)) return [];
	const ops: LineOp[] = [];
	// Force every new line's metadata. Redundant ops are safe no-ops (verified),
	// so this is correct regardless of how the delta's split/join inheritance left
	// the intermediate metadata. `continues` is a boundary property of the `\n`
	// preceding a line — line 0 has no predecessor, never carries it, and the op
	// rejects it there, so it's set only for lines ≥ 1.
	for (let i = 0; i < newRt.lines.length; i++) {
		const l = newRt.lines[i];
		ops.push({ op: 'setContainers', line: i, containers: l.containers });
		ops.push(kindOp(i, l));
		if (i > 0) ops.push({ op: 'setContinues', line: i, continues: !!l.continues });
	}
	return ops;
}

/** A line minus its `containers` / `continues` envelope — exactly `setKind`'s
 * payload. Lifting it whole is what keeps this arm-agnostic: `kind` is an OPEN
 * set, so an arm-by-arm switch would have to guess at the unknown arm's payload
 * and would drift on every arm upstream adds. The core build names this shape
 * `ContentLineKind` but the package's entry point does not re-export it, so the
 * op is assembled untyped and cast (DOCUMENT_MODEL §Stability seams). */
function kindPart(l: ContentLine): Record<string, unknown> {
	const { containers: _containers, continues: _continues, ...kind } = l;
	return kind;
}

function kindOp(line: number, l: ContentLine): LineOp {
	return { op: 'setKind', line, ...kindPart(l) } as LineOp;
}

function lineMetaEqual(a: ContentLine[], b: ContentLine[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (!!a[i].continues !== !!b[i].continues) return false;
		if (kindKey(a[i]) !== kindKey(b[i])) return false;
		if (JSON.stringify(a[i].containers) !== JSON.stringify(b[i].containers)) return false;
	}
	return true;
}

/** A line kind's comparison key — key-order-insensitive, because the two sides come
 * from different producers (a WASM read and this scan). */
function kindKey(l: ContentLine): string {
	return JSON.stringify(Object.entries(kindPart(l)).sort(([x], [y]) => (x < y ? -1 : 1)));
}

/**
 * The one edit outside the op vocabulary: a `delta` insert that (re)introduces an
 * island slot. `applyChange` throws `IslandSlotInInsert`, so island *creation* —
 * and any single splice that spans a slot and re-inserts it — must fall back to
 * `install` (paying that field's anchors). Every other structural edit, including
 * a new hard break or a code-interior line, lowers op-wise via `setContinues`.
 */
export function insertReintroducesIslandSlot(oldRt: Content, newRt: Content): boolean {
	const inserted = diffText(oldRt.text, newRt.text)?.ops.find((op) => 'insert' in op) as
		{ insert: string } | undefined;
	return !!inserted?.insert.includes(ISLAND_SLOT);
}

// ── Mark diff ───────────────────────────────────────────────────────────────

interface Interval {
	start: number;
	end: number;
}

/** Formatting/unknown marks → add/remove ops; anchors → add/removeAnchor by id. */
function diffMarks(
	oldRt: Content,
	newRt: Content,
	delta: Delta | undefined,
	opts: LowerOpts
): MarkOp[] {
	const ops: MarkOp[] = [];
	// Rebase old marks through the delta to post-delta coords, exactly as
	// `applyChange` does internally (start assoc `after`, end assoc `before`).
	const rebase = (pos: number, assoc: 'before' | 'after') =>
		delta ? mapPos(delta, pos, assoc) : pos;

	// Group both sides by descriptor key (excluding anchors).
	const oldGroups = groupFormatting(oldRt.marks, (m) => ({
		start: rebase(m.start, 'after'),
		end: rebase(m.end, 'before')
	}));
	const newGroups = groupFormatting(newRt.marks, (m) => ({ start: m.start, end: m.end }));

	const keys = new Set([...oldGroups.keys(), ...newGroups.keys()]);
	for (const key of keys) {
		const oldG = oldGroups.get(key);
		const newG = newGroups.get(key);
		const descriptor = (newG ?? oldG)!.descriptor;
		const oldCov = union((oldG?.intervals ?? []).filter((iv) => iv.end > iv.start));
		const newCov = union((newG?.intervals ?? []).filter((iv) => iv.end > iv.start));
		for (const iv of subtract(oldCov, newCov))
			ops.push({ op: 'remove', start: iv.start, end: iv.end, ...descriptor } as MarkOp);
		for (const iv of subtract(newCov, oldCov))
			ops.push({ op: 'add', start: iv.start, end: iv.end, ...descriptor } as MarkOp);
	}

	// Anchors: diff the decoration sets by id (positions already in final coords).
	if (opts.oldAnchors || opts.newAnchors) {
		const oldA = new Map(
			(opts.oldAnchors ?? []).map((a) => [a.id, delta ? mapPos(delta, a.pos, 'after') : a.pos])
		);
		const newA = new Map((opts.newAnchors ?? []).map((a) => [a.id, a.pos]));
		for (const [id, pos] of newA) {
			if (!oldA.has(id) || oldA.get(id) !== pos) {
				if (oldA.has(id)) ops.push({ op: 'removeAnchor', id });
				ops.push({ op: 'add', start: pos, end: pos, type: 'anchor', id } as MarkOp);
			}
		}
		for (const id of oldA.keys()) if (!newA.has(id)) ops.push({ op: 'removeAnchor', id });
	}
	return ops;
}

interface FormattingGroup {
	descriptor: Record<string, unknown>;
	intervals: Interval[];
}

/** Group non-anchor marks by descriptor key, mapping each to an interval. */
function groupFormatting(
	marks: ContentMark[],
	toInterval: (m: ContentMark) => Interval
): Map<string, FormattingGroup> {
	const groups = new Map<string, FormattingGroup>();
	for (const m of marks) {
		if (isAnchorMark(m)) continue;
		const descriptor = descriptorOf(m);
		const key = markKey(descriptor);
		let g = groups.get(key);
		if (!g) {
			g = { descriptor, intervals: [] };
			groups.set(key, g);
		}
		g.intervals.push(toInterval(m));
	}
	return groups;
}

/** Union a set of intervals into sorted, disjoint, maximal intervals. */
function union(intervals: Interval[]): Interval[] {
	if (!intervals.length) return [];
	const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
	const out: Interval[] = [{ ...sorted[0] }];
	for (let i = 1; i < sorted.length; i++) {
		const last = out[out.length - 1];
		if (sorted[i].start <= last.end) last.end = Math.max(last.end, sorted[i].end);
		else out.push({ ...sorted[i] });
	}
	return out;
}

/** Interval-set subtraction `a \ b` (both assumed unioned/sorted). */
function subtract(a: Interval[], b: Interval[]): Interval[] {
	const out: Interval[] = [];
	for (const iv of a) {
		let cursor = iv.start;
		for (const cut of b) {
			if (cut.end <= cursor || cut.start >= iv.end) continue;
			if (cut.start > cursor) out.push({ start: cursor, end: Math.min(cut.start, iv.end) });
			cursor = Math.max(cursor, cut.end);
			if (cursor >= iv.end) break;
		}
		if (cursor < iv.end) out.push({ start: cursor, end: iv.end });
	}
	return out.filter((iv) => iv.end > iv.start);
}
