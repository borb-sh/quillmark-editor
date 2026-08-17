<!--
 An `enum` declaring `variants:` → the discriminant's select, and under it the cells
 the chosen world brings into play (canon `SCHEMAS.md` §"Enum variants"). The field
 rests as a container, `{value: <member>, …that member's fields}`, and commits whole:
 it is one cell to `Addr`, so there is no per-cell write address and none is wanted.

 The cells are the object subform, unchanged. A variant's cell set is a scalar field
 set keyed by name over a container the parent commits by value, which is what that
 component already is; passing the whole container as its `value` and the world's
 declaration as its `properties` gives back the container with one cell written, which
 is exactly what this commits. Cells outside the drawn world ride through untouched.

 A discriminant flip keeps the other worlds' answers, and so does clearing it. The
 boundary carries a stranded answer and warns `validation::out_of_variant` rather than
 dropping it, so that the ordinary gesture — pick a world, fill it, flip to compare,
 flip back — costs nothing; a control that dropped them would spend exactly what the
 engine went out of its way to keep.

 A stranded answer is therefore held but undrawn: the cells of a world that is not
 live have nowhere to render, and `out_of_variant` is a warning, which the inline lane
 does not carry (it draws errors only). It is a read of `quill.validate(doc)`, where a
 host that wants to surface one finds it — the same lane obligation is on.
-->
<script lang="ts">
	import type { QuillFieldSchema } from '@quillmark/wasm';
	import EnumField from './EnumField.svelte';
	import ObjectField from './ObjectField.svelte';
	import { commitDiscriminant, variantCells, variantMember } from './structure.js';

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

	const member = $derived(variantMember(value, ghostMember));
	const cells = $derived(variantCells(schema, member));
	const discriminant = $derived(value?.value as string | undefined);
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
			<ObjectField
				value={value ?? {}}
				properties={cells}
				{label}
				{labelledBy}
				{describedBy}
				onCommit={(obj) => onCommit(obj)}
			/>
		{/key}
	{/if}
</div>

<style>
	.qm-variant {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
	}
</style>
