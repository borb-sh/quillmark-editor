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
  `diagnostics` prop — VISUAL_EDITOR §Diagnostics) — rendered via the shared
  `DiagnosticList`, severity-styled, NON-GATING.
-->
<script lang="ts">
	import type { Document, Addr, Diagnostic, ResolvedField } from '../core/index.js';
	import type { FieldController } from '../core/codec/index.js';
	import type { FieldModel, FieldSpan } from './structure.js';
	import { enumValues, ghostDefault, stringifyGhost } from './structure.js';
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
		/** This field's resolved provenance row (FIELD_PROVENANCE) — the ghost's
		 * source. Feeds the placeholder / fallback only, never `value`. */
		provenance?: ResolvedField;
		doc: Document;
		/** LIVE prose address (getter-`card`); used only when control === 'prose'. */
		proseAddr: Addr;
		leafKey: string;
		onCommitScalar: (value: unknown) => void;
		/** Enum-option policy: `false` disables that option. Only the enum
		 * control reads it; other controls ignore it. */
		optionAllowed?: (value: string) => boolean;
		onFocus?: (addr: Addr) => void;
		onCaretMove?: (addr: Addr, pos: number) => void;
		register?: (key: string, controller: FieldController) => void;
		unregister?: (key: string) => void;
		diagnostics?: Diagnostic[];
		testid?: string;
	}
	let {
		field,
		span,
		value,
		provenance,
		doc,
		proseAddr,
		leafKey,
		onCommitScalar,
		optionAllowed,
		onFocus,
		onCaretMove,
		register,
		unregister,
		diagnostics,
		testid
	}: Props = $props();

	// The ghost the control shows when unset: the resolved `default:` (provenance,
	// `source === 'default'`). `ghost` is the raw typed value (enum/number/boolean
	// fallbacks); `defaultStr` its string form — the text placeholder and the date
	// control's `YYYY-MM-DD`. An object-valued default does not ghost.
	const ghost = $derived(ghostDefault(provenance));
	const defaultStr = $derived(stringifyGhost(ghost));
</script>

<div class="qm-field" class:cell={span === 'cell'} class:lone={span === 'lone'}>
	{#if field.control !== 'array'}
		<FieldLabel
			label={field.label}
			required={field.required}
			description={field.description}
			{testid}
		/>
	{/if}
	<div class="qm-field-control">
		{#if field.control === 'prose'}
			<ProseField
				{doc}
				addr={proseAddr}
				inline={field.inline}
				plaintext={field.plaintext}
				label={field.label}
				{leafKey}
				{onFocus}
				{onCaretMove}
				{register}
				{unregister}
				testid={testid ? `prose-${testid}` : undefined}
			/>
		{:else if field.control === 'enum'}
			<EnumField
				value={value as string | undefined}
				values={enumValues(field.schema) ?? []}
				fallback={ghost as string | undefined}
				label={field.label}
				onCommit={onCommitScalar}
				{optionAllowed}
				{testid}
			/>
		{:else if field.control === 'number'}
			<NumberField
				value={value as number | undefined}
				integer={field.schema.type === 'integer'}
				fallback={ghost as number | undefined}
				label={field.label}
				onCommit={onCommitScalar}
				{testid}
			/>
		{:else if field.control === 'boolean'}
			<BooleanField
				value={value as boolean | undefined}
				fallback={ghost as boolean | undefined}
				label={field.label}
				onCommit={onCommitScalar}
				{testid}
			/>
		{:else if field.control === 'date'}
			<DateField
				value={value as string | undefined}
				fallback={defaultStr}
				label={field.label}
				onCommit={onCommitScalar}
				{testid}
			/>
		{:else if field.control === 'array'}
			<ArrayField
				value={value as unknown[] | undefined}
				items={field.schema.items}
				label={field.label}
				required={field.required}
				description={field.description}
				onCommit={onCommitScalar}
				onFocusEl={() => onFocus?.(proseAddr)}
				{testid}
			/>
		{:else if field.control === 'object'}
			<ObjectField
				value={value as Record<string, unknown> | undefined}
				properties={field.schema.properties}
				label={field.label}
				onCommit={onCommitScalar}
				{testid}
			/>
		{:else}
			<TextField
				value={value as string | undefined}
				placeholder={defaultStr}
				label={field.label}
				onCommit={onCommitScalar}
				{testid}
			/>
		{/if}
	</div>

	<DiagnosticList {diagnostics} testid={testid ? `diag-${testid}` : undefined} />
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
	   own: three tracks — label, control, diagnostics — taken from the parent, so every
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
	/* A run of one takes half the capacity from column 1 — `--cols-half` is the section's
	   capacity halved, so the edge lands on a track boundary at every capacity. */
	.qm-field.lone {
		grid-column: span var(--cols-half);
	}
</style>
