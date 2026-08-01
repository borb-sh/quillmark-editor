// The VisualEditor's public props, declared once and read by both halves of the
// surface: `VisualEditor` (the door, which re-keys on `doc`) and
// `VisualEditorInner` (the editor, which mounts once per key). A component cannot
// export a type without a module script, and a type imported ACROSS the two would
// make the pair circular, so the shape lives beside them instead.
import type {
	Document,
	Quill,
	Addr,
	Diagnostic,
	Place,
	EditorErrorHandler
} from '../core/index.js';
import type { EditorChange } from './signals.js';
import type { FormatDiagnostic, VisualStringsInput } from './strings.js';

export interface VisualEditorProps {
	doc: Document;
	quill: Quill;
	/** The active leaf's address (normalized to a plain `{card?, field?}`). */
	onActiveAddrChange?: (addr: Addr) => void;
	/**
	 * A caret move in the active leaf, carrying the canonical `DocPath` the
	 * preview also speaks: `onCaretMove={preview.focusPosition}` is the whole
	 * editor→preview bridge, no translation and no `doc.cards` read on the
	 * keystroke path (the editor mints the path off its derived card tree, which
	 * already holds every kind).
	 *
	 * A SELECTION signal, not a change signal: an arrow key fires it and commits
	 * nothing. One keystroke fires `onChange` first and this second, so the edit
	 * has landed by the time the caret names where it is.
	 */
	onCaretMove?: (at: Place) => void;
	/**
	 * EVERY edit that lands on the document: a prose commit, a scalar/array/object
	 * write, a card operation. The signal a host recompiles off; `source` is what
	 * moved, for a host that wants a structure op to recompile at once and a
	 * keystroke to wait for the burst to settle.
	 */
	onChange?: (change: EditorChange) => void;
	/**
	 * Failures the editor RECOVERED from: a commit the boundary refused (also
	 * pinned as a diagnostic on its field), a card operation that threw, a
	 * `validate`/`resolve` that threw, a prose commit that fell back. None of them
	 * stop editing; without this hook each is a `console.error` an app cannot
	 * route. Reaches the prose leaves too, so one handler covers the surface.
	 */
	onError?: EditorErrorHandler;
	/**
	 * External diagnostics, routed by `.path` and merged with `quill.validate`
	 * and local commit errors (VISUAL_EDITOR §Diagnostics).
	 */
	diagnostics?: Diagnostic[];
	/**
	 * Consumer policy hook: given a field `addr` and an enum option,
	 * return `false` to mark that option unavailable. A disallowed option renders
	 * DISABLED (never stripped), so an already-authored value stays visible and its
	 * stored payload is untouched: the schema is unchanged, this is runtime policy.
	 * Absent → every schema option is offered (the default, zero behavior change).
	 */
	enumOptionAllowed?: (addr: Addr, value: string) => boolean;
	/**
	 * Every word the surface says, keyed and partial: unset keys take the package's
	 * English. Several are ACCESSIBLE NAMES rather than decoration, so this is what
	 * a product shipping in another language replaces. The empty body's per-kind
	 * wording is the `bodyPlaceholder` key here rather than a prop of its own.
	 */
	strings?: VisualStringsInput;
	/**
	 * A boundary `Diagnostic` → the text shown under its field. Returning
	 * `undefined` takes the diagnostic's own message, which is the arm the parse and
	 * render lanes need: their parameters exist only inside that English string.
	 */
	formatDiagnostic?: FormatDiagnostic;
	/** Appended to the root's own class: the surface is a mounted element the
	 * consumer positions, so it needs a handle for layout it owns. */
	class?: string;
	/** Merged onto the root. Free because the derivation moved off this attribute
	 *  and onto `data-qm-root` (core/theme.css). */
	style?: string;
}
