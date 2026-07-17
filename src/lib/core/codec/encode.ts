// Encode — PM → a `ChangeBundle` for `applyChange` (CODEC §Encode). Direction:
// corpus is truth, PM its projection, edits are OPS. We do NOT re-`install`; we
// lower to `{ delta?, lineOps?, markOps? }` so identity anchors rebase through the
// splice.
//
// Implementation (per the phase brief's permitted route): `pmToRichText` is a pure
// inverse of decode; `lower` diffs old→new into ops. Empirically grounded (see
// scratchpad probes): a raw `\n` in the `delta` splits a line and a deleted `\n`
// joins — so ALL text routes through `delta`, `lineOps` carry only `setKind` /
// `setContainers` metadata, and every op reads in ONE coordinate space, the
// post-delta (final) USV corpus. `applyChange` auto-rebases existing marks with
// start-assoc `after` / end-assoc `before` (== `mapPos`), so the mark diff
// replicates that rebase exactly and is coverage-precise. `applyChange` has no
// `continues` op, so a NEW hard-break / code-internal line is not op-reachable —
// `structureNeedsInstall` flags it for the field's `install` fallback
// (prose/quillmark-issues/0002).
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { mapPos } from '../index.js';
import type {
	ChangeBundle,
	Delta,
	LineOp,
	MarkOp,
	RichText,
	RichTextContainer,
	RichTextIsland,
	RichTextLine,
	RichTextMark
} from '../wasm-types.js';
import { codePoints, usvLength } from './decode.js';
import { ISLAND_SLOT, islandEntryFromNode } from './islands.js';
import { corpusDescriptorFromPM, markKey } from './marks.js';

// ── Position-map runs (consumed by positions.ts) ────────────────────────────
// A run is one segment of exact PM↔USV correspondence, in document order.
export type PosRun =
	| { kind: 'text'; pmStart: number; usvStart: number; s: string }
	| { kind: 'nl'; pmStart: number; pmEnd: number; usvStart: number }
	| { kind: 'atom'; pmStart: number; usvStart: number };

export interface Scan {
	text: string;
	lines: RichTextLine[];
	marks: RichTextMark[];
	islands: RichTextIsland[];
	runs: PosRun[];
	/** Total PM position at the end of the document content (doc.content.size). */
	pmEnd: number;
	/** Total USV length of `text`. */
	usvEnd: number;
}

/** A working accumulator threaded through the walk. */
interface Acc extends Scan {
	rawMarks: RichTextMark[]; // per-text-node marks, merged into `marks` at the end
	lastContentEndPm: number; // PM position after the previous corpus line's content
}

/**
 * Walk a PM document once, producing the corpus projection AND the position-map
 * runs (they share the traversal so they can never disagree). This is the single
 * source both `pmToRichText` and the position map draw from.
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
	acc.usvEnd = usvLength(acc.text);
	acc.marks = mergeMarks(acc.rawMarks);
	return acc;
}

/** `pmToRichText` — the pure inverse of decode (drops the position runs). */
export function pmToRichText(doc: PMNode): RichText {
	const { text, lines, marks, islands } = scanDoc(doc);
	return { text, lines, marks, islands };
}

/** Walk a block-content fragment; `contentStart` is the PM pos before its first child. */
function scanBlocks(
	acc: Acc,
	parent: PMNode,
	contentStart: number,
	containers: RichTextContainer[]
): void {
	let pm = contentStart;
	parent.forEach((child) => {
		scanBlock(acc, child, pm, containers);
		pm += child.nodeSize;
	});
}

