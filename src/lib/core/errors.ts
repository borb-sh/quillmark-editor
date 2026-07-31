// The error channel. Every surface recovers from what goes wrong inside it — a
// refused commit keeps the edit and pins a diagnostic, a paint that throws shows a
// message, a `toMarkdown` that throws prints itself into the mirror — and until
// now the only trace of any of it was a `console.error` an embedding app cannot
// route, count, or alert on.
//
// So each surface takes an `onError`, and each of those call sites reports through
// here. It is a REPORT, not a gate: nothing waits on the handler, nothing changes
// behavior on its absence, and the fallback is the console line that was there
// before. What the handler buys is that a production app can put a paint failure
// in its own telemetry and a rejected commit in front of its own user.
import type { Addr } from './index.js';

/**
 * What failed. A closed set, because the point of a code is that a consumer can
 * switch on it; a new surface adds a member rather than a free-form string.
 */
export type EditorErrorCode =
	/** A scalar/array/object write the boundary refused (the value is not stored;
	 *  the editor pins a diagnostic on the field and editing continues). */
	| 'commit'
	/** A content commit the codec could not lower and had to reinstall, or could
	 *  not persist at all (the optimistic PM state stays on screen). */
	| 'prose-commit'
	/** A card operation that threw: add, retype. */
	| 'structure'
	/** `quill.validate(doc)` threw; the editor degrades to no validation. */
	| 'validate'
	/** `quill.resolve(doc)` threw; the editor degrades to no `default:` ghosts. */
	| 'resolve'
	/** A preview page the backend could not raster; the preview shows its message. */
	| 'paint'
	/** `doc.toMarkdown()` threw; the source mirror shows the error text. */
	| 'serialize'
	/** A tip's markdown did not render; the card shows the literal text. */
	| 'render'
	/** A recompile (`session.apply`) threw. Reported by the bundled bridge, which
	 *  is the only part of the package that calls it; a consumer driving `apply`
	 *  itself catches its own throw. */
	| 'apply'
	/** A handle swapped in place, against the remount contract. DEV ONLY, and the
	 *  one code that is a contract violation rather than a failure. */
	| 'rebind';

/** One failure a surface recovered from, as an embedding app sees it. */
export interface EditorError {
	code: EditorErrorCode;
	/** A sentence, already specific: safe to log, not written to be shown to an end
	 *  user (it is not routed through the `strings` contract). */
	message: string;
	/** What was thrown, verbatim: a `QuillmarkError` carrying `diagnostics` at a
	 *  boundary refusal (`isQuillmarkError` narrows it), otherwise whatever the
	 *  failing call raised. Absent for `rebind`, which nothing threw. */
	cause?: unknown;
	/** The leaf it happened at, when it has one. */
	addr?: Addr;
	/** The same place as a canonical `DocPath`, when the surface knows it: what
	 *  `Diagnostic.path` and the preview's own addresses speak. */
	field?: string;
	/** The page, for `paint`. */
	page?: number;
}

/** A surface's `onError`. */
export type EditorErrorHandler = (err: EditorError) => void;

/**
 * Report one failure. With no handler this is the `console.error` line the call
 * site used to write itself, so an app that wires nothing sees exactly what it saw
 * before; with one, nothing reaches the console, because a consumer that took the
 * channel owns what happens to it.
 */
export function reportError(to: EditorErrorHandler | undefined, err: EditorError): void {
	if (to) {
		to(err);
		return;
	}
	console.error(`[quillmark/editor] ${err.message}`, err.cause ?? '');
}
