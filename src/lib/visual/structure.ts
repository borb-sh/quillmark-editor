// The schema × payload join, done by the editor (VISUAL_EDITOR §Structure). Pure
// functions only — no runes, no Document reads — so the ordering, control
// dispatch, group layout, title interpolation, and session-identity bookkeeping
// are unit-testable in isolation (tests/visual/structure.test.ts). The reactive
// orchestration (revision counter, live doc reads) lives in VisualEditor.svelte;
// this module is the projection math it feeds.
import type { QuillCardSchema, QuillFieldSchema } from '../core/index.js';

/** The control a field type maps to (VISUAL_EDITOR §"A control per field type"). */
export type ControlKind =
	| 'prose' // richtext / plaintext → a codec prose leaf
	| 'text' // string
	| 'enum' // string+enum | type:'enum' → select
	| 'number' // number / integer
	| 'boolean' // boolean → toggle
	| 'date' // datetime
	| 'array' // reorderable repeater
	| 'object'; // nested subform

/** One field, projected: its schema, the control it renders as, and its layout hints. */
export interface FieldModel {
	name: string;
	schema: QuillFieldSchema;
	control: ControlKind;
	/** `ui.group` (undefined = ungrouped). */
	group: string | undefined;
	/** `ui.compact` — packs onto a shared row with adjacent compacts. */
	compact: boolean;
	/** Display label — `ui.title` when set, else the humanized field name. */
	label: string;
	/** Prose-leaf flags (only meaningful when `control === 'prose'` / array items). */
	inline: boolean;
	plaintext: boolean;
}

/** A `ui.group` section: its label and the fields (declaration order) inside it. */
export interface GroupSection {
	group: string | undefined;
	label: string;
	fields: FieldModel[];
}

/**
 * One card instance projected for rendering — the schema × payload join result
 * the VisualEditor's `$derived` produces and hands to `<Card>`. Positional
 * identity is carried by `id` (a session key), NOT by array index.
 */
export interface CardModel {
	/** Stable session id (`'main'` for the main card). */
	id: string;
	isMain: boolean;
	kind: string;
	/** Raw `$ext.editor.title` override (composable cards). */
	titleOverride: string;
	/** Schema-resolved title used as the rename placeholder (composable cards). */
	titlePlaceholder: string;
	/** Field name → current stored value (absent fields simply missing). */
	values: Record<string, unknown>;
	sections: GroupSection[];
	hasBody: boolean;
}

/** The control an array's ELEMENTS render as, from `items.type`. */
export function elementControl(items: QuillFieldSchema | undefined): ControlKind {
	if (!items) return 'text';
	return controlKind(items);
}

/** Map a field schema to its control (precedence: prose › enum › text › …). */
export function controlKind(f: QuillFieldSchema): ControlKind {
	switch (f.type) {
		case 'richtext':
		case 'plaintext':
			return 'prose';
		case 'enum':
			return 'enum';
		case 'string':
			// The deprecated `enum` modifier or a `values` domain promotes a string
			// to a select; a bare string is a text input.
			return enumValues(f) ? 'enum' : 'text';
		case 'number':
		case 'integer':
			return 'number';
		case 'boolean':
			return 'boolean';
		case 'datetime':
			return 'date';
		case 'array':
			return 'array';
		case 'object':
			return 'object';
		default:
			return 'text';
	}
}

/** The closed value domain of an enum/enum-string field, or undefined. */
export function enumValues(f: QuillFieldSchema): string[] | undefined {
	return f.enum ?? f.values;
}

/** `foo_bar` → `Foo bar` — the label fallback when a field declares no `ui.title`. */
export function humanize(name: string): string {
	const spaced = name.replace(/_/g, ' ').trim();
	return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : spaced;
}

/** Project a card schema's `fields` map (declaration = key order) into models. */
export function fieldModels(cardSchema: QuillCardSchema): FieldModel[] {
	return Object.entries(cardSchema.fields).map(([name, schema]) => ({
		name,
		schema,
		control: controlKind(schema),
		group: schema.ui?.group,
		compact: !!schema.ui?.compact,
		label: schema.ui?.title ?? humanize(name),
		inline: !!schema.inline,
		plaintext: schema.type === 'plaintext'
	}));
}

