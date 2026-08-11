// Positions: the USV ↔ PM map that carries the caret (CODEC §Positions). A content
// offset is a USV code-point index into the flat `text`; a PM position counts node
// tokens. The map is a list of runs (built by the shared `scanDoc` walk, so it can
// never disagree with the content projection) that tile the text: a `text` run
// where PM and USV advance together (converting UTF-16↔USV per code point; the
// hazard: an astral char is two UTF-16 units but one USV), an `nl` run for a
// content `\n` spanning a PM block boundary or hard break, and an `atom` run for a
// `U+FFFC` island slot. `ContentHit.pos` / `FieldRegion.span` reach a PM caret
// through `usvToPM`; a caret signal to the preview runs `pmToUsv` in reverse.
import type { Node as PMNode } from 'prosemirror-model';
import { scanDoc, type PosRun } from './encode.js';

/** A prebuilt line→position index for a PM doc, rebuilt on structural change. */
export interface LineIndex {
	runs: PosRun[];
	usvEnd: number;
	/** PM position at the end of the last content run (the caret-max). */
	pmEndContent: number;
	/** PM content position of the first line (the caret for an empty doc). */
	firstContentStart: number;
}

/** Build the position index for `doc` (walks it once via the shared scanner). */
export function buildLineIndex(doc: PMNode): LineIndex {
	const s = scanDoc(doc);
	const runs = s.runs;
	let pmEndContent = 1;
	let firstContentStart = 1;
	if (runs.length) {
		const first = runs[0];
		firstContentStart = first.pmStart;
		const last = runs[runs.length - 1];
		pmEndContent = runEndPm(last);
	}
	return { runs, usvEnd: s.usvEnd, pmEndContent, firstContentStart };
}

/** PM position just past a run (its exclusive end). */
function runEndPm(run: PosRun): number {
	if (run.kind === 'text') return run.pmStart + run.s.length;
	if (run.kind === 'nl') return run.pmEnd;
	return run.pmStart + 1;
}

const usvStartOf = (run: PosRun) => run.usvStart;
const pmStartOf = (run: PosRun) => run.pmStart;

/**
 * Index of the last run whose `coord` is ≤ `pos`, or `-1` when `pos` precedes the
 * first run. The walk emits runs in document order and every run owns at least one
 * position in each space, so both coordinates increase strictly across the list and
 * the lookup bisects. Bulk conversion is what wants it: `readAnchorsUsv` converts
 * once per anchor on every commit, and a scan would make that O(anchors × runs).
 */
function lastRunAtOrBefore(runs: PosRun[], pos: number, coord: (run: PosRun) => number): number {
	let lo = 0;
	let hi = runs.length - 1;
	let found = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (coord(runs[mid]) <= pos) {
			found = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return found;
}

/** USV content offset → PM position. */
export function usvToPM(index: LineIndex, usvPos: number): number {
	const usv = clamp(usvPos, 0, index.usvEnd);
	if (usv >= index.usvEnd) return index.usvEnd === 0 ? index.firstContentStart : index.pmEndContent;
	// The runs tile the USV space from 0 (every text the walk appends pushes its run
	// first), so below `usvEnd` the run at or before `usv` is the run that owns it.
	const run = index.runs[lastRunAtOrBefore(index.runs, usv, usvStartOf)];
	if (run.kind === 'text') return run.pmStart + utf16OfCodePoints(run.s, usv - run.usvStart);
	return run.pmStart; // nl / atom: the run's single owned position
}

/** PM position → USV content offset. */
export function pmToUsv(index: LineIndex, pmPos: number): number {
	const i = lastRunAtOrBefore(index.runs, pmPos, pmStartOf);
	if (i < 0) return 0; // before the first run's PM position (or no runs at all)
	const run = index.runs[i];
	// PM coverage, unlike USV, has gaps no run owns (a rule's own token). A position
	// in one is past every run that could answer it → the end of the content text.
	if (pmPos >= runEndPm(run)) return index.usvEnd;
	if (run.kind === 'text') return run.usvStart + codePointsOfUtf16(run.s, pmPos - run.pmStart);
	return run.usvStart;
}

// ── UTF-16 ↔ USV conversions within one text run ────────────────────────────

/** UTF-16 length of the first `n` code points of `s`. */
function utf16OfCodePoints(s: string, n: number): number {
	let cp = 0;
	let i = 0;
	while (cp < n && i < s.length) {
		i += charUnitLen(s, i);
		cp++;
	}
	return i;
}

/** Number of whole code points within the first `k` UTF-16 units of `s`. */
function codePointsOfUtf16(s: string, k: number): number {
	let cp = 0;
	let i = 0;
	while (i < k && i < s.length) {
		i += charUnitLen(s, i);
		cp++;
	}
	return cp;
}

/** UTF-16 unit length (1 or 2) of the code point starting at `i`. */
function charUnitLen(s: string, i: number): number {
	const code = s.charCodeAt(i);
	if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
		const next = s.charCodeAt(i + 1);
		if (next >= 0xdc00 && next <= 0xdfff) return 2;
	}
	return 1;
}

function clamp(n: number, lo: number, hi: number): number {
	return n < lo ? lo : n > hi ? hi : n;
}
