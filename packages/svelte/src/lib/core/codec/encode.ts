// Encode: PM → a `ChangeBundle` for `applyChange` (CODEC §Encode). Content is truth,
// PM its projection, and an edit lowers to `{ delta?, islandOps?, lineOps?, markOps? }`
// rather than re-`overwrite`ing, so identity anchors rebase through the splice.
//
// `pmToContent` is decode's pure inverse; `lower` diffs old→new into ops. A raw `\n`
// in the `delta` splits a line and a deleted `\n` joins: so all text routes through
// `delta`, `lineOps` carry per-line `setKind` /
// `setContainers` / `setContinues` metadata, and an island's payload rides
// `islandOps`, the one channel that reaches it. Every op reads in one coordinate
// space, the final USV content (delta then island ops applied). `applyChange`
// auto-rebases existing marks with start-assoc `after` / end-assoc `before`
// (== `mapPos`) through both text-moving channels, so the mark diff replicates
// that rebase exactly and is coverage-precise.
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { isAnchorMark } from '@quillmark/wasm';
import type {
	ChangeBundle,
	Delta,
	IslandOp,
	LineOp,
	MarkOp,
	Content,
	ContentContainer,
	ContentIsland,
	ContentLine,
	ContentLineKind,
	ContentMark
} from '@quillmark/wasm';
import { core } from '../lifecycle.js';
import { codePoints, usvLength } from './decode.js';
import { ISLAND_SLOT, islandEntryFromNode, type IslandNodeAttrs } from './islands.js';
import { contentDescriptorFromPM, descriptorOf, markKey } from './marks.js';
import { valueEqual } from './reconcile.js';

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

/** A working accumulator threaded through the walk. `usvEnd` is the running USV
 * length of `text`: every run's `usvStart` reads it and every append advances it.
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
 * Walk a PM document once, producing the content projection and the position-map
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

/** `pmToContent`: the pure inverse of decode (drops the position runs). */
export function pmToContent(doc: PMNode): Content {
	const { text, lines, marks, islands } = scanDoc(doc);
	return { text, lines, marks, islands };
}

/** Walk a block-content fragment; `contentStart` is the PM pos before its first child.
 * Two container siblings of one run shape read as a single container — contiguity plus
 * an equal path is what the store means by "the same one" — so each alternates its
 * `instance` against the sibling before it. Sibling adjacency is the whole scope: a
 * container one level in has a differing path above it, which already tells it apart. */
function scanBlocks(
	acc: Acc,
	parent: PMNode,
	contentStart: number,
	containers: ContentContainer[]
): void {
	let pm = contentStart;
	let prevShape: string | null = null;
	let instance = 0;
	parent.forEach((child) => {
		const shape = runShape(child);
		instance = shape !== null && shape === prevShape ? instance ^ 1 : 0;
		prevShape = shape;
		scanBlock(acc, child, pm, containers, instance);
		pm += child.nodeSize;
	});
}

/** A block's container run shape, `ordinal` and `instance` aside; null where it opens
 * no container. A list's `start` is not in it — the store welds two runs differing only
 * there — and an unknown's `attrs` is, as `containerKey` reads it on the way back. */
function runShape(node: PMNode): string | null {
	switch (node.type.name) {
		case 'blockquote':
			return 'quote';
		case 'bullet_list':
			return 'list\u0000bullet';
		case 'ordered_list':
			return 'list\u0000ordered';
		case 'unknown_container':
			return `unknown\u0000${node.attrs.container}\u0000${JSON.stringify(node.attrs.attrs)}`;
		default:
			return null;
	}
}

