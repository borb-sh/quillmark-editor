// The errors, in one place. Four producers say something about the document in hand,
// and an author reading them wants one list, not four panels:
//
//   schema   `quill.validate(doc)`  the schema's verdict on the document
//   render   the compile: `session.warnings`, and the diagnostics of a throw
//   carried  the `conform::*` set a repack stranded
//   surface  what an editor or a preview recovered from
//
// Each note keeps its origin and its address, and an address is written in one of two
// spaces. `path` is the document's: the editor routes on it, so a note carrying one
// reaches a control. `location` is the quill source's: a compile failure names a file,
// a line and a column, which routes to nothing here and is what the author's other
// editor opens at. A note with neither is unrouted, naming no place at all, and is the
// one shape visible nowhere but this band.
import { isQuillmarkError, type Diagnostic, type Location, type Severity } from '@quillmark/wasm';

export type Origin = 'schema' | 'render' | 'carried' | 'surface';

export interface Note {
	origin: Origin;
	severity: Severity;
	message: string;
	/** The canonical `DocPath` the diagnostic names: the document's address space, and
	 *  what the editor routes a note to a control by. */
	path?: string;
	/** Where in the quill's own source the diagnostic was raised: the source's address
	 *  space, carried by a compile failure and by nothing the schema says. */
	location?: Location;
	code?: string;
	hint?: string;
}

export interface NoteSet {
	/** Every note, deduplicated, errors first. */
	all: Note[];
	/** How many name no place in either space: not a field, not a line. */
	unrouted: number;
	/** The same set, as the `diagnostics` prop the editor routes by `path`. */
	diagnostics: Diagnostic[];
}

/** Errors before warnings; within a severity, the producer order the caller passed. */
const RANK: Record<Severity, number> = { error: 0, warning: 1 };

/** A source address, as an author's editor spells one. */
export const placeOf = (at: Location): string => `${at.file}:${at.line}:${at.column}`;

/** What makes two notes the same note. The producers overlap by design (a must-fill
 *  field is a schema verdict and a render warning both), and one field's one problem
 *  should read as one line. Both address spaces are in the key: one message raised at
 *  two lines of a plate is two problems. */
const key = (n: Note): string =>
	`${n.severity} ${n.code ?? ''} ${n.path ?? ''} ${n.location ? placeOf(n.location) : ''} ${n.message}`;

export function collect(sources: { origin: Origin; diags: readonly Diagnostic[] }[]): NoteSet {
	const seen = new Map<string, { note: Note; diag: Diagnostic }>();
	for (const { origin, diags } of sources)
		for (const diag of diags) {
			const note: Note = {
				origin,
				severity: diag.severity,
				message: diag.message,
				...(diag.path !== undefined && { path: diag.path }),
				...(diag.location !== undefined && { location: diag.location }),
				...(diag.code !== undefined && { code: diag.code }),
				...(diag.hint !== undefined && { hint: diag.hint })
			};
			const k = key(note);
			// First producer wins the origin label: the earlier source is the more
			// specific claim about why the note exists.
			if (!seen.has(k)) seen.set(k, { note, diag });
		}
	const entries = [...seen.values()].sort((a, b) => RANK[a.note.severity] - RANK[b.note.severity]);
	return {
		all: entries.map((e) => e.note),
		unrouted: entries.filter((e) => e.note.path === undefined && e.note.location === undefined)
			.length,
		diagnostics: entries.map((e) => e.diag)
	};
}

export function messageOf(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * A throw as notes. A `QuillmarkError` carries every diagnostic and a broken plate is
 * the case that matters, so the whole set is unwrapped rather than reported as one
 * line; anything else becomes a single note carrying its message.
 */
export function diagnosticsOf(err: unknown): Diagnostic[] {
	if (isQuillmarkError(err) && err.diagnostics.length > 0) return err.diagnostics;
	return [{ severity: 'error', message: messageOf(err) }];
}
