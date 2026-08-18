<!--
 An `object` field → a nested subform over `properties` (declaration order),
 committing the whole object by value on any nested change. Scalar properties
 only: a nested prose/array/object property renders a placeholder instead of
 recursing.

 The nesting is a band: two full-width horizontals at `--_qm-border`, the figure the
 card draws around its own metadata (`.qm-meta-top` / `.qm-meta-bottom`) one octave
 down. Nothing insets, so a property's control keeps the card's left and right columns
 exactly as a field's does, and the field's own label caps the band from outside it —
 name, rule under the name, content, closing rule.

 That absent inset is also what puts the properties on the section's own column tracks
 (below), so a subform's cells share edges with the fields above them rather than
 keeping a rhythm of their own.

 Which edges draw is {@link Props.edges}, and the rule is that a boundary is stated
 once: where a box already sits against the subform, that box IS the boundary and a
 stroke under it would say so twice. So a field-level subform takes the band, and a
 subform hanging off a control — a variant's cells under their discriminant, an
 array element's properties under its summary row — takes the closing rule alone.
 Sometimes two strokes and sometimes one: the open figure the card's bracket is.

 A property's ghosted `default:` is the static schema `sub.default`, not the
 resolved provenance the top-level ghosts read (FIELD_PROVENANCE): `resolve`
 carries no per-property row (an object field resolves as one row whose value is
 the whole object).
-->
<script lang="ts">
	import type { QuillFieldSchema } from '@quillmark/wasm';
	import { controlKind, humanize, obliged } from './structure.js';
	import { wording } from './strings.js';
	import { propertyDomIds } from './domid.js';
	import FieldLabel from './FieldLabel.svelte';
	import TextField from './TextField.svelte';
	import EnumField from './EnumField.svelte';
	import NumberField from './NumberField.svelte';
	import BooleanField from './BooleanField.svelte';
	import DateField from './DateField.svelte';

	interface Props {
		value: Record<string, unknown> | undefined;
		properties: Record<string, QuillFieldSchema> | undefined;
		/** The field label's own id. A subform is a group of controls, not one control
		 * `for` could reach, so the field's label names the set; each property carries
		 * its own `<label for>` inside it. */
		labelledBy?: string;
		/** The parked `description` (FieldLabel): announced on entering the group. */
		describedBy?: string;
		/**
		 * The parent control's DOM id: the base each property's own three names derive
		 * from ({@link propertyDomIds}). Absent — a subform mounted with no field around
		 * it — the properties fall back to `aria-label`, which names them without a
		 * `for` target to click.
		 */
		idBase?: string;
		/** Accessible-name prefix used only on the `aria-label` fallback above. */
		label?: string;
		/** Which strokes the subform draws; see the note above. */
		edges?: 'band' | 'close';
		onCommit: (obj: Record<string, unknown>) => void;
	}
	let {
		value,
		properties,
		labelledBy,
		describedBy,
		idBase,
		label,
		edges = 'band',
		onCommit
	}: Props = $props();

	const t = wording();
	const entries = $derived(Object.entries(properties ?? {}));
	const obj = $derived((value ?? {}) as Record<string, unknown>);

	/** Obligation, read off the cell exactly as `fieldModels` reads it off a field
	 *  ({@link obliged}). `validate` anchors it per leaf, so a property with no
	 *  `default:` is obliged in its own right and the container around it holds none
	 *  (VISUAL_EDITOR §"Enum variants"). */
	const required = obliged;

	const title = (key: string, sub: QuillFieldSchema): string => sub.ui?.title ?? humanize(key);
	/** The `aria-label` fallback, for a subform mounted without a field's id space:
	 *  the field's name and the property's, since nothing else names the control. */
	const fallbackName = (key: string, sub: QuillFieldSchema): string =>
		`${label != null ? `${label} ` : ''}${title(key, sub)}` +
		(required(sub) ? ` ${t.strings.fieldRequired}` : '');

	/** Take the caret: the first property's control, a subform having no single control
	 * of its own to land on. Resolved off the DOM rather than a ref per property: every
	 * property is a scalar control the DOM already knows how to focus (the date field's
	 * segments carry `tabindex`, the `literal` separators between them do not), so a
	 * handle each would be five refs restating document order. An empty or wholly
	 * unsupported subform lands nothing. */
	let rootEl = $state<HTMLElement | undefined>();
	const FOCUSABLE = 'input, select, button, [tabindex]:not([tabindex="-1"])';
	export function focus(): void {
		rootEl?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
	}
	/** A label click for the one property `for` cannot reach: the date control, whose
	 *  focus lives on a segment. Scoped to that property's own cell, so the click lands
	 *  where the label is rather than on the subform's first control. */
	function focusProp(key: string): void {
		// Matched on the dataset: a key is the schema's own string, and spelling one into
		// a selector needs `CSS.escape`, which the test DOM does not carry.
		for (const cell of rootEl?.querySelectorAll<HTMLElement>('[data-qm-prop]') ?? []) {
			if (cell.dataset.qmProp === key) return cell.querySelector<HTMLElement>(FOCUSABLE)?.focus();
		}
	}

	function commitProp(key: string, v: unknown): void {
		if (v === undefined) {
			// A nested control cleared (the unset rung): drop the key so the property
			// is absent in the committed object (resolving to its own `default:`)
			// rather than an `undefined` hole carried through `writer.set`.
			const rest = { ...obj };
			delete rest[key];
			onCommit(rest);
		} else {
			onCommit({ ...obj, [key]: v });
		}
	}
