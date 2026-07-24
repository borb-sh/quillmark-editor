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
	import type { FieldModel } from './structure.js';
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
		value: unknown;
		/** This field's resolved provenance row (FIELD_PROVENANCE → #64) — the ghost's
		 * source. Feeds the placeholder / fallback only, never `value`. */
		provenance?: ResolvedField;
		doc: Document;
		/** LIVE prose address (getter-`card`); used only when control === 'prose'. */
		proseAddr: Addr;
		leafKey: string;
		onCommitScalar: (value: unknown) => void;
		onFocus?: (addr: Addr) => void;
		onCaretMove?: (addr: Addr, pos: number) => void;
		register?: (key: string, controller: FieldController) => void;
		unregister?: (key: string) => void;
		diagnostics?: Diagnostic[];
		testid?: string;
	}
	let {
		field,
		value,
		provenance,
		doc,
		proseAddr,
		leafKey,
		onCommitScalar,
		onFocus,
		onCaretMove,
		register,
		unregister,
		diagnostics,
		testid
	}: Props = $props();

	// The ghost the control shows when unset: the resolved `default:` (provenance,
	// `source === 'default'`). `ghost` is the raw typed value (enum/number/boolean
	// fallbacks); `defaultStr` its string form (the text placeholder). An
	// object-valued default does not ghost.
	const ghost = $derived(ghostDefault(provenance));
	const defaultStr = $derived(stringifyGhost(ghost));
</script>

<div class="qm-field" class:compact={field.compact}>
	{#if field.control !== 'array'}
		<FieldLabel label={field.label} description={field.description} {testid} />
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
				label={field.label}
				onCommit={onCommitScalar}
				{testid}
			/>
		{:else if field.control === 'array'}
			<ArrayField
				value={value as unknown[] | undefined}
				items={field.schema.items}
				label={field.label}
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
	.qm-field {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space);
		flex: 1 1 auto;
		min-width: 0;
	}
	.qm-field.compact {
		flex: 1 1 12rem;
	}
</style>
