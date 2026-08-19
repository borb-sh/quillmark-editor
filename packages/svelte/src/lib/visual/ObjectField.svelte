<!--
 An `object` field → a nested subform over `properties` (declaration order),
 committing the whole object by value on any nested change. Scalar properties
 only: a nested prose/array/object property renders a placeholder instead of
 recursing.

 The nesting is a vertical at `--_qm-border`, the ladder's third stroke: the card's edge,
 the section's vertical one `--_qm-nest` in, this one a rung further, the properties a
 rung inside it (ARCHITECTURE §"A plane is a tone").

 One figure wherever it mounts: a variant's cells under their discriminant and an array
 element's properties under its summary row sit at the depth a field-level subform sits
 at, and the box above them states position rather than depth.

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
		onCommit: (obj: Record<string, unknown>) => void;
	}
	let { value, properties, labelledBy, describedBy, idBase, label, onCommit }: Props = $props();

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
	/* The vertical and the rung between it and the properties, `--_qm-nest` being the step
	   the card and the section hold too.

	   `--_qm-border` and not `--_qm-border-faint`: this is the stroke that structures
	   (ARCHITECTURE §"A plane is a tone"), the one the card's edge and the section's
	   vertical read. `faint` separates without structuring — a table's interior lines
	   under a frame that is doing the structuring — which is the other job.

	   `padding-block` is the stroke's end caps, the same rung and the same reason as a
	   section's (`Card.svelte`). A cap and not a leading gap: what stands the subform off
	   the label or the box above it is still that stacker's own.

	   The tracks are the section's count over the subform's own width — `--cols` inherits,
	   so the container query stepping the section's capacity steps this with it, and there
	   is no second query container and nothing measured. The edges are not the section's:
	   the inset is the nesting, and a cell lining up with the field above it would claim a
	   depth it is not at. */
	.qm-object {
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		gap: var(--_qm-space-2);
		border-inline-start: var(--_qm-border-width) solid var(--_qm-border);
		padding-inline-start: var(--_qm-nest);
		padding-block: var(--_qm-space);
	}
	/* A property measures like a field: two tracks over the subform's own rows, so a
	   label wrapping in one column leaves its control on the row's baseline rather than a
	   line below it — `Field.svelte`'s rule for a row-sharing field, one level in. The
	   tracks are this grid's own; the section's belong to the fields.

	   `min-width: 0` because a property overflowing its `1fr` grows the track, and the
	   subform with it, past the field that holds it. */
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
