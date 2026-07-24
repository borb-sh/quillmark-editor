// The schema × payload join, done by the editor (VISUAL_EDITOR §Structure). Pure
// functions only — no runes, no Document reads — so the ordering, control
// dispatch, group layout, title interpolation, and session-identity bookkeeping
// are unit-testable in isolation (tests/visual/structure.test.ts). The reactive
// orchestration (revision counter, live doc reads) lives in VisualEditor.svelte;
// this module is the projection math it feeds.
import type { QuillCardSchema, QuillFieldSchema, ResolvedField, Resolved } from '../core/index.js';

/** The control a field type maps to (VISUAL_EDITOR §"A control per field type"). */
export type ControlKind =
	| 'prose' // richtext / plaintext → a codec prose leaf
	| 'text' // string
	| 'enum' // string+enum | type:'enum' → select
	| 'number' // number / integer
	| 'boolean' // boolean → toggle
	| 'date' // date / datetime → native date control
	| 'array' // add/remove repeater
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
	/** Schema `description` — authoring help rendered beside the label (issue #75b),
	 * undefined when the field declares none. Chrome-only; never gates. */
	description: string | undefined;
	/**
	 * Required-ness (issue #75a): a field with NO `default:` is "Unendorsed" — its
	 * seed carries a `!must_fill` marker (DOCUMENT_MODEL: there is no separate
	 * `required` axis). Drives a persistent label `*`, complementary to the ghosted
	 * `default:` (a required field has no default to ghost). Persistent (schema-
	 * derived, survives filling); the on-commit `must_fill` `validate()` warning
	 * remains the unmet-ness signal. Label chrome only — never gates.
	 */
	required: boolean;
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
	/**
	 * The card's `kind` has no projectable schema (issue #72) — a foreign kind under
	 * a schema that declares others, or a card under a schema with no `card_kinds` at
	 * all. Such a card renders a RECOVERY SHELL (humanized title + retype + delete)
	 * instead of a field list, so its content is never dropped or trapped: retyping
	 * to a declared kind re-projects it, delete removes it. Always `false` for `main`.
	 */
	unschemable: boolean;
	/** Raw `$ext.editor.title` override (composable cards). */
	titleOverride: string;
	/**
	 * The narrowed `$ext.editor.tips` channel (issue #71) — authoring hints a quill
	 * or consumer seeds, which the editor renders as a dismissable card and never
	 * writes to. Populated for EVERY card (main included) because the `$ext` snapshot
	 * the derive already holds makes the read free; V1 renders the channel on `main`
	 * only (VISUAL_EDITOR §"Card operations"). `[]` when the channel is absent or
	 * unusable — never gates, never reaches the backend.
	 */
	tips: string[];
	/** Schema-resolved title used as the rename placeholder (composable cards). */
	titlePlaceholder: string;
	/** Field name → current stored value (absent fields missing). */
	values: Record<string, unknown>;
	/**
	 * Field name → its resolved provenance row (`{ value, source }`), parallel to
	 * `values` (FIELD_PROVENANCE → #64). The channel that feeds chrome — the ghosted
	 * `default:` and any authored/default/zero affordance — NEVER the control
	 * value. Empty when `quill.resolve` is unavailable.
	 */
	provenance: Record<string, ResolvedField>;
	sections: GroupSection[];
	hasBody: boolean;
	/**
	 * The empty-body ghost — the resolved body `default:` as placeholder text
	 * (issue #58 §9), or undefined when the body is authored / has no default.
	 * The body prose leaf ghosts it exactly as scalars ghost their `default:`.
	 */
	bodyGhost?: string;
}

/**
 * A card's resolved rows keyed by field name — the provenance channel parallel to
 * {@link CardModel.values}. `resolve` returns rows in declaration order; the
 * editor keys them the same way `values` keys its payload walk, so a field's value
 * and its provenance resolve under one name.
 */
export function provenanceMap(fields: ResolvedField[]): Record<string, ResolvedField> {
	return Object.fromEntries(fields.map((f) => [f.name, f]));
}

/**
 * Composable cards' resolved rows keyed by document index (`ResolvedCard.index`,
 * not array position, so it holds whatever order the resolve view returns) — built
 * once per derive, so the per-card provenance join is O(1). Empty map when
 * `resolved` is absent (a `resolve` failure degrades to no ghosts, never a blank
 * form).
 */
export function provenanceByCardIndex(
	resolved: Resolved | undefined
): Map<number, ResolvedField[]> {
	return new Map((resolved?.cards ?? []).map((c) => [c.index, c.fields]));
}

/**
 * Composable cards' resolved BODY rows keyed by document index — the `body`
 * sibling `resolve` hangs off each card (issue #58 §9), parallel to
 * {@link provenanceByCardIndex}'s `fields`. Empty map (→ no body ghost) when
 * `resolved` is absent.
 */