function scanBlock(
	acc: Acc,
	node: PMNode,
	nodePos: number,
	containers: ContentContainer[],
	instance: number
): void {
	const name = node.type.name;
	const contentStart = nodePos + 1;
	switch (name) {
		case 'paragraph':
		case 'heading': {
			// One kind value per block: the opening line and its hard-break
			// continuations read the same object, so they cannot disagree.
			const kind = textblockKind(node);
			beginLine(acc, contentStart, containers, kind);
			scanInline(acc, node, contentStart, containers, kind);
			acc.lastContentEndPm = contentStart + node.content.size;
			break;
		}
		case 'code_block': {
			const lang = (node.attrs.lang as string | null) ?? undefined;
			const kind: ContentLineKind = lang != null ? { kind: 'code', lang } : { kind: 'code' };
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
			acc.islands.push(islandEntryFromNode(node.attrs as IslandNodeAttrs));
			acc.lastContentEndPm = nodePos + 1;
			break;
		case 'blockquote':
			scanBlocks(acc, node, contentStart, [...containers, { container: 'quote', instance }]);
			break;
		case 'unknown_container':
			scanBlocks(acc, node, contentStart, [
				...containers,
				{ container: node.attrs.container as string, attrs: node.attrs.attrs, instance }
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
					ordinal: index,
					instance
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

/** A textblock's line kind: a heading's `level`, or (for a paragraph) `para`, or
 * the unknown kind it carries (schema.ts) re-emitted verbatim. */
function textblockKind(node: PMNode): ContentLineKind {
	if (node.type.name === 'heading') return { kind: 'heading', level: node.attrs.level as number };
	const u = node.attrs.unknown as { kind: string; attrs: unknown } | null;
	return u ? { kind: u.kind, attrs: u.attrs } : { kind: 'para' };
}

/** Open a new content line: emit the boundary `\n` (except the first line) + record. */
function beginLine(
	acc: Acc,
	thisContentStart: number,
	containers: ContentContainer[],
	kind: ContentLineKind
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
	kind: ContentLineKind
): void {
	let pm = contentStart;
	block.forEach((child) => {
		if (child.isText) {
			const text = child.text ?? '';
			emitText(acc, text, pm, child.marks);
			// A `\n` in a textblock that is not `whitespace: 'pre'` is the same line
			// boundary a hard break is: `paragraph` is `inline*`, so the schema admits
			// one, and `joinTextblocksAround` — a bare `replaceStep` running neither
			// `clearIncompatible` nor `replaceNewlines` — leaves one. It rides the text
			// run, where PM and USV advance together.
			const breaks = text.split('\n').length - 1;
			for (let i = 0; i < breaks; i++) acc.lines.push({ containers, continues: true, ...kind });
		} else if (child.type.name === 'hard_break') {
			// A within-block hard break: the content `\n` (a `continues` line).
			acc.runs.push({ kind: 'nl', pmStart: pm, pmEnd: pm + 1, usvStart: acc.usvEnd });
			appendText(acc, '\n');
			acc.lines.push({ containers, continues: true, ...kind });
		} else if (child.type.name === 'island_inline') {
			acc.runs.push({ kind: 'atom', pmStart: pm, usvStart: acc.usvEnd });
			appendText(acc, ISLAND_SLOT);
			acc.islands.push(islandEntryFromNode(child.attrs as IslandNodeAttrs));
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

/**
 * Merge adjacent/overlapping same-descriptor marks into maximal ranges: the
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
	/** Anchor decoration positions before the edit (post-nothing); see field.ts. */
	oldAnchors?: { id: string; pos: number }[];
	/** Anchor decoration positions after the edit, in final (new) USV coords. */
	newAnchors?: { id: string; pos: number }[];
}

/**
 * One old→new content edit with the text splice it implies. Both sides are content,
 * never a PM doc: the projection of the new doc (`pmToContent`) is the caller's to
 * hold, because a doc-taking overload re-walks the whole tree, once per keystroke,
 * for a value the caller has in hand.
 *
 * The splice rides along because `diffText` allocates a code-point array per side
 * and the commit path holds the edit across the lowering. `contentEdit` being its
 * only constructor is what keeps a `delta` from disagreeing with the contents it
 * was diffed from; `lower` is where a slot inside that splice moves to the island
 * channel, so this `delta` is the raw splice, not always the one committed.
 */
export interface ContentEdit {
	readonly oldRt: Content;
	readonly newRt: Content;
	/** The minimal single splice, or absent when the text is unchanged. */
	readonly delta?: Delta;
}

/** The edit `oldRt` → `newRt`: diffs the text once. */
export function contentEdit(oldRt: Content, newRt: Content): ContentEdit {
	const delta = diffText(oldRt.text, newRt.text);
	return delta ? { oldRt, newRt, delta } : { oldRt, newRt };
}

/** Lower an edit to a `ChangeBundle`: the old→new content diff, as ops. */
export function lower(edit: ContentEdit, opts: LowerOpts = {}): ChangeBundle {
	const { oldRt, newRt } = edit;
	const { delta, islandOps, insertedAt } = splitIslands(edit);
	const lineOps = diffLines(oldRt, newRt, edit.delta);
	const markOps = diffMarks(oldRt, newRt, delta, insertedAt, opts);
	const bundle: ChangeBundle = {};
	if (delta) bundle.delta = delta;
	if (islandOps.length) bundle.islandOps = islandOps;
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

/**
 * Whether the splice moves a line boundary — a `\n` deleted, or one inserted. Where
 * it does not, every line keeps the metadata it had and equal metadata on both sides
 * is the whole story. Where it does, the store's split/join inheritance decides what
 * each line ends up carrying, and an array that still matches position for position
 * says nothing about it: one splice that both joins a boundary and opens another
 * leaves the line count and the metadata array unchanged while the kinds slide.
 */
function movesBoundary(oldText: string, delta: Delta | undefined): boolean {
	if (!delta) return false;
	let at = 0;
	let cps: string[] | undefined;
	for (const op of delta.ops) {
		if ('retain' in op) at += op.retain;
		else if ('insert' in op) {
			if (op.insert.includes('\n')) return true;
		} else {
			cps ??= codePoints(oldText);
			if (cps.slice(at, at + op.delete).includes('\n')) return true;
			at += op.delete;
		}
	}
	return false;
}

/** Per-line `setContainers` / `setKind` / `setContinues` when line metadata changed or
 *  the splice moved a boundary; else none. */
function diffLines(oldRt: Content, newRt: Content, delta: Delta | undefined): LineOp[] {
	if (!movesBoundary(oldRt.text, delta) && lineMetaEqual(oldRt.lines, newRt.lines)) return [];
	const ops: LineOp[] = [];
	// Force every new line's metadata. Redundant ops are safe no-ops (verified),
	// so this is correct regardless of how the delta's split/join inheritance left
	// the intermediate metadata. `continues` is a boundary property of the `\n`
	// preceding a line: line 0 has no predecessor, never carries it, and the op
	// rejects it there, so it's set only for lines ≥ 1.
	for (let i = 0; i < newRt.lines.length; i++) {
		const l = newRt.lines[i];
		ops.push({ op: 'setContainers', line: i, containers: l.containers });
		ops.push(kindOp(i, l));
		if (i > 0) ops.push({ op: 'setContinues', line: i, continues: !!l.continues });
	}
	return ops;
}

/** A line minus its `containers` / `continues` envelope: exactly `setKind`'s
 * payload, which the boundary names `ContentLineKind`. Lifting it whole is what
 * keeps this arm-agnostic: `kind` is an open set, so an arm-by-arm switch would
 * have to guess at the unknown arm's payload and would drift on every arm
 * upstream adds. */
function kindPart(l: ContentLine): ContentLineKind {
	const { containers: _containers, continues: _continues, ...kind } = l;
	return kind;
}

function kindOp(line: number, l: ContentLine): LineOp {
	return { op: 'setKind', line, ...kindPart(l) };
}

function lineMetaEqual(a: ContentLine[], b: ContentLine[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (!!a[i].continues !== !!b[i].continues) return false;
		if (kindKey(a[i]) !== kindKey(b[i])) return false;
		if (!valueEqual(a[i].containers, b[i].containers)) return false;
	}
	return true;
}

/** A line kind's comparison key: key-order-insensitive, because the two sides come
 * from different producers (a WASM read and this scan). */
function kindKey(l: ContentLine): string {
	return JSON.stringify(Object.entries(kindPart(l)).sort(([x], [y]) => (x < y ? -1 : 1)));
}

// ── Island channel ──────────────────────────────────────────────────────────

/** The delta and the island ops it had to hand a slot to. */
interface IslandSplit {
	/** The edit's splice with every island slot stripped from its insert; absent
	 *  when what remains is pure retains (the insert carried nothing else). */
	delta?: Delta;
	islandOps: IslandOp[];
	/** The `insert` ops' positions, ascending, in final coords: what a mark rebase
	 *  shifts through after the delta. */
	insertedAt: number[];
}

/**
 * Split the edit's islands off the text splice. `applyChange` throws
 * `IslandSlotInInsert` on a `delta` that types a slot, so a slot never rides the
 * delta: every slot inside the splice's inserted region is stripped from it and
 * placed by `{ op: 'insert', at }`, which carries the backing entry in the same
 * op. Every other island kept its slot, so a changed payload is `{ op: 'set' }`,
 * addressed by the id both sides carry. A deleted island needs no op at all: the
 * delta that removes its slot drops the entry.
 *
 * `at` is the slot's position in the final text: inserts apply left to right, so
 * by the time the k-th lands, the k slots before it are back in place.
 *
 * The pairing is positional for `insert` and by id for `set`, which is what each
 * addresses by. An id the store does not carry emits nothing rather than a `set`
 * that would throw `UnknownIslandId`: nothing mints or renames an island id, so
 * it is unreachable.
 */
function splitIslands(edit: ContentEdit): IslandSplit {
	const { oldRt, newRt, delta } = edit;
	const slots = slotPositions(newRt.text);
	const { start, end } = insertedRegion(delta);
	const oldById = new Map(oldRt.islands.map((isl) => [isl.id, isl]));
	const islandOps: IslandOp[] = [];
	const insertedAt: number[] = [];
	newRt.islands.forEach((isl, i) => {
		const at = slots[i];
		if (at !== undefined && at >= start && at < end) {
			islandOps.push({ op: 'insert', at, ...isl });
			insertedAt.push(at);
		} else {
			const before = oldById.get(isl.id);
			if (before && !valueEqual(before, isl)) islandOps.push({ op: 'set', ...isl });
		}
	});
	return {
		delta: insertedAt.length && delta ? withoutSlots(delta) : delta,
		islandOps,
		insertedAt
	};
}

/** The USV positions of `text`'s island slots, in document order: the i-th is the
 *  i-th island's, since the scan appends an entry per slot it writes. */
function slotPositions(text: string): number[] {
	const out: number[] = [];
	let usv = 0;
	for (const cp of text) {
		if (cp === ISLAND_SLOT) out.push(usv);
		usv++;
	}
	return out;
}

/** The splice's inserted region `[start, end)` in final coords. `diffText` emits
 *  one `[retain?][delete?][insert?][retain?]`, so the leading retain is where the
 *  insert lands and its length is how far it reaches. */
function insertedRegion(delta: Delta | undefined): { start: number; end: number } {
	if (!delta) return { start: 0, end: 0 };
	const lead = delta.ops[0];
	const start = lead && 'retain' in lead ? lead.retain : 0;
	const insert = delta.ops.find((op) => 'insert' in op) as { insert: string } | undefined;
	return { start, end: start + (insert ? usvLength(insert.insert) : 0) };
}

/** The delta with every island slot removed from its insert, or `undefined` when
 *  that leaves nothing but retains. Retain/delete arithmetic reads the old text,
 *  so dropping inserted characters leaves the rest of the splice intact. */
function withoutSlots(delta: Delta): Delta | undefined {
	const ops: Delta['ops'] = [];
	let splices = false;
	for (const op of delta.ops) {
		if ('insert' in op) {
			const kept = op.insert.split(ISLAND_SLOT).join('');
			if (kept.length) {
				ops.push({ insert: kept });
				splices = true;
			}
		} else {
			if ('delete' in op) splices = true;
			ops.push(op);
		}
	}
	return splices ? { ops } : undefined;
}

/**
 * A post-delta position carried through the bundle's island inserts, which move
 * text exactly as the delta does and rebase marks by the same rule (start-assoc
 * `after`, end-assoc `before`; an anchor is a point and holds `before`). Ascending
 * `at`s apply left to right, so each comparison reads the running position.
 */
function shiftPastIslands(pos: number, insertedAt: number[], assoc: 'before' | 'after'): number {
	let p = pos;
	for (const at of insertedAt) if (assoc === 'after' ? p >= at : p > at) p++;
	return p;
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
	insertedAt: number[],
	opts: LowerOpts
): MarkOp[] {
	const ops: MarkOp[] = [];
	// Read the gate once per diff rather than once per mark.
	const { mapPos } = core();
	// Rebase old marks through both text-moving channels to final coords, exactly
	// as `applyChange` does internally (start assoc `after`, end assoc `before`).
	const rebase = (pos: number, assoc: 'before' | 'after') =>
		shiftPastIslands(delta ? mapPos(delta, pos, assoc) : pos, insertedAt, assoc);

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
			(opts.oldAnchors ?? []).map((a) => [
				a.id,
				shiftPastIslands(delta ? mapPos(delta, a.pos, 'after') : a.pos, insertedAt, 'before')
			])
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
