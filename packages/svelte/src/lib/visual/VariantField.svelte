<!--
 An `enum` declaring `variants:` → the discriminant's select, and under it the cells
 the chosen world brings into play (VISUAL_EDITOR §"Enum variants"). The field rests as
 a container, `{value: <member>, …that member's fields}`, and commits whole: it is one
 cell to `Addr`, so there is no per-cell write address.

 The cells are {@link ObjectField}, which already draws a scalar field set keyed by
 name over a container its parent commits by value. It takes the whole container as its
 `value` and the world's declaration as its `properties`, so what it hands back is the
 container with one cell written — and cells outside the drawn world ride through
 untouched rather than needing to be merged back.

 What those untouched cells hold is named under them ({@link strandedWorlds}).
-->
<script lang="ts">
	import type { QuillFieldSchema } from '@quillmark/wasm';
	import EnumField from './EnumField.svelte';
	import ObjectField from './ObjectField.svelte';
	import {
		VARIANT_DISCRIMINANT,
		commitDiscriminant,
		stringifyGhost,
		strandedWorlds,
		variantCells,
		variantMember
	} from './structure.js';
	import { wording } from './strings.js';

	interface Props {
		/** The stored container, or undefined while the field is unset. */
		value: Record<string, unknown> | undefined;
		schema: QuillFieldSchema;
		/** The resolved `default:`'s member: what an unset field renders as. */
		ghostMember: string | undefined;
		/** Field label, the naming prefix the cells' controls compose with. */
		label: string;
		/** `<label for>` target: the discriminant trigger, this control's one labelable
		 * element. The cells are named by their own composed labels. */
		id?: string;
		labelledBy?: string;
		describedBy?: string;
		onCommit: (v: Record<string, unknown> | undefined) => void;
		optionAllowed?: (value: string) => boolean;
		enumDisallowed?: 'hide' | 'disable';
	}
	let {
		value,
		schema,
		ghostMember,
		label,
		id,
		labelledBy,
		describedBy,
		onCommit,
		optionAllowed,
		enumDisallowed
	}: Props = $props();

	const t = wording();

	const member = $derived(variantMember(value, ghostMember));
	const cells = $derived(variantCells(schema, member));
	const discriminant = $derived(value?.[VARIANT_DISCRIMINANT] as string | undefined);
	const stranded = $derived(strandedWorlds(schema, value, member));
</script>

<div class="qm-variant">
	<EnumField
		value={discriminant}
		values={schema.values ?? []}
		fallback={ghostMember}
		{id}
		{describedBy}
		onCommit={(v) => onCommit(commitDiscriminant(value, v))}
		{optionAllowed}
		{enumDisallowed}
	/>
	<!-- Keyed on the member so a flip remounts the cells rather than re-targeting
	     them: two worlds' cells are different fields that happen to occupy one place,
	     and a control carrying local state (an unreconciled pick, a caret) across the
	     flip would carry it between them. -->
	{#if cells}
		{#key member}
			<!-- `close`: the discriminant's box directly above IS the cells' top boundary,
			     so the band's opening stroke would state it twice. -->
			<ObjectField
				value={value ?? {}}
				properties={cells}
				{label}
				idBase={id}
				{labelledBy}
				{describedBy}
				edges="close"
				onCommit={(obj) => onCommit(obj)}
			/>
		{/key}
	{/if}
	<!-- Read-only, and picking that world is where these are edited: the answers are the
	     engine's to hold (VISUAL_EDITOR §"Enum variants"). An answer that is not a scalar
	     names its cell alone. -->
	{#each stranded as world (world.member)}
		<div class="qm-variant-stranded">
			<span class="qm-variant-stranded-head"
				>{t.strings.variantStranded(world.member, world.cells.length)}</span
			>
			{#each world.cells as cell (cell.key)}
				{@const shown = stringifyGhost(cell.value)}
				<span class="qm-variant-stranded-cell">
					<span class="qm-variant-stranded-name">{cell.label}</span>
					{#if shown}<span class="qm-variant-stranded-value">{shown}</span>{/if}
				</span>
			{/each}
		</div>
	{/each}
</div>

<style>
	.qm-variant {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
	}
	/* A note, not a control: the label rungs throughout and no box, the column's own gap
	   separating it from the cells above. */
	.qm-variant-stranded {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--_qm-space) var(--_qm-space-2);
		font-size: var(--_qm-text-label);
		color: var(--_qm-ink-label);
	}
	.qm-variant-stranded-head {
		flex-basis: 100%;
	}
	/* Name and answer as one run, so a wrap breaks between cells rather than through one. */
	.qm-variant-stranded-cell {
		display: inline-flex;
		align-items: baseline;
		gap: var(--_qm-space);
	}
	.qm-variant-stranded-value {
		color: var(--_qm-fg);
	}
</style>