export function bodyByCardIndex(resolved: Resolved | undefined): Map<number, ResolvedField | null> {
	return new Map((resolved?.cards ?? []).map((c) => [c.index, c.body]));
}

/** The ghost a field shows when unset: the resolved `default:` value the render
 * would use (`source === 'default'`), else undefined — an `authored` field shows
 * its value, a `zero` field has no default to ghost. */
export function ghostDefault(row: ResolvedField | undefined): unknown {
	return row?.source === 'default' ? row.value : undefined;
}

/** A ghost value's string form, or undefined for null/object (only text ghosts render a placeholder). */
export function stringifyGhost(ghost: unknown): string | undefined {
	return ghost != null && typeof ghost !== 'object' ? String(ghost) : undefined;
}

/** The empty-body ghost: the resolved body `default:` as placeholder text (issue
 * #58 §9), or undefined when the body is authored / has no default. The body row
 * is `resolve`'s `body` sibling (a `ResolvedField`, never a `fields` row); a
 * richtext body resolves to a text render — the correct thing to display as a
 * placeholder (FIELD_PROVENANCE → #64). Field's `defaultStr` derives from the
 * same {@link stringifyGhost}. */
export function bodyGhostText(body: ResolvedField | null | undefined): string | undefined {
	return stringifyGhost(ghostDefault(body ?? undefined));
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
		case 'date':
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
		description: schema.description,
		required: schema.default === undefined,
		inline: !!schema.inline,
		plaintext: schema.type === 'plaintext'
	}));
}

/**
 * Group-section order (VISUAL_EDITOR §Layout): the schema's `ui.groups` registry
 * KEY ORDER when present — `QuillCardUi.groups` is a typed `Record` as of
 * `@quillmark/wasm` 0.96.0 (the retired typing seam), so this reads it directly —
 * else the first-appearance order of each field's `ui.group`.
 */
export function groupOrder(cardSchema: QuillCardSchema): string[] {
	const groups = cardSchema.ui?.groups;
	if (groups) return Object.keys(groups);
	const order: string[] = [];
	for (const f of Object.values(cardSchema.fields)) {
		const g = f.ui?.group;
		if (g && !order.includes(g)) order.push(g);
	}
	return order;
}

/**
 * A group's display label: the `ui.groups[g].title` override when the registry
 * declares one, else the humanized id (`memo_for` → "Memo for") — the same
 * id-derives-the-label rule a field's key follows.
 */
export function groupLabel(cardSchema: QuillCardSchema, group: string): string {
	return cardSchema.ui?.groups?.[group]?.title ?? humanize(group);
}

/**
 * Sort field models into ordered group sections. Declared groups first (in
 * `order`), each carrying its fields in declaration order; then any remaining
 * groups (including the ungrouped bucket) in first-appearance order. `labelFor`
 * resolves a group id to its display label (the `ui.groups` title override, via
 * {@link groupLabel}); it defaults to {@link humanize} for the label-free caller.
 */
export function groupSections(
	fields: FieldModel[],
	order: string[],
	labelFor: (group: string) => string = humanize
): GroupSection[] {
	const sections: GroupSection[] = [];
	const emitted = new Set<string | undefined>();
	for (const g of order) {
		const fs = fields.filter((f) => f.group === g);
		if (fs.length) {
			sections.push({ group: g, label: labelFor(g), fields: fs });
			emitted.add(g);
		}
	}
	for (const f of fields) {
		if (emitted.has(f.group)) continue;
		sections.push({
			group: f.group,
			label: f.group ? labelFor(f.group) : '',
			fields: fields.filter((x) => x.group === f.group)
		});
		emitted.add(f.group);
	}
	return sections;
}

/**
 * The group section a card's accordion opens on first mount (issue #60), or
 * `null` for all-collapsed. Ungrouped fields render outside the accordion, so
 * only `group != null` sections count. The rule keeps exactly one section's
 * worth of fields visible when the card would otherwise read empty:
 *   • one group → open it (the sole-group auto-expand, even with a body);
 *   • many groups + a body leaf → all collapsed (the body carries the card);
 *   • many groups + no body → open the first (nothing else fills the card).
 * State is ephemeral session state the Card owns; this only seeds it.
 */
export function initialExpandedGroup(sections: GroupSection[], hasBody: boolean): string | null {
	const grouped = sections.filter((s) => s.group != null);
	if (grouped.length === 0) return null;
	if (grouped.length === 1) return grouped[0].group ?? null;
	return hasBody ? null : (grouped[0].group ?? null);
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
// Cards are POSITIONAL in the content and `doc.cards` re-allocates on each read,
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
