<!--
 Type dispatch (VISUAL_EDITOR §"Structure mirrors the schema"). Given one projected
 {@link FieldModel} and its live value, render the label + the control the type
 maps to. Array controls own their label (paired with the add affordance in
 {@link ArrayField}); other types render the label here. Prose leaves take a
 parent-built LIVE `addr` (its `card` a getter over the stable-id→index map) so
 a reorder re-targets without a remount; scalars, arrays, and objects commit
 their value UP through `onCommitScalar`, which the parent lowers to the typed
 writer.

 `diagnostics` is the routed `Diagnostic[]` for this field (VisualEditor's
 `diagByKey`, merging `quill.validate`, local commit errors, and the external
 `diagnostics` prop (VISUAL_EDITOR §Diagnostics)) rendered via the shared
 `DiagnosticList`, severity-styled, NON-GATING.
-->
<script lang="ts">
	import type { Document, Quill, Addr, Diagnostic, ResolvedField } from '@quillmark/wasm';
	import type { EditorErrorHandler } from '../core/errors.js';
	import type { LeafRegistry } from './leaves.js';
	import type { FieldModel, FieldSpan } from './structure.js';
	import { enumValues, ghostDefault, stringifyGhost } from './structure.js';
	import type { FieldDomIds } from './domid.js';
	import ProseField from './ProseField.svelte';
	import TextField from './TextField.svelte';
	import EnumField from './EnumField.svelte';
	import NumberField from './NumberField.svelte';
	import BooleanField from './BooleanField.svelte';
	import DateField from './DateField.svelte';
	import ArrayField from './ArrayField.svelte';
	import ObjectField from './ObjectField.svelte';
	import DiagnosticList from './DiagnosticList.svelte';
	import FieldLabel from './FieldLabel.svelte';

	interface Props {
		field: FieldModel;
		/** This field's width in the section grid, from `placeFields`. */
		span: FieldSpan;
		value: unknown;
		/** This field's resolved provenance row (FIELD_PROVENANCE): the ghost's
		 * source. Feeds the placeholder / fallback only, never `value`. */
		provenance?: ResolvedField;
		doc: Document;
		/** The schema a prose leaf reads its content through (`ProseField`). */
		quill: Quill;
		/** This field's LIVE address (getter-`card`, so a card reorder re-targets in
		 *  place): the prose leaf commits to it, and a focus reports it. */
		addr: Addr;
		leafKey: string;
		/** This field's three DOM names, derived from `leafKey` (see `domid.ts`): how
		 * the label and the control find each other. */
		domIds: FieldDomIds;
		onCommitScalar: (value: unknown) => void;
		/** Enum-option policy: `false` marks that option unavailable. Only the enum
		 * control reads this pair. */
		optionAllowed?: (value: string) => boolean;
		/** How a refused option draws: greyed (default) or left out. */
		enumDisallowed?: 'hide' | 'disable';
		onFocus?: (addr: Addr) => void;
		onCaretMove?: (addr: Addr, pos: number) => void;
		onChange?: (addr: Addr) => void;
		onError?: EditorErrorHandler;
		/** The editor's leaf registry (`leaves.ts`): a form control registers its
		 *  landing handle here, a prose leaf its controller from inside `ProseField`. */
		leaves?: LeafRegistry;
		diagnostics?: Diagnostic[];
	}
	let {
		field,
		span,
		value,
		provenance,
		doc,
		quill,
		addr,
		leafKey,
		domIds,
		onCommitScalar,
		optionAllowed,
		enumDisallowed,
		onFocus,
		onCaretMove,
		onChange,
		onError,
		leaves,
		diagnostics
	}: Props = $props();

	// The ghost the control shows when unset: the resolved `default:` (provenance,
	// `source === 'default'`). `ghost` is the raw typed value (enum/number/boolean
	// fallbacks); `defaultStr` its string form: the text placeholder and the date
	// control's `YYYY-MM-DD`. An object-valued default does not ghost.
	const ghost = $derived(ghostDefault(provenance));
	const defaultStr = $derived(stringifyGhost(ghost));

	// `for` reaches a LABELABLE control and the browser does the rest. The other four
	// are not labelable (the prose leaf's `contenteditable`, the date field's segment
	// container, the object subform, an array's N inputs) so `for` there would be
	// both inert and invalid markup; they take `aria-labelledby` and a click handoff.
	const labelable = $derived(
		field.control === 'text' ||
			field.control === 'enum' ||
			field.control === 'number' ||
			field.control === 'boolean'
	);
	// The parked description node renders only when the schema carries one, so the
	// reference must vanish with it: `aria-describedby` pointing at nothing describes
	// nothing, and silently.
	const describedBy = $derived(field.description ? domIds.description : undefined);

	// ── Focus: one answer, two callers (`leaves.ts`) ─────────────────────────────
	// A label click and the editor's `focusField`/`setCaret` ask the same question, so
	// they read the same function and cannot land in different places. The four
	// labelable controls are reached through the DOM id `for` already points at; the
	// rest own what focusing means and expose `focus()`, because it differs: a PM view
	// restores a selection, a date field lands on its first segment, an array lands on
	// its first element or on the add affordance that is all an empty one has, an
	// object on its first property.
	let proseEl = $state<{ focus: () => void } | undefined>();
	let dateEl = $state<{ focus: () => void } | undefined>();
	let arrayEl = $state<{ focus: () => void; focusElement: (k: number) => void } | undefined>();
	let objectEl = $state<{ focus: () => void } | undefined>();
	function focusControl(): void {
		const owner = proseEl ?? dateEl ?? arrayEl ?? objectEl;
		if (owner) return owner.focus();
		document.getElementById(domIds.control)?.focus();
	}
	/** The array's per-ELEMENT landing, for the addresses the preview mints under an
	 *  array field (`leaves.ts`); read at the call, so it tracks the mounted repeater. */
	function focusElement(k: number): void {
		arrayEl?.focusElement(k);
	}
	// Only where `for` cannot reach; the labelable four are the browser's own, and a
	// second handler over them would be a focus the label already placed.
	const onActivate = $derived(labelable ? undefined : focusControl);

	/**
	 * This field's landing handle. The wrapper is the bloom host rather than the
	 * control: `bloomInside` appends an inset child and an `<input>` holds none.
	 *
	 * A prose leaf is absent here — it registers its own controller from inside
	 * `ProseField`, carrying the codec seam this handle has no half of — and reactive
	 * rather than mount-once, because a retype can swap the control under a leaf key
	 * that does not remount.
	 *
	 * An array carries the per-element lane as well; no other control has elements for
	 * an address to name.
	 */
	let controlEl = $state<HTMLElement | undefined>();
	$effect(() => {
		if (field.control === 'prose' || !controlEl || !leaves) return;
		const key = leafKey;
		const registry = leaves;
		registry.registerControl(key, {
			focus: focusControl,
			focusElement: field.control === 'array' ? focusElement : undefined,
			el: controlEl
		});
		return () => registry.unregisterControl(key);
	});

	/**
	 * A form control has no controller to report its focus through, so the WRAPPER
	 * reports: `focusin` bubbles, so one handler covers a plain input, an array's N
	 * elements and an object's properties alike, and the active leaf names a scalar
	 * field the way it names a prose one. A prose leaf reports through its own
	 * controller — the source that drives its caret signals too — and is excluded here
	 * rather than counted twice.
	 */
	const reportFocus = $derived(field.control === 'prose' ? undefined : () => onFocus?.(addr));
