// A field's DOM ids. The DOM needs three names per field — the control a `<label
// for>` points at, the label an `aria-labelledby` control points back to, and the
// parked description an `aria-describedby` reads — and they are derived from the
// leaf key so the DOM shares the ONE per-field identity space the registry and
// diagnostics already collapse to (`fieldKeyToString`), rather than minting a
// second.
//
// `uid` is the editor instance's own (`$props.id()`, stable across SSR and
// hydration). The leaf-key space is unique per EDITOR, not per document: two
// `VisualEditor`s on a page both hold `main:subject`, and a duplicate `id` makes
// `for` resolve to whichever mounted first.

/**
 * `id` syntax admits far less than a leaf key spends (`main:subject`, `$body`).
 * The escape is INJECTIVE — `-` introduces it, so `-` escapes itself — which a
 * plain replace-with-dash is not: `a:b` and `a-b` would collapse onto one id.
 */
function escapeId(key: string): string {
	return key.replace(/[^A-Za-z0-9_]/g, (c) => `-${c.codePointAt(0)!.toString(16)}-`);
}

/** The three names one field spends in the DOM. */
export interface FieldDomIds {
	/** The control's own id — a `<label for>` target where the control is labelable. */
	control: string;
	/** The label's own id — the `aria-labelledby` target where `for` cannot reach. */
	label: string;
	/** Where the `description` text is parked for `aria-describedby`. */
	description: string;
}

export function fieldDomIds(uid: string, leafKey: string): FieldDomIds {
	const base = `qm-${uid}-${escapeId(leafKey)}`;
	return { control: base, label: `${base}-label`, description: `${base}-desc` };
}
