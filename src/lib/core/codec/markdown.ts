// Markdown at the edges (CODEC §Markdown at the edges). Markdown NEVER represents
// an edit — it is only a boundary format at three seams:
//   paste  — `rebase(fieldCorpus, md)` (cold import + diff, surviving anchors
//            rebased) → splice the returned `delta`.
//   copy   — `exportMarkdown(rt)`, LOSSY: anchors, `underline`, and unknown marks
//            have no markdown projection. `copyWouldDrop` reports the loss so the
//            caller can warn before dropping identity.
//   debug  — read-only source view via the caller's `Document.toMarkdown`.
import { exportMarkdown, rebase } from '../index.js';
import type { Delta, RichText } from '../wasm-types.js';

/** The paste result: the new corpus and the text delta an editor maps positions through. */
export interface PasteResult {
	corpus: RichText;
	delta: Delta;
}

/**
 * Paste markdown into a field's corpus — `rebase` cold-imports `md` and diffs it
 * against `base`, rebasing surviving anchors, returning the new corpus and the
 * `delta`. The caller applies the corpus (its own edit is the whole field) and
 * maps the caret through `delta` (`mapPos`).
 */
export function pasteMarkdown(base: RichText, md: string): PasteResult {
	const { corpus, delta } = rebase(base, md);
	return { corpus, delta };
}

/** The markdown projection of a corpus (LOSSY — see `copyWouldDrop`). */
export function copyMarkdown(rt: RichText): string {
	return exportMarkdown(rt);
}

/** Which mark classes a markdown copy of `rt` would silently drop. */
export interface CopyLoss {
	/** Identity anchors (comment threads, stable refs) — no markdown projection. */
	anchors: boolean;
	/** `underline` marks — no standard markdown syntax. */
	underline: boolean;
	/** Open-set `unknown` marks — carry no markdown. */
	unknown: boolean;
	/** True if any of the above would drop. */
	any: boolean;
}

/**
 * Report whether an `exportMarkdown(rt)` copy would drop identity/underline/
 * unknown marks, so the caller can warn before a lossy copy. Marks only — island
 * fidelity loss (a `degraded`/`unrepresentable` island) is out of scope here and
 * lands with island editing.
 */
export function copyWouldDrop(rt: RichText): CopyLoss {
	let anchors = false;
	let underline = false;
	let unknown = false;
	for (const m of rt.marks) {
		if (m.type === 'anchor') anchors = true;
		else if (m.type === 'underline') underline = true;
		else if (
			m.type !== 'strong' &&
			m.type !== 'emph' &&
			m.type !== 'strike' &&
			m.type !== 'code' &&
			m.type !== 'link'
		)
			unknown = true;
	}
	return { anchors, underline, unknown, any: anchors || underline || unknown };
}
