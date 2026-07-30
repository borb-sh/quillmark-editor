<!--
 An `object` field → a nested subform over `properties` (declaration order),
 committing the WHOLE object by value on any nested change. No object field
 exists in the reference quill, so this is implemented to the schema contract
 for SCALAR properties and is UNTESTED against a real leaf; nested
 prose/array/object properties render a placeholder rather than recurse.

 A property's ghosted `default:` is the static schema `sub.default`, not the
 resolved provenance the top-level ghosts read (FIELD_PROVENANCE): `resolve`
 carries no per-property row (an object field resolves as one row whose value is
 the whole object). Thread it through `ghostDefault` once resolve exposes
 per-property provenance.
-->
<script lang="ts">
	import type { QuillFieldSchema } from '../core/index.js';
	import { controlKind, enumValues, humanize } from './structure.js';
	import TextField from './TextField.svelte';
	import EnumField from './EnumField.svelte';
	import NumberField from './NumberField.svelte';
	import BooleanField from './BooleanField.svelte';
	import DateField from './DateField.svelte';

	interface Props {
		value: Record<string, unknown> | undefined;
		properties: Record<string, QuillFieldSchema> | undefined;
		/** Accessible-name prefix for the property controls. */
		label?: string;
		/** The field label's own id. A subform is a GROUP of controls, not one control
		 * `for` could reach, so the field's label names the set and each property
		 * control keeps its own composed `aria-label`. */
		labelledBy?: string;
		/** The parked `description` (FieldLabel): announced on entering the group. */
		describedBy?: string;
		onCommit: (obj: Record<string, unknown>) => void;
	}
	let { value, properties, label, labelledBy, describedBy, onCommit }: Props = $props();

	const entries = $derived(Object.entries(properties ?? {}));
	const obj = $derived((value ?? {}) as Record<string, unknown>);

	function commitProp(key: string, v: unknown): void {
		if (v === undefined) {
			// A nested control cleared (the unset rung): drop the key so the property
			// is ABSENT in the committed object (resolving to its own `default:`)
			// rather than an `undefined` hole carried through `writer.set`.
			const rest = { ...obj };
			delete rest[key];
			onCommit(rest);
		} else {
			onCommit({ ...obj, [key]: v });
		}
	}
</script>

<div class="qm-object" role="group" aria-labelledby={labelledBy} aria-describedby={describedBy}>
	{#each entries as [key, sub] (key)}
		{@const kind = controlKind(sub)}
		{@const propLabel = `${label != null ? `${label} ` : ''}${sub.ui?.title ?? humanize(key)}`}
		<div class="qm-object-prop">
			<span class="qm-object-label">{sub.ui?.title ?? humanize(key)}</span>
			{#if kind === 'enum'}
				<EnumField
					label={propLabel}
					value={obj[key] as string | undefined}
					values={enumValues(sub) ?? []}
					fallback={sub.default as string | undefined}
					onCommit={(v) => commitProp(key, v)}
				/>
			{:else if kind === 'number'}
				<NumberField
					label={propLabel}
					value={obj[key] as number | undefined}
					integer={sub.type === 'integer'}
					fallback={sub.default as number | undefined}
					onCommit={(v) => commitProp(key, v)}
				/>
			{:else if kind === 'boolean'}
				<BooleanField
					label={propLabel}
					value={obj[key] as boolean | undefined}
					fallback={sub.default as boolean | undefined}
					onCommit={(v) => commitProp(key, v)}
				/>
			{:else if kind === 'date'}
				<DateField
					label={propLabel}
					value={obj[key] as string | undefined}
					onCommit={(v) => commitProp(key, v)}
				/>
			{:else if kind === 'text'}
				<TextField
					label={propLabel}
					value={obj[key] as string | undefined}
					placeholder={sub.default != null ? String(sub.default) : undefined}
					onCommit={(v) => commitProp(key, v)}
				/>
			{:else}
				<span class="qm-unsupported">({kind} property — not editable in V1)</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	.qm-object {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
		border-left: var(--_qm-border-width) solid var(--_qm-border);
		padding-left: var(--_qm-space-2);
	}
	.qm-object-prop {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-half);
	}
	.qm-object-label {
		font-size: var(--_qm-text-label);
		/* Soft (500), a rung under the top-level field label's 600: a nested object
		   prop reads as secondary. Resolves the label-weight disagreement. */
		font-weight: var(--_qm-weight-soft);
		/* A label is a line, not a passage, so it overrides the root's reading
		   rhythm the way every other label rung does (SURFACES §Rhythm). */
		line-height: var(--_qm-leading-tight);
		color: var(--_qm-ink-label);
	}
	.qm-unsupported {
		font-size: var(--_qm-text-body);
		color: var(--_qm-ink-ghost);
		font-style: italic;
	}
</style>
