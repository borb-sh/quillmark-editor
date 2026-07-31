// What the editor EMITS: one payload per hook, and the reason each is its own
// hook. The editor is unaware of the preview (VISUAL_EDITOR §Editor→preview), so
// nothing here imports it; what the two share is `/core`'s address grammar, which
// is what lets a consumer wire the bridge as a pass-through rather than a
// translation.
import type { Addr, CardInput } from '../core/index.js';

/**
 * Where a caret is, in BOTH addressings: the canonical `DocPath` (`field`, what
 * the preview, `session.regions()` and every `Diagnostic.path` speak) and the
 * editor's own `Addr`. The editor mints the path off its derived card tree, which
 * already holds every kind, so the bridge costs no `doc.cards` read on the
 * keystroke path and the consumer joins two surfaces without translating between
 * their grammars.
 *
 * `field` is structurally the preview's own `{ field, pos }` argument, so the
 * editor→preview hop is a pass-through exactly as the preview→editor hop
 * (`onCaretPick` → `setCaret`) already is.
 */
export interface CaretMove {
	/** `main.subject` / `main.body` / `cards.<kind>[i].<field>`. */
	field: string;
	/** The caret in USV, the shared content coordinate. */
	pos: number;
	/** The same leaf as the editor addresses it: `{card?, field?}`. */
	addr: Addr;
}

/** The active leaf, in both addressings ({@link CaretMove} without a caret). */
export interface ActiveField {
	field: string;
	addr: Addr;
}

/** An edit that LANDED on the document, and which lane it came down. */
export interface EditorChange {
	/**
	 * `prose` a content commit from a leaf's own edit; `field` a scalar/array/object
	 * write through the typed writer; `structure` a card operation (add, move,
	 * remove, retype, rename, tips dismissal).
	 *
	 * The three differ in cost, not in meaning: prose arrives per keystroke and
	 * wants a debounce, structure arrives once per gesture and does not. A host
	 * that recompiles the same way for all three never reads this.
	 */
	source: 'prose' | 'field' | 'structure';
	/** Where it landed, when the change has one place: absent for a card removal
	 *  and a tips dismissal, which are the stack's change rather than a leaf's. */
	addr?: Addr;
}

/**
 * What a consumer snippet is handed for the card it renders into: the card's
 * IDENTITY (the address a consumer's own reads take, and the kind that keys its
 * schema), and the three structure verbs.
 *
 * The verbs are here rather than left to `doc.insertCard` because the editor owns
 * card identity: a consumer mutating the card array behind it leaves the stable-id
 * array a position short and every later address off by one, with nothing raised.
 * An extension point over a structure the surface owns has to hand over the
 * surface's own verbs, or it hands over a footgun.
 *
 * All three go down the same path as the editor's own controls, so each fires
 * `onChange` with `source: 'structure'` and a host driving a recompile off that
 * needs no flush of its own.
 *
 * `main` has no position: `addr.card` is undefined for it, its `remove`/`move` are
 * no-ops, and `insertAfter` puts the card at the front of the stack. There is no
 * "duplicate main": a document has exactly one main card, so an action that copies
 * a card gates on `!isMain` (the README's does).
 */
export interface CardContext {
	addr: Addr;
	kind: string;
	isMain: boolean;
	/** Insert after this card. A `Card` read off `doc.cards` is a valid `CardInput`,
	 *  so "duplicate" is `insertAfter(doc.cards[i])`. */
	insertAfter(card: CardInput): void;
	remove(): void;
	move(dir: -1 | 1): void;
}
