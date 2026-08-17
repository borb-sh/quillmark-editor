// A field's DOM ids. The DOM needs three names per field (the control a `<label
// for>` points at, the label an `aria-labelledby` control points back to, and the
// parked description an `aria-describedby` reads) and they are derived from the
// leaf key so the DOM shares the one per-field identity space the registry and
// diagnostics already collapse to (`fieldKeyToString`), rather than minting a
// second.
//
// `uid` is the editor instance's own (`$props.id()`, stable across SSR and
// hydration). The leaf-key space is unique per editor, not per document: two
// `VisualEditor`s on a page both hold `main:subject`, and a duplicate `id` makes
// `for` resolve to whichever mounted first.

/**
 * `id` syntax admits far less than a leaf key spends (`main:subject`, `$body`).
 * The escape is injective (`-` introduces it, so `-` escapes itself), which a
 * plain replace-with-dash is not: `a:b` and `a-b` would collapse onto one id.
 */
function escapeId(key: string): string {
	return key.replace(/[^A-Za-z0-9_]/g, (c) => `-${c.codePointAt(0)!.toString(16)}-`);
}

/** The three names one field spends in the DOM. */
export interface FieldDomIds {
	/** The control's own id: a `<label for>` target where the control is labelable. */
	control: string;
	/** The label's own id: the `aria-labelledby` target where `for` cannot reach. */
	label: string;
	/** Where the `description` text is parked for `aria-describedby`. */
	description: string;
}

export function fieldDomIds(uid: string, leafKey: string): FieldDomIds {
	const base = `qm-${uid}-${escapeId(leafKey)}`;
	return { control: base, label: `${base}-label`, description: `${base}-desc` };
}

/**
 * A subform property's three names, derived from the field's own control id. A
 * property is not a field — it has no leaf key, `Addr` reaching a root and one field
 * and no deeper — so it borrows its parent's id space rather than minting a second:
 * the same escape, one `-p-` segment down. That is what lets a property's label be a
 * real `<label for>` like every other label on the surface, instead of a `<span>`
 * folding its text into the control's composed name.
 *
 * The `-p-` infix cannot collide with a sibling field's id: an id is the escaped
 * `card:field` and `-` only ever introduces an escape, so `-p-` decodes as nothing a
 * key can spell.
 */
export function propertyDomIds(controlId: string, key: string): FieldDomIds {
	const base = `${controlId}-p-${escapeId(key)}`;
	return { control: base, label: `${base}-label`, description: `${base}-desc` };
}

/**
 * A group panel's own id: what its header's `aria-controls` names, and the only
 * name in the DOM that is a card's rather than a field's. `card` follows the leaf
 * key's convention (`undefined` is the main card), so a panel and the fields
 * inside it carry the same card token.
 *
 * The `-g-` infix cannot land on a field id: a field's is the escaped
 * `card:field`, whose separator escapes to `-3a-`, and the two differ at exactly
 * that position for every card token the id space mints.
 */
export function groupPanelId(uid: string, card: string | undefined, group: string): string {
	return `qm-${uid}-${escapeId(card ?? 'main')}-g-${escapeId(group)}`;
}
