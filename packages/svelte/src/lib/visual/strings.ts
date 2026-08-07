// Every word the visual surface says, in one place, so a product shipping in
// another language can replace them. Keyed and PARTIAL: a consumer sets the keys
// it has translations for and the rest take the package's English, which is what
// makes wording an override rather than a fork.
//
// Several of these are ACCESSIBLE NAMES rather than decoration — the card
// controls, the add trigger, the required marker — so an untranslated surface is
// not merely inconsistent, it reads the wrong language to a screen reader. That is
// why this exists as a seam and not as a list of literals to grep for.
//
// A key is a plain string where the text is fixed and a function where it is not:
// a parametric string cannot be assembled from fragments and stay translatable,
// since the word order is the translator's to choose.
//
// The strings reach the tree through CONTEXT, not props. They are ambient,
// read-only, and wanted eight components deep (a card's controls, a field's
// required marker, the formatting popover, the tips card); threading them by hand
// would put a `strings` prop on every component between the root and each leaf,
// which is a prop that means nothing to any of them.
import { getContext, setContext } from 'svelte';
import type { Diagnostic } from '@quillmark/wasm';
import {
	DEFAULT_SLASH_STRINGS,
	DEFAULT_TABLE_STRINGS,
	type SlashStrings,
	type TableChromeStrings
} from '../core/codec/index.js';
import type { BodyPlaceholder } from './structure.js';

/**
 * The island and the insert menu's keys come from the CODEC, which owns both models
 * (a NodeView inside the leaf, and the trigger the leaf's keymap drives). Extending
 * rather than restating them is what keeps one English list: a consumer overrides an
 * island handle's name beside the card controls' and the codec still has a default
 * for a leaf mounted directly.
 */
export interface VisualStrings extends TableChromeStrings, SlashStrings {
	// ── Card controls (accessible names: the buttons are glyphs) ───────────────
	cardMoveUp: string;
	cardMoveDown: string;
	cardDelete: string;
	/** The card-title input's accessible name. */
	cardTitle: string;

	// ── The add affordance ────────────────────────────────────────────────────
	/** The multi-kind trigger, which names no kind because it opens a menu of them. */
	addCard: string;
	/** The single-kind trigger, whose accessible name IS the kind it seeds. */
	addCardOfKind: (kind: string) => string;
	/** The trailing strip's VISIBLE words, which are also its accessible name; the
	 * glyph rides the wording, as the array foot's does. A pair of their own rather
	 * than a prefix over the two above, because a language reading the mark as one
	 * phrase has nothing to prefix. */
	addCardMark: (kind: string) => string;
	addCardMarkAny: string;

	// ── Array control ─────────────────────────────────────────────────────────
	arrayAdd: string;
	arrayRemove: string;

	// ── Field chrome ──────────────────────────────────────────────────────────
	/** The required marker's accessible name; the glyph itself is a `*`. */
	fieldRequired: string;

	// ── Formatting popover ────────────────────────────────────────────────────
	formatGroup: string;
	formatBold: string;
	formatEmphasis: string;
	formatUnderline: string;
	formatStrikethrough: string;
	formatCode: string;
	formatLink: string;
	/** The anchor button's accessible name. */
	formatAnchor: string;
	/** Its hover title, which says what an anchor IS; the name above only says what. */
	formatAnchorTitle: string;
	linkPlaceholder: string;
	linkApply: string;
	linkCancel: string;

	// ── Tips card ─────────────────────────────────────────────────────────────
	tipsLabel: string;
	tipsDismiss: string;
	tipsNext: string;
	tipsDot: (index: number, count: number) => string;

	// ── The unknown-kind recovery shell ───────────────────────────────────────
	/** The whole sentence, since a translator orders the kind within it. */
	unknownKind: (kind: string) => string;
	retypeLabel: string;
	retypePlaceholder: string;
	noCardKinds: string;

	// ── The empty body's ghost ────────────────────────────────────────────────
	/**
	 * The flat built-in invitation: the package's own words, kept to the one thing
	 * true of every body so it claims nothing about the card it sits in.
	 */
	bodyGhost: string;
	/**
	 * Per-KIND wording, in place of {@link VisualStrings.bodyGhost}; `undefined`
	 * takes it. Consulted once per kind per session and cached by the editor, so a
	 * hook that samples a set at random still reads as one deliberate string.
	 * Impurity is expected, and the cache is what contains it.
	 */
	bodyPlaceholder: BodyPlaceholder;
}

