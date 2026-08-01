// The error channel: what a surface reports when it RECOVERED from a failure.
//
// Every site here already declined to crash (a refused commit falls back, a
// failed paint shows a message, a failed resolve drops the ghosts) and said so to
// `console.error`, which an app cannot route, filter or count. This gives each one
// a code and a hook, and leaves the recovery exactly as it was: nothing gates on
// the handler, and an absent handler still logs.
//
// It is NOT the diagnostics channel. A `Diagnostic` is about the DOCUMENT and is
// drawn on the field it belongs to; an `EditorError` is about the SURFACE and is
// drawn nowhere. A refused scalar commit produces both, deliberately: the
// diagnostic pins to the field, the error reaches the app's sink.
import type { DocPath } from './address.js';

/**
 * What failed. Stable strings rather than an enum: a consumer switches on them,
 * and the set is open in the sense that a new surface adds a code without moving
 * the ones an app already handles.
 */
export type EditorErrorCode =
	/** A scalar/array/object write the boundary refused. Also pinned as a
	 *  diagnostic on its own field; editing continues, the value is unwritten. */
	| 'commit-refused'
	/** A prose commit whose op path the boundary refused: the leaf re-installed
	 *  the whole projection instead, so the store is correct and this field's
	 *  identity anchors were paid. */
	| 'commit-fallback'
	/** The install fallback ALSO failed: the optimistic PM state stands and the
	 *  store is now stale for this field. The one code here that leaves damage. */
	| 'commit-lost'
	/** A card operation (add, move, remove, retype) that threw. The document is
	 *  unchanged; the boundary's mutators are transactional. */
	| 'card-op-failed'
	/** `quill.validate` threw: this derive contributes no validation diagnostics. */
	| 'validate-failed'
	/** `quill.resolve` threw: ghosted `default:`s fall back to none for this derive. */
	| 'resolve-failed'
	/** A page paint the backend refused. The preview shows its error message state. */
	| 'paint-failed'
	/** `doc.toMarkdown` threw: the source view shows the error text in place. */
	| 'serialize-failed'
	/** A tip's markdown did not render: the tip shows as literal text. */
	| 'tip-render-failed';

/** A failure a surface recovered from. */
export interface EditorError {
	code: EditorErrorCode;
	/**
	 * `error` is a runtime failure an app routes to telemetry; `dev` is a contract
	 * violation aimed at whoever is building against the package. Without the
	 * split every consumer's sink filters the dev codes by hand.
	 */
	severity: 'error' | 'dev';
	/** English, for a log. Not for display: nothing here has a place on screen. */
	message: string;
	/** Whatever was thrown, unwrapped by nothing: a `QuillmarkError` arrives intact. */
	cause?: unknown;
	/** The field the failure belongs to, where it has one. */
	path?: DocPath;
	/** The page a paint failed on. */
	page?: number;
}

/** The `onError` hook every surface takes. */
export type EditorErrorHandler = (err: EditorError) => void;

/**
 * Report `err`, or log it when nothing is listening. The fallback is what keeps a
 * consumer who wires no handler exactly where they were: a failure the package
 * recovered from is still worth seeing in a console.
 *
 * A throwing handler is the consumer's bug and must not become the package's: it
 * is caught, because every call site sits on a recovery path where a second throw
 * would undo the recovery.
 */
export function reportError(handler: EditorErrorHandler | undefined, err: EditorError): void {
	if (!handler) {
		console.error(`[quillmark/ui] ${err.code}: ${err.message}`, err.cause);
		return;
	}
	try {
		handler(err);
	} catch (e) {
		console.error(`[quillmark/ui] onError handler threw while reporting ${err.code}`, e);
	}
}

/** A thrown value's message, for the `message` field. */
export function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