function scanBlock(acc: Acc, node: PMNode, nodePos: number, containers: RichTextContainer[]): void {
	const name = node.type.name;
	const contentStart = nodePos + 1;
	switch (name) {
		case 'paragraph':
			beginLine(acc, contentStart, containers, { kind: 'para' });
			scanInline(acc, node, contentStart, containers, { kind: 'para' });
			acc.lastContentEndPm = contentStart + node.content.size;
			break;
		case 'heading':
			beginLine(acc, contentStart, containers, {
				kind: 'heading',
				level: node.attrs.level as number
			});
			scanInline(acc, node, contentStart, containers, {
				kind: 'heading',
				level: node.attrs.level as number
			});
			acc.lastContentEndPm = contentStart + node.content.size;
			break;
		case 'code_block': {
			const lang = (node.attrs.lang as string | null) ?? undefined;
			beginLine(
				acc,
				contentStart,
				containers,
				lang != null ? { kind: 'code', lang } : { kind: 'code' }
			);
			const codeText = node.textContent;
			if (codeText.length) emitText(acc, codeText, contentStart, []);
			// Internal `\n`s already sit in the text (and its run); add the extra
			// corpus lines they imply as `continues` code lines.
			const extra = codeText.split('\n').length - 1;
			for (let i = 0; i < extra; i++) {
				acc.lines.push({
					containers,
					continues: true,
					...(lang != null ? { kind: 'code', lang } : { kind: 'code' })
				});
			}
			acc.lastContentEndPm = contentStart + node.content.size;
			break;
		}
		case 'horizontal_rule':
			beginLine(acc, nodePos, containers, { kind: 'rule' });
			acc.lastContentEndPm = nodePos + 1;
			break;
		case 'island_block':
			beginLine(acc, nodePos, containers, { kind: 'island' });
			acc.runs.push({ kind: 'atom', pmStart: nodePos, usvStart: usvLength(acc.text) });
			acc.text += ISLAND_SLOT;
			acc.islands.push(
				islandEntryFromNode(node.attrs as { id: string; islandType: string; props: unknown })
			);
			acc.lastContentEndPm = nodePos + 1;
			break;
		case 'blockquote':
			scanBlocks(acc, node, contentStart, [...containers, { container: 'quote' }]);
			break;
		case 'bullet_list':
		case 'ordered_list': {
			const ordered = name === 'ordered_list';
			const start = ordered ? (node.attrs.start as number) : 1;
			let itemPos = contentStart;
			node.forEach((item, _off, index) => {
				const container: RichTextContainer = {
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

/** Open a new corpus line: emit the boundary `\n` (except the first line) + record. */
function beginLine(
	acc: Acc,
	thisContentStart: number,
	containers: RichTextContainer[],
	kind: KindPart
): void {
	if (acc.lines.length > 0) {
		acc.runs.push({
			kind: 'nl',
			pmStart: acc.lastContentEndPm,
			pmEnd: thisContentStart,
			usvStart: usvLength(acc.text)
		});
		acc.text += '\n';
	}
	acc.lines.push({ containers, ...kind } as RichTextLine);
}

/** Walk a textblock's inline content; emit text/atom/hard-break runs + marks. */
function scanInline(
	acc: Acc,
	block: PMNode,
	contentStart: number,
	containers: RichTextContainer[],
	kind: KindPart
): void {
	let pm = contentStart;
	block.forEach((child) => {
		if (child.isText) {
			emitText(acc, child.text ?? '', pm, child.marks);
		} else if (child.type.name === 'hard_break') {
			// A within-block hard break: the corpus `\n` (a `continues` line).
			acc.runs.push({ kind: 'nl', pmStart: pm, pmEnd: pm + 1, usvStart: usvLength(acc.text) });
			acc.text += '\n';
			acc.lines.push({ containers, continues: true, ...kind } as RichTextLine);
		} else if (child.type.name === 'island_inline') {
			acc.runs.push({ kind: 'atom', pmStart: pm, usvStart: usvLength(acc.text) });
			acc.text += ISLAND_SLOT;
			acc.islands.push(
				islandEntryFromNode(child.attrs as { id: string; islandType: string; props: unknown })
			);
		}
		pm += child.nodeSize;
	});
}

/** Append a text node's chars: one position run + a corpus mark per formatting/unknown mark. */
function emitText(acc: Acc, s: string, pmStart: number, marks: readonly Mark[]): void {
	if (!s.length) return;
	const usvStart = usvLength(acc.text);
	acc.runs.push({ kind: 'text', pmStart, usvStart, s });
	acc.text += s;
	const len = usvLength(s);
	for (const mark of marks) {
		acc.rawMarks.push({
			start: usvStart,
			end: usvStart + len,
			...corpusDescriptorFromPM(mark)
		} as RichTextMark);
	}
}

type KindPart =
	| { kind: 'para' }
	| { kind: 'heading'; level: number }
	| { kind: 'code'; lang?: string }
	| { kind: 'island' }
	| { kind: 'rule' };

/** Merge adjacent/overlapping same-descriptor marks into maximal ranges. */
function mergeMarks(raw: RichTextMark[]): RichTextMark[] {
	const groups = new Map<string, RichTextMark[]>();
	for (const m of raw) {
		const key = markKey(descriptorOf(m));
		let list = groups.get(key);
		if (!list) groups.set(key, (list = []));
		list.push(m);
	}
	const out: RichTextMark[] = [];
	for (const list of groups.values()) {
		list.sort((a, b) => a.start - b.start);
		let cur = { ...list[0] };
		for (let i = 1; i < list.length; i++) {
			if (list[i].start <= cur.end) {
				cur.end = Math.max(cur.end, list[i].end);
			} else {
				out.push(cur);
				cur = { ...list[i] };
			}
		}
		out.push(cur);
	}
	// Stable, corpus-like order: by start, then end.
	out.sort((a, b) => a.start - b.start || a.end - b.end);
	return out;
}

// ── Lowering: diff old→new into a ChangeBundle ──────────────────────────────

interface LowerOpts {
	/** Anchor decoration positions before the edit (post-nothing) — see field.ts. */
	oldAnchors?: { id: string; pos: number }[];
	/** Anchor decoration positions after the edit, in FINAL (new) USV coords. */
	newAnchors?: { id: string; pos: number }[];
}

/** Lower a PM edit (old corpus + new PM doc) to a `ChangeBundle`. */
export function lower(oldRt: RichText, newDoc: PMNode, opts: LowerOpts = {}): ChangeBundle {
	return diffToBundle(oldRt, pmToRichText(newDoc), opts);
}

/** The core diff old→new corpus → ops. Exported for direct testing. */
export function diffToBundle(oldRt: RichText, newRt: RichText, opts: LowerOpts = {}): ChangeBundle {
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
export function diffText(oldText: string, newText: string): Delta | undefined {
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

/** Per-line `setContainers` + `setKind` when the line metadata changed; else none. */
export function diffLines(oldRt: RichText, newRt: RichText): LineOp[] {
	if (lineMetaEqual(oldRt.lines, newRt.lines)) return [];
	const ops: LineOp[] = [];
	// Force every new line's metadata. Redundant ops are safe no-ops (verified),
	// so this is correct regardless of how the delta's split/join inheritance left
	// the intermediate metadata. `continues` is NOT settable — see
	// structureNeedsInstall for the fallback.
	for (let i = 0; i < newRt.lines.length; i++) {
		ops.push({ op: 'setContainers', line: i, containers: newRt.lines[i].containers });
	}
	for (let i = 0; i < newRt.lines.length; i++) {
		ops.push(kindOp(i, newRt.lines[i]));
	}
	return ops;
}

function kindOp(line: number, l: RichTextLine): LineOp {
	switch (l.kind) {
		case 'heading':
			return { op: 'setKind', line, kind: 'heading', level: l.level };
		case 'code':
			return l.lang != null
				? { op: 'setKind', line, kind: 'code', lang: l.lang }
				: { op: 'setKind', line, kind: 'code' };
		case 'island':
			return { op: 'setKind', line, kind: 'island' };
		case 'rule':
			return { op: 'setKind', line, kind: 'rule' };
		default:
			return { op: 'setKind', line, kind: 'para' };
	}
}

function lineMetaEqual(a: RichTextLine[], b: RichTextLine[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (!!a[i].continues !== !!b[i].continues) return false;
		if (JSON.stringify(kindKey(a[i])) !== JSON.stringify(kindKey(b[i]))) return false;
		if (JSON.stringify(a[i].containers) !== JSON.stringify(b[i].containers)) return false;
	}
	return true;
}
function kindKey(l: RichTextLine): unknown {
	if (l.kind === 'heading') return ['heading', l.level];
	if (l.kind === 'code') return ['code', l.lang ?? null];
	return [l.kind];
}

/**
 * True when reaching `newRt` from `oldRt` is outside the op vocabulary and the
 * field must fall back to `install` (paying that field's anchors):
 *
 *   • the delta's insert would carry an island slot — `applyChange` throws
 *     `IslandSlotInInsert`, so island creation, and any single-splice edit that
 *     spans a slot and re-inserts it, are not op-reachable;
 *   • the `continues` flags ops cannot touch: `applyChange` has no `continues`
 *     op — a retained `\n` keeps its line's flag, a deleted `\n` joins (its
 *     flag vanishes), an inserted `\n` splits into a REAL line (`continues`
 *     false). Any new-side flag vector that splice model cannot produce (a new
 *     hard break, a code-internal line, a break↔split swap at unchanged text)
 *     requires install.
 *
 * Errs toward `install` — correctness over anchor preservation for rare edits.
 */
export function structureNeedsInstall(oldRt: RichText, newRt: RichText): boolean {
	const delta = diffText(oldRt.text, newRt.text);
	if (delta) {
		const inserted = delta.ops.find((op) => 'insert' in op) as { insert: string } | undefined;
		if (inserted?.insert.includes(ISLAND_SLOT)) return true;
	}
	return !continuesReachable(oldRt, newRt, delta);
}

/** Whether the splice model above yields exactly `newRt`'s `continues` vector. */
function continuesReachable(oldRt: RichText, newRt: RichText, delta: Delta | undefined): boolean {
	// Line 0 never continues anything; a flip there is unreachable by definition.
	if (!!oldRt.lines[0]?.continues !== !!newRt.lines[0]?.continues) return false;
	const actual = newRt.lines.slice(1).map((l) => !!l.continues);
	const oldFlags = oldRt.lines.slice(1).map((l) => !!l.continues);
	if (!delta) return sameFlags(actual, oldFlags);

	// The single splice in USV coords: [p, p+del) replaced by `ins`.
	let p = 0;
	let del = 0;
	let ins = '';
	for (const op of delta.ops) {
		if ('retain' in op) {
			if (del === 0 && ins === '') p = op.retain;
		} else if ('delete' in op) del = op.delete;
		else ins = op.insert;
	}

	// Boundary j (the j-th `\n` of the old text) carries old line j+1's flag.
	// Expected new vector: surviving pre-splice boundaries, then one REAL line
	// per inserted `\n`, then surviving post-splice boundaries.
	const cps = codePoints(oldRt.text);
	const boundaries: { pos: number; flag: boolean }[] = [];
	for (let i = 0, j = 0; i < cps.length; i++) {
		if (cps[i] === '\n') boundaries.push({ pos: i, flag: oldFlags[j++] });
	}
	const expected: boolean[] = [];
	for (const b of boundaries) if (b.pos < p) expected.push(b.flag);
	for (const c of ins) if (c === '\n') expected.push(false);
	for (const b of boundaries) if (b.pos >= p + del) expected.push(b.flag);
	return sameFlags(actual, expected);
}

function sameFlags(a: boolean[], b: boolean[]): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

// ── Mark diff ───────────────────────────────────────────────────────────────

interface Interval {
	start: number;
	end: number;
}

/** Formatting/unknown marks → add/remove ops; anchors → add/removeAnchor by id. */
export function diffMarks(
	oldRt: RichText,
	newRt: RichText,
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

function descriptorOf(m: RichTextMark): Record<string, unknown> {
	if (m.type === 'link') return { type: 'link', url: (m as { url: string }).url };
	if ('attrs' in m && m.type !== 'anchor')
		return { type: m.type, attrs: (m as { attrs: unknown }).attrs };
	return { type: m.type };
}

/** Group non-anchor marks by descriptor key, mapping each to an interval. */
function groupFormatting(
	marks: RichTextMark[],
	toInterval: (m: RichTextMark) => Interval
): Map<string, FormattingGroup> {
	const groups = new Map<string, FormattingGroup>();
	for (const m of marks) {
		if (m.type === 'anchor') continue;
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
