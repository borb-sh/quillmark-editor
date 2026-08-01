// What the editor EMITS. The editor is unaware of the preview
// (VISUAL_EDITOR §Editor→preview), so nothing here imports it; what the two share
// is `/core`'s address vocabulary, which is what lets a consumer wire the bridge
// as a pass-through rather than a translation.
import type { Addr } from '../core/index.js';

/**
 * Which lane an edit came down. The three differ in COST, not in meaning: prose
 * arrives per keystroke and wants a debounce, a structure op arrives once per
 * gesture and does not. A host that recompiles the same way for all three never
 * reads it.
 */
export type ChangeSource =
	/** A content commit from a prose leaf's own edit. */
	| 'prose'
	/** A scalar/array/object write through the typed writer, or a field cleared. */
	| 'field'
	/** A card operation: add, move, remove, retype, rename, tips dismissal. */
	| 'structure';

/** An edit that LANDED on the document, and which lane it came down. */
export interface EditorChange {
	source: ChangeSource;
	/**
	 * Where it landed, when the change has one place. Absent for a card removal and
	 * a tips dismissal, which are the stack's change rather than a leaf's.
	 */
	addr?: Addr;
}
