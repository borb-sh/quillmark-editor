// Every word the editor says, in one place, and the seam a consumer replaces them
// through. The package ships English; a product that ships in two languages needs
// all of them, and several are accessible NAMES rather than decoration — a control
// whose only label is a glyph is named here or is unnamed for a screen reader in
// the reader's language.
//
// ONE contract, not one hook per string: `bodyPlaceholder` was the first of these
// and arrived as its own prop, which does not scale to sixteen. It is folded in
// here as the entry that takes a function, and keeps its own caching rule (the
// editor consults it once per kind, `VisualEditor`).
//
// Entries that take a parameter are functions; the rest are strings. That is the
// whole shape: a consumer overrides the keys it cares about and inherits the rest,
// and an i18n library reaches this as `strings={{ addCard: t('qm.addCard'), … }}`.
import { DEFAULT_BODY_PLACEHOLDER, type BodyPlaceholder } from './structure.js';

/** What the editor says. Every key optional at the boundary ({@link EditorStrings}
 *  is the resolved set; a consumer passes a `Partial`). */
export interface EditorStrings {
	// ── Card operations ───────────────────────────────────────────────────────
	cardMoveUp: string;
	cardMoveDown: string;
	cardDelete: string;
	/** The inline title input's accessible name. */
	cardTitle: string;
	/** The body leaf's accessible name; nothing else names it (the body draws no
	 *  visible label, deliberately). */
	cardBody: string;
	/** The add trigger, where the quill declares more than one kind. */
	addCard: string;
	/** The add trigger for a single-kind quill, and each item of the kind menu.
	 *  `kind` is the schema's own key; `humanized` is the package's rendering of it,
	 *  which a consumer that has nothing better to say can pass through. */
	addCardOfKind: (kind: string, humanized: string) => string;

	// ── The un-schemable card's recovery shell ────────────────────────────────
	recoveryRetype: string;
	recoveryChoose: string;
	recoveryNoKinds: string;

	// ── Array fields ──────────────────────────────────────────────────────────
	/** One element's accessible name: the field's label and its 1-based index. */
	arrayItem: (label: string, index: number) => string;
	arrayItemRemove: string;

	// ── Field chrome ──────────────────────────────────────────────────────────
	/** The hint trigger beside a field that carries a `description`. */
	fieldGuidance: (label: string) => string;

	// ── The formatting popover ────────────────────────────────────────────────
	formatGroup: string;
	markStrong: string;
	markEm: string;
	markUnderline: string;
	markStrike: string;
	markCode: string;
	markLink: string;
	/** The identity anchor: its short name, then the longer `title` gloss. */
	anchor: string;
	anchorHint: string;
	linkUrlPlaceholder: string;
	linkApply: string;
	linkCancel: string;

	// ── The tips card ─────────────────────────────────────────────────────────
	tips: string;
	tipPosition: (index: number, total: number) => string;
	tipNext: string;
	tipDismiss: string;

	// ── The empty body's ghost ────────────────────────────────────────────────
	/**
	 * The invitation an EMPTY body shows, by card kind. Returning `undefined` takes
	 * {@link DEFAULT_STRINGS}'s own word. A body with a resolved `default:` ghosts
	 * that and never consults this: the default is the ghost that describes the
	 * render.
	 *
	 * Consulted once per kind per session and cached, so a hook that samples a set
	 * at random still reads as deliberate.
	 */
	bodyPlaceholder: BodyPlaceholder;
}

/** The package's own words. Exported so a consumer can compose against a default
 *  rather than restate it (`${DEFAULT_STRINGS.cardDelete}…`). */
export const DEFAULT_STRINGS: EditorStrings = {
	cardMoveUp: 'Move up',
	cardMoveDown: 'Move down',
	cardDelete: 'Delete card',
	cardTitle: 'Card title',
	cardBody: 'Body',
	addCard: 'Add card',
	addCardOfKind: (_kind, humanized) => `Add ${humanized}`,

	recoveryRetype: 'Change to',
	recoveryChoose: 'Choose a type…',
	recoveryNoKinds: 'This document declares no card types — delete this card to remove it.',

	arrayItem: (label, index) => `${label} ${index}`,
	arrayItemRemove: 'Remove',

	fieldGuidance: (label) => `${label} guidance`,

	formatGroup: 'Formatting',
	markStrong: 'Bold (Mod-B)',
	markEm: 'Emphasis (Mod-I)',
	markUnderline: 'Underline (Mod-U)',
	markStrike: 'Strikethrough',
	markCode: 'Code',
	markLink: 'Link',
	anchor: 'Anchor',
	anchorHint: 'Anchor — an identity handle over the selection',
	linkUrlPlaceholder: 'https://…',
	linkApply: 'Apply',
	linkCancel: 'Cancel',

	tips: 'Editor tips',
	tipPosition: (index, total) => `Tip ${index} of ${total}`,
	tipNext: 'Next',
	tipDismiss: 'Dismiss',

	bodyPlaceholder: () => DEFAULT_BODY_PLACEHOLDER
};

/** Resolve a consumer's overrides against the package's words. */
export function resolveStrings(overrides: Partial<EditorStrings> | undefined): EditorStrings {
	return overrides ? { ...DEFAULT_STRINGS, ...overrides } : DEFAULT_STRINGS;
}