</script>

<div
	bind:this={rootEl}
	class="qm-object"
	class:close={edges === 'close'}
	role="group"
	aria-labelledby={labelledBy}
	aria-describedby={describedBy}
>
	{#each entries as [key, sub] (key)}
		{@const kind = controlKind(sub)}
		{@const ids = idBase ? propertyDomIds(idBase, key) : undefined}
		{@const named = ids ? undefined : fallbackName(key, sub)}
		{@const describes = sub.description && ids ? ids.description : undefined}
		<!-- `for` reaches the four labelable controls; the date field's focus lives on a
		     segment, so it takes the click handoff instead, exactly as `Field` does one
		     level up. -->
		{@const labelable =
			kind === 'text' || kind === 'enum' || kind === 'number' || kind === 'boolean'}
		<div class="qm-object-prop" data-qm-prop={key}>
			{#if ids}
				<FieldLabel
					label={title(key, sub)}
					controlId={labelable ? ids.control : undefined}
					id={ids.label}
					descriptionId={describes}
					onActivate={labelable ? undefined : () => focusProp(key)}
					required={required(sub)}
					description={sub.description}
				/>
			{/if}
			{#if kind === 'enum'}
				<EnumField
					label={named}
					id={ids?.control}
					describedBy={describes}
					value={obj[key] as string | undefined}
					values={sub.values ?? []}
					fallback={sub.default as string | undefined}
					onCommit={(v) => commitProp(key, v)}
				/>
			{:else if kind === 'number'}
				<NumberField
					label={named}
					id={ids?.control}
					describedBy={describes}
					value={obj[key] as number | undefined}
					integer={sub.type === 'integer'}
					fallback={sub.default as number | undefined}
					onCommit={(v) => commitProp(key, v)}
				/>
			{:else if kind === 'boolean'}
				<BooleanField
					label={named}
					id={ids?.control}
					describedBy={describes}
					value={obj[key] as boolean | undefined}
					fallback={sub.default as boolean | undefined}
					onCommit={(v) => commitProp(key, v)}
				/>
			{:else if kind === 'date'}
				<DateField
					label={named}
					labelledBy={ids?.label}
					describedBy={describes}
					value={obj[key] as string | undefined}
					onCommit={(v) => commitProp(key, v)}
				/>
			{:else if kind === 'text'}
				<TextField
					label={named}
					id={ids?.control}
					describedBy={describes}
					value={obj[key] as string | undefined}
					placeholder={sub.default != null ? String(sub.default) : undefined}
					onCommit={(v) => commitProp(key, v)}
				/>
			{:else}
				<!-- A property the subform does not recurse into. What it says is what the
				     user can do about it, which is edit the field from the source surface;
				     a version number is the roadmap talking to somebody filling in a form. -->
				<span class="qm-unsupported">{t.strings.nestedUnsupported(kind)}</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	/* The band. `border-block` draws both strokes as one declaration, which is what
	   makes the figure symmetric by construction rather than by two lines agreeing;
	   `padding-block` at the same rung on both sides is the other half of that.

	   `--_qm-border` and not `--_qm-border-faint`: this is the stroke that structures
	   (ARCHITECTURE §"A plane is a tone"), the one the metadata bracket and the open
	   section's vertical read. `faint` separates without structuring — a table's
	   interior lines under a frame that is doing the structuring — which is the other
	   job.

	   The columns are the section's, arrived at by arithmetic rather than by `subgrid`:
	   the band insets nothing horizontally, so this box spans exactly what `.qm-fields`
	   spans, and equal tracks at the same count over the same width with the same column
	   gap fall on the same edges. `subgrid` would want the tracks chained through the
	   three wrappers between the section grid and here (`Field.svelte`), none of which is
	   a grid. `--cols` inherits instead, so the container query stepping the section's
	   capacity steps the subform's with it — no second query container, no second set of
	   rungs, nothing measured. */
	.qm-object {
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		gap: var(--_qm-space-2);
		border-block: var(--_qm-border-width) solid var(--_qm-border);
		padding-block: var(--_qm-space-2);
	}
	/* Hanging off a control (a variant's discriminant, an array element's summary row):
	   that box is the top boundary already, and a stroke under it would state the
	   boundary twice. The closing rule is not optional in the same breath — without it
	   the properties float between the box above and whatever follows. */
	.qm-object.close {
		border-block-start: none;
		padding-block-start: 0;
	}
	/* A property measures like a field: two tracks over the subform's own rows, so a
	   label wrapping in one column leaves its control on the row's baseline rather than a
	   line below it — `Field.svelte`'s rule for a row-sharing field, one level in. The
	   tracks are this grid's own; the section's belong to the fields.

	   `min-width: 0` is what holds the arithmetic above: a property overflowing its `1fr`
	   grows the track, and the subform's edges leave the section's with it. */
	.qm-object-prop {
		display: grid;
		grid-row: span 2;
		grid-template-rows: subgrid;
		row-gap: var(--_qm-space-half);
		align-items: start;
		min-width: 0;
	}
	/* A subform of one takes half the capacity, the way a packable run of one does
	   (`.qm-field.lone`): at full capacity a single track reads as truncated. */
	.qm-object-prop:only-child {
		grid-column: span var(--cols-half);
	}
	.qm-unsupported {
		font-size: var(--_qm-text-body);
		color: var(--_qm-ink-label);
		font-style: italic;
	}
</style>
