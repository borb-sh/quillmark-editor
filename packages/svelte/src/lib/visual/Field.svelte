<!--
 Type dispatch (VISUAL_EDITOR §"A control per field type"). Given one projected
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
	import type { FieldController } from '../core/codec/index.js';
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
		/** LIVE prose address (getter-`card`); used only when control === 'prose'. */
		proseAddr: Addr;
		leafKey: string;
		/** This field's three DOM names, derived from `leafKey` (see `domid.ts`): how
		 * the label and the control find each other. */
		domIds: FieldDomIds;
		onCommitScalar: (value: unknown) => void;
		/** Enum-option policy: `false` disables that option. Only the enum
		 * control reads it; other controls ignore it. */
		optionAllowed?: (value: string) => boolean;
		onFocus?: (addr: Addr) => void;
		onCaretMove?: (addr: Addr, pos: number) => void;
		onChange?: (addr: Addr) => void;
		onError?: EditorErrorHandler;
		register?: (key: string, controller: FieldController) => void;
		unregister?: (key: string) => void;
		diagnostics?: Diagnostic[];
	}
	let {
		field,
		span,
		value,
		provenance,
		doc,
		quill,
		proseAddr,
		leafKey,
		domIds,
		onCommitScalar,
		optionAllowed,
		onFocus,
		onCaretMove,
		onChange,
		onError,
		register,
		unregister,
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

	// Focus handoff for the two controls a label click cannot reach natively. Both
	// expose their own `focus()` because "focusing" differs: a PM view restores a
	// selection, a date field lands on its first segment.
	let proseEl = $state<{ focus: () => void } | undefined>();
	let dateEl = $state<{ focus: () => void } | undefined>();
	const onActivate = $derived(
		field.control === 'prose'
			? () => proseEl?.focus()
			: field.control === 'date'
				? () => dateEl?.focus()
				: undefined
	);
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
	<div class="qm-field-control">
		{#if field.control === 'prose'}
			<ProseField
				{quill}
				bind:this={proseEl}
				{doc}
				addr={proseAddr}
				inline={field.inline}
				plaintext={field.plaintext}
				labelledBy={domIds.label}
				{describedBy}
				{leafKey}
				{onFocus}
				{onCaretMove}
				{onChange}
				{onError}
				{register}
				{unregister}
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
				value={value as unknown[] | undefined}
				items={field.schema.items}
				label={field.label}
				required={field.required}
				description={field.description}
				labelId={domIds.label}
				descriptionId={domIds.description}
				onCommit={onCommitScalar}
				onFocusEl={() => onFocus?.(proseAddr)}
			/>
		{:else if field.control === 'object'}
			<ObjectField
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
	   stack. Nothing shares the row, so there are no internals to align against. */
	.qm-field {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space);
		grid-column: 1 / -1;
		min-width: 0;
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
	/* A run of one takes half the capacity from column 1: `--cols-half` is the section's
	 capacity halved, so the edge lands on a track boundary at every capacity. */
	.qm-field.lone {
		grid-column: span var(--cols-half);
	}
</style>