</script>

<div class="qm-field" class:cell={span === 'cell'} class:lone={span === 'lone'}>
	{#if field.control !== 'array'}
		<FieldLabel
			label={field.label}
			controlId={labelable ? domIds.control : undefined}
			id={domIds.label}
			descriptionId={domIds.description}
			{onActivate}
			required={field.required}
			description={field.description}
		/>
	{/if}
	<div class="qm-field-control" bind:this={controlEl} onfocusin={reportFocus}>
		{#if field.control === 'prose'}
			<ProseField
				{quill}
				bind:this={proseEl}
				{doc}
				{addr}
				inline={field.inline}
				plaintext={field.plaintext}
				labelledBy={domIds.label}
				{describedBy}
				{leafKey}
				{onFocus}
				{onCaretMove}
				{onChange}
				{onError}
				{leaves}
			/>
		{:else if field.control === 'enum'}
			<EnumField
				value={value as string | undefined}
				values={enumValues(field.schema) ?? []}
				fallback={ghost as string | undefined}
				id={domIds.control}
				{describedBy}
				onCommit={onCommitScalar}
				{optionAllowed}
				{enumDisallowed}
			/>
		{:else if field.control === 'number'}
			<NumberField
				value={value as number | undefined}
				integer={field.schema.type === 'integer'}
				fallback={ghost as number | undefined}
				id={domIds.control}
				{describedBy}
				onCommit={onCommitScalar}
			/>
		{:else if field.control === 'boolean'}
			<BooleanField
				value={value as boolean | undefined}
				fallback={ghost as boolean | undefined}
				id={domIds.control}
				{describedBy}
				onCommit={onCommitScalar}
			/>
		{:else if field.control === 'date'}
			<DateField
				bind:this={dateEl}
				value={value as string | undefined}
				fallback={defaultStr}
				labelledBy={domIds.label}
				{describedBy}
				onCommit={onCommitScalar}
			/>
		{:else if field.control === 'array'}
			<ArrayField
				bind:this={arrayEl}
				value={value as unknown[] | undefined}
				items={field.schema.items}
				label={field.label}
				required={field.required}
				description={field.description}
				labelId={domIds.label}
				descriptionId={domIds.description}
				onCommit={onCommitScalar}
			/>
		{:else if field.control === 'object'}
			<ObjectField
				bind:this={objectEl}
				value={value as Record<string, unknown> | undefined}
				properties={field.schema.properties}
				label={field.label}
				labelledBy={domIds.label}
				{describedBy}
				onCommit={onCommitScalar}
			/>
		{:else}
			<TextField
				value={value as string | undefined}
				placeholder={defaultStr}
				id={domIds.control}
				{describedBy}
				onCommit={onCommitScalar}
			/>
		{/if}
	</div>

	<DiagnosticList {diagnostics} />
</div>

<style>
	/* The `full` span, and the base every field starts from: its own row, a plain
	   stack. Nothing shares the row, so there are no internals to align against.

	   THE ACTION COLUMN IS THE FIELD'S INSET, not the section's:
	   a row action's tap target plus the grid's own column gutter, held clear at the
	   end of whatever the field spans. On the SECTION it reserves one trailing column
	   for the whole grid, which reaches only a field that stops short of it. The array
	   carries the only row action there is, and it always owns its row (structure.ts
	   `packable`), so it spans that reservation with every other column: the one field
	   a section could reserve for is the one it would miss. Per field the reservation
	   travels with the thing that uses it: one right edge per track, every control in a
	   row ending on it, and an array reaching back across its own to put its remove
	   past it (ArrayField). Every field pays the width, including one with no action in
	   it; a right edge that moved with a field's contents is the raggedness this
	   removes. */
	.qm-field {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space);
		grid-column: 1 / -1;
		min-width: 0;
		padding-right: var(--action-col);
	}
	/* A row-sharing field subgrids onto the section's row tracks instead of sizing its
	 own: three tracks (label, control, diagnostics) taken from the parent, so every
	 control in a visual row starts at the same y however tall a neighbour's label
	 wrapped, and one field's diagnostic lifts none of the others out of line. Source
	 order IS track order; `align-items: start` keeps a short control from stretching
	 to a taller sibling's track. `row-gap` overrides the section's inter-row gutter
	 for the tracks this field spans: inside a field the rhythm is tighter than
	 between rows. */
	.qm-field.cell,
	.qm-field.lone {
		display: grid;
		grid-row: span 3;
		grid-template-rows: subgrid;
		row-gap: var(--_qm-space);
		align-items: start;
	}
	.qm-field.cell {
		grid-column: span 1;
	}
	/* Positioned for the arrival wash a landing inserts (`core/bloom.ts`), the way
	   `.qm-prose` is: an inset child over the control, since an `<input>` takes none.
	   The radius is the control's own, so the wash's corners are the box's rather than
	   square over a rounded one; on an array or a subform it bounds a group, where
	   there is no single box for it to disagree with. */
	.qm-field-control {
		position: relative;
		border-radius: var(--_qm-radius-inner);
	}
	/* A run of one takes half the capacity from column 1: `--cols-half` is the section's
	 capacity halved, so the edge lands on a track boundary at every capacity. */
	.qm-field.lone {
		grid-column: span var(--cols-half);
	}
</style>