/**
 * Group-section order (VISUAL_EDITOR §Layout, and the recorded typing seam): the
 * schema's `ui.groups` object KEY ORDER when present — read via a cast, since the
 * typed `QuillCardUi` omits `groups` — else the first-appearance order of each
 * field's `ui.group`.
 */
export function groupOrder(cardSchema: QuillCardSchema): string[] {
	const groups = (cardSchema.ui as { groups?: Record<string, unknown> } | undefined)?.groups;
	if (groups && typeof groups === 'object') return Object.keys(groups);
	const order: string[] = [];
	for (const f of Object.values(cardSchema.fields)) {
		const g = f.ui?.group;
		if (g && !order.includes(g)) order.push(g);
	}
	return order;
}

/**
 * Sort field models into ordered group sections. Declared groups first (in
 * `order`), each carrying its fields in declaration order; then any remaining
 * groups (including the ungrouped bucket) in first-appearance order.
 */
export function groupSections(fields: FieldModel[], order: string[]): GroupSection[] {
	const sections: GroupSection[] = [];
	const emitted = new Set<string | undefined>();
	for (const g of order) {
		const fs = fields.filter((f) => f.group === g);
		if (fs.length) {
			sections.push({ group: g, label: humanize(g), fields: fs });
			emitted.add(g);
		}
	}
	for (const f of fields) {
		if (emitted.has(f.group)) continue;
		sections.push({
			group: f.group,
			label: f.group ? humanize(f.group) : '',
			fields: fields.filter((x) => x.group === f.group)
		});
		emitted.add(f.group);
	}
	return sections;
}

/**
 * Pack a section's fields into rows: a run of consecutive `compact` fields shares
 * one row; a non-compact field is its own row. `ui.compact` is the density hint
 * carried from web-app.
 */
export function packRows(fields: FieldModel[]): FieldModel[][] {
	const rows: FieldModel[][] = [];
	let run: FieldModel[] = [];
	const flush = () => {
		if (run.length) rows.push(run);
		run = [];
	};
	for (const f of fields) {
		if (f.compact) {
			run.push(f);
		} else {
			flush();
			rows.push([f]);
		}
	}
	flush();
	return rows;
}

/** Interpolate a `{field}` card-title template against live field values. */
export function interpolateTitle(template: string, values: Record<string, unknown>): string {
	return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_m, name: string) => {
		const v = values[name];
		return v == null ? '' : String(v);
	});
}

/**
 * Resolve a card instance's header title: the per-instance `$ext.editor.title`
 * override wins; else the schema `ui.title` (literal or `{field}` template
 * interpolated); else the humanized kind. Empty overrides fall through so a
 * cleared rename reverts to the schema title.
 */
export function cardTitle(
	cardSchema: QuillCardSchema | undefined,
	kind: string,
	values: Record<string, unknown>,
	extTitle: string | undefined
): string {
	if (extTitle && extTitle.trim()) return extTitle;
	const t = cardSchema?.ui?.title;
	if (t && t.trim()) return interpolateTitle(t, values);
	return humanize(kind);
}

/** Whether a card kind renders a body leaf — gated by `body.enabled !== false`. */
export function bodyEnabled(cardSchema: QuillCardSchema | undefined): boolean {
	return cardSchema?.body?.enabled !== false;
}

// ── Session identity (VISUAL_EDITOR §"The address is the spine") ─────────────
// Cards are POSITIONAL in the corpus and `doc.cards` re-allocates on each read,
// so a stable card-instance key cannot be the card object (a fresh object every
// derive) — it is a session id held in a parallel array, reordered in lockstep
// with the structure ops and resolved to an index only at the mutation boundary.

/** A monotonic per-session id source. Ids are opaque strings, stable for the session. */
export class IdSeq {
	#n = 0;
	next(): string {
		return `c${this.#n++}`;
	}
}

/** A fresh id array for `count` existing instances. */
export function initIds(count: number, seq: IdSeq): string[] {
	return Array.from({ length: count }, () => seq.next());
}

/** Resolve a stable id to its current index, or -1 if gone. */
export function idIndex(ids: readonly string[], id: string): number {
	return ids.indexOf(id);
}
