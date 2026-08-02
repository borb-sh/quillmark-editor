// The error channel: what a surface reports when it RECOVERED from a failure.
//
// Every site behind these codes declines to crash: a refused commit falls back, a
// failed paint shows a message, a failed resolve drops the ghosts. The hook exists
// because a `console.error` is not something an app can route, filter or count.
// Nothing gates on the handler, and an absent handler logs.
//
// It is NOT the diagnostics channel. A `Diagnostic` is about the DOCUMENT and is
// drawn on the field it belongs to; an `EditorError` is about the SURFACE and is
// drawn nowhere. A refused scalar commit produces both, deliberately: the
// diagnostic pins to the field, the error reaches the app's sink.
import type { DocPath } from './address.js';

/**
 * What failed. Stable strings rather than an enum: a consumer switches on them,
 * and a new surface adds a code without moving the ones an app already handles.
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
	 *  store is stale for this field. The one code here that leaves damage. */
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
	| 'tip-render-failed'
	/**
	 * A prop a surface binds ONCE was swapped in place, and the surface neither
	 * re-keyed on it nor observed it. The mounted surface still names the previous
	 * handle. `dev` throughout: the fix is a remount at the call site, so this is
	 * aimed at whoever wired it and never at a running app's telemetry.
	 */
	| 'rebind-ignored'
	/**
	 * An instance verb named a card or a field the surface does not hold: a `cardId`
	 * from a previous session or an already-removed card, a `DocPath` naming no
	 * mounted leaf. The call is a no-op and the document is untouched. `dev`: the
	 * editor's own chrome cannot mint a bad target, so this only ever reports a host
	 * driving the verbs from outside.
	 */
	| 'target-unknown';

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
	/** Whatever was thrown, unwrapped: a `QuillmarkError` arrives intact. */
	cause?: unknown;
	/** The field the failure belongs to, where it has one. */
	path?: DocPath;
	/** The page a paint failed on. */
	page?: number;
}

/** The `onError` hook every surface takes. */
export type EditorErrorHandler = (err: EditorError) => void;

/**
 * Report `err`, or log it when nothing is listening: a failure the package
 * recovered from is worth seeing in a console.
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