/**
 * The hook that turns a boundary `Diagnostic` into displayed text.
 *
 * A formatter reads the whole `Diagnostic`, including `args`: the facts `message`
 * interpolates, keyed by name. What it can re-word tracks what that type carries per
 * lane (VISUAL_EDITOR §Diagnostics for why each lands where it does):
 *
 * - **`validation::enum_violation`, `type_mismatch`, `format_violation`,
 *   `must_fill`**: the CONSTRAINT re-words from the quill's schema at `path`, the
 *   offending VALUE from `args` (`value` / `sourceToken` / `actual`, the engine
 *   testifying to what it saw) and never from the document at `path`: validation
 *   runs post-coercion, so the validator read a value the document does not hold and
 *   a sentence built from `path` names a spelling the user never typed.
 * - **`edit::field_coercion_failed`**: re-words from the app's own control state, the
 *   refused value being in neither document (unchanged on throw) nor schema.
 * - **`parse::yaml_error_with_location`, `invalid_structure`**: does not re-word. No
 *   `path`, and `args` carries the LOCATION (`blockIndex`, `line`) and nothing else,
 *   engine prose riding under no key: the parser's own text, its column and its caret
 *   snippet exist only inside `message`.
 * - **`LiveSession.warnings`**: does not re-word. Backend text, an external feed.
 *
 * The last two are the boundary's shape, not a gap in it, so the fallback arm is
 * permanent: returning `undefined` renders `d.message` unchanged. `code` is optional
 * at this pin, so that arm is reachable by TYPE and not only in principle.
 *
 * Displayed text is that message or this replacement and nothing beside it: `hint` is
 * the tail of the message it accompanies, so rendering it too ships a two-language
 * diagnostic.
 */
export type FormatDiagnostic = (d: Diagnostic) => string | undefined;

/** The package's English. Every key, so the merge below is total. */
export const DEFAULT_VISUAL_STRINGS: VisualStrings = {
	...DEFAULT_TABLE_STRINGS,
	...DEFAULT_SLASH_STRINGS,
	cardMoveUp: 'Move up',
	cardMoveDown: 'Move down',
	cardDelete: 'Delete card',
	cardTitle: 'Card title',
	addCard: 'Add card',
	addCardOfKind: (kind) => `Add ${kind}`,
	addCardMark: (kind) => `+ Add ${kind}`,
	addCardMarkAny: '+ Add Card',
	arrayAdd: '+ Add',
	arrayRemove: 'Remove',
	fieldRequired: 'required',
	formatGroup: 'Formatting',
	formatBold: 'Bold (Mod-B)',
	formatEmphasis: 'Emphasis (Mod-I)',
	formatUnderline: 'Underline (Mod-U)',
	formatStrikethrough: 'Strikethrough',
	formatCode: 'Code',
	formatLink: 'Link',
	formatAnchor: 'Anchor',
	formatAnchorTitle: 'Anchor — an identity handle over the selection',
	linkPlaceholder: 'https://…',
	linkApply: 'Apply',
	linkCancel: 'Cancel',
	tipsLabel: 'Editor tips',
	tipsDismiss: 'Dismiss',
	tipsNext: 'Next',
	tipsDot: (index, count) => `Tip ${index} of ${count}`,
	unknownKind: (kind) => `Unrecognized card type ${kind}. Its content is preserved.`,
	retypeLabel: 'Change to',
	retypePlaceholder: 'Choose a type…',
	noCardKinds: 'This document declares no card types — delete this card to remove it.',
	bodyGhost: 'Write…',
	bodyPlaceholder: () => undefined
};

/** A consumer's wording: any subset, the rest the package's. */
export type VisualStringsInput = Partial<VisualStrings>;

/** Fill a partial override to the whole key set. */
export function mergeStrings(custom: VisualStringsInput | undefined): VisualStrings {
	return custom ? { ...DEFAULT_VISUAL_STRINGS, ...custom } : DEFAULT_VISUAL_STRINGS;
}

const KEY = Symbol('qm.wording');

/**
 * Everything the surface says, as the tree reads it. Getters rather than values,
 * so a consumer swapping locale mid-session re-renders rather than freezing the
 * wording at mount. The two seams travel together because a product needs both or
 * neither: wording it cannot apply to the diagnostics beside it is half a
 * translation.
 */
export interface Wording {
	readonly strings: VisualStrings;
	readonly formatDiagnostic: FormatDiagnostic | undefined;
}

export function setWording(channel: Wording): void {
	setContext(KEY, channel);
}

/**
 * The wording for a component under a mounted editor. Falls to the package's
 * English off-tree, so a component rendered outside the editor (a test, a consumer
 * composing one directly) still has every key.
 */
export function wording(): Wording {
	return (
		getContext<Wording>(KEY) ?? { strings: DEFAULT_VISUAL_STRINGS, formatDiagnostic: undefined }
	);
}

/** A diagnostic's displayed text: the consumer's formatter, or its message. The
 *  fallback arm is permanent, not a courtesy ({@link FormatDiagnostic}). */
export function diagnosticText(d: Diagnostic, format: FormatDiagnostic | undefined): string {
	return (format ? format(d) : undefined) ?? d.message;
}
