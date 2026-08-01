// The error channel: every failure a surface recovers from, reported to the
// consumer's `onError` and falling to `console.error` when unset (ARCHITECTURE
// §"The error channel"). Framework-free and handle-free, so all three surfaces and
// the codec report through one shape.
//
// Nothing here gates or throws: a reported failure is one the surface already
// recovered from (a page that would not paint, a serialize that fell back to its
// message, a commit the boundary refused). The channel is observation, not control
// flow.

/**
 * The failure site, stable across wordings: a sink routes on this and never parses
 * `message`. Dotted `subject.verb`, one code per site a surface can recover from.
 */
export type EditorErrorCode =
	/** A page's canvas paint threw; the preview shows its error state. */
	| 'preview.paint'
	/** `doc.toMarkdown()` threw; the source view shows the message in place. */
	| 'source.serialize'
	/** A prose leaf's `applyChange` threw; the full projection is installed instead. */
	| 'content.commit'
	/** The install fallback threw too; the optimistic PM state stands, the store is stale. */
	| 'content.install'
	/** A scalar/array/object commit threw; the value is not written and a diagnostic is pinned. */
	| 'field.commit'
	/** Seeding or inserting a card threw; the stack is unchanged. */
	| 'card.insert'
	/** `doc.setCardKind` threw; the card keeps its kind. */
	| 'card.retype'
	/** `quill.validate` threw; that revision contributes no diagnostics. */
	| 'quill.validate'
	/** `quill.resolve` threw; the ghosted defaults fall back to none. */
	| 'quill.resolve'
	/** A tip's markdown did not render; the literal text is shown. */
	| 'tip.render'
	/** `dev`: a handle prop was swapped in place on a surface that binds once. */
	| 'surface.rebind';

/**
 * `dev` marks a violation of the package's own contract — reachable only by a
 * consumer wiring the surface wrong, never by a document, a quill, or a user. A
 * telemetry sink drops the whole class on this field rather than by listing codes.
 */
export type ErrorSeverity = 'error' | 'dev';

/** One reported failure. `cause` is the caught value verbatim: a `QuillmarkError`
 * carrying `diagnostics` narrows through `isQuillmarkError`. */
export interface EditorError {
	code: EditorErrorCode;
	/** English, for a log line; a product routes on `code` and writes its own. */
	message: string;
	severity: ErrorSeverity;
	cause?: unknown;
}

/** The consumer's hook: given to a surface as `onError`, called for every
 * {@link EditorError} that surface reports. */
export type ErrorSink = (error: EditorError) => void;

/** A surface's bound reporter: {@link createReport} makes one per mounted surface. */
export type Report = (
	code: EditorErrorCode,
	message: string,
	opts?: { cause?: unknown; severity?: ErrorSeverity }
) => void;

/**
 * Bind a surface's `onError` into a reporter, or fall to `console.error` when the
 * consumer passed none — so a surface reports unconditionally and no call site
 * carries the fallback.
 *
 * The sink is read through a getter, not captured: a surface holds its options for
 * its lifetime, and a wrapper whose `onError` prop moves reports to the current one.
 */
export function createReport(sinkOf: () => ErrorSink | undefined): Report {
	return (code, message, opts) => {
		const error: EditorError = {
			code,
			message,
			severity: opts?.severity ?? 'error',
			...(opts && 'cause' in opts ? { cause: opts.cause } : {})
		};
		const sink = sinkOf();
		if (sink) sink(error);
		else console.error(`[quillmark/ui] ${code}: ${message}`, error.cause);
	};
}
