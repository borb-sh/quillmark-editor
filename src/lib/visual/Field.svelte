<!--
  Type dispatch (VISUAL_EDITOR §"A control per field type"). Given one projected
  {@link FieldModel} and its live value, render the label + the control the type
  maps to. Prose leaves take a parent-built LIVE `addr` (its `card` a getter over
  the stable-id→index map) so a reorder re-targets without a remount; scalars,
  arrays, and objects commit their value UP through `onCommitScalar`, which the
  parent lowers to the typed writer.

  `diagnostics` is a Phase-4b seam: the routed diagnostics for this field are
  threaded in and rendered as a minimal inline line — 4b replaces this with the
  real severity/must_fill chrome.
-->
<script lang="ts">
	import type { Document, Quill, Addr, Diagnostic } from '../core/index.js';
	import type { FieldController } from '../core/codec/index.js';
	import type { FieldModel } from './structure.js';
	import { enumValues } from './structure.js';
	import ProseField from './ProseField.svelte';
	import TextField from './TextField.svelte';
	import EnumField from './EnumField.svelte';
	import NumberField from './NumberField.svelte';
	import BooleanField from './BooleanField.svelte';
	import DateField from './DateField.svelte';
	import ArrayField from './ArrayField.svelte';
	import ObjectField from './ObjectField.svelte';

	interface Props {
		field: FieldModel;
		value: unknown;
		doc: Document;
		quill: Quill;
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
		doc,
		quill,
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

	const defaultStr = $derived(
		field.schema.default != null && typeof field.schema.default !== 'object'
			? String(field.schema.default)
			: undefined
	);
</script>

<div class="qm-field" class:compact={field.compact}>
	<span class="qm-field-label">{field.label}</span>
	<div class="qm-field-control">
		{#if field.control === 'prose'}
			<ProseField
				{doc}
				{quill}
				addr={proseAddr}
				inline={field.inline}
				plaintext={field.plaintext}
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
				fallback={field.schema.default as string | undefined}
				onCommit={onCommitScalar}
				{testid}
			/>
		{:else if field.control === 'number'}
			<NumberField
				value={value as number | undefined}
				integer={field.schema.type === 'integer'}
				fallback={field.schema.default as number | undefined}
				onCommit={onCommitScalar}
				{testid}
			/>
		{:else if field.control === 'boolean'}
			<BooleanField
				value={value as boolean | undefined}
				fallback={field.schema.default as boolean | undefined}
				onCommit={onCommitScalar}
				{testid}
			/>
		{:else if field.control === 'date'}
			<DateField value={value as string | undefined} onCommit={onCommitScalar} {testid} />
		{:else if field.control === 'array'}
			<ArrayField
				value={value as unknown[] | undefined}
				items={field.schema.items}
				onCommit={onCommitScalar}
				{testid}
			/>
		{:else if field.control === 'object'}
			<ObjectField
				value={value as Record<string, unknown> | undefined}
				properties={field.schema.properties}
				onCommit={onCommitScalar}
				{testid}
			/>
		{:else}
			<TextField
				value={value as string | undefined}
				placeholder={defaultStr}
				onCommit={onCommitScalar}
				{testid}
			/>
		{/if}
	</div>

	{#if diagnostics && diagnostics.length}
		<!-- Phase 4b seam: minimal inline routing, replaced by severity/must_fill chrome. -->
		<div class="qm-field-diag" data-testid={testid ? `diag-${testid}` : undefined}>
			{#each diagnostics as d, i (i)}
				<span class="qm-diag-line" data-severity={d.severity}>{d.message}</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.qm-field {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1 1 auto;
		min-width: 0;
	}
	.qm-field.compact {
		flex: 1 1 12rem;
	}
	.qm-field-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--qm-label, #555);
	}
	.qm-field-diag {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.qm-diag-line {
		font-size: 0.72rem;
		color: #b25000;
	}
	.qm-diag-line[data-severity='error'] {
		color: #c5221f;
	}
</style>
