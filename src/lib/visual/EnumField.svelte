<!--
  A `string`+`enum` (or `type: 'enum'`) field → select over `enum ?? values`.
  Seeds the shown option from the authored value, else the `default:` (ghosted,
  not written until the user picks). Commits on change.
-->
<script lang="ts">
	import { untrack } from 'svelte';

	interface Props {
		value: string | undefined;
		values: string[];
		fallback?: string;
		onCommit: (v: string) => void;
		testid?: string;
	}
	let { value, values, fallback, onCommit, testid }: Props = $props();

	// svelte-ignore state_referenced_locally
	let local = $state(value ?? fallback ?? '');
	$effect(() => {
		const incoming = value ?? fallback ?? '';
		untrack(() => {
			if (incoming !== local) local = incoming;
		});
	});
</script>

<select
	class="qm-select"
	value={local}
	data-testid={testid}
	onchange={(e) => {
		local = (e.currentTarget as HTMLSelectElement).value;
		onCommit(local);
	}}
>
	{#each values as v (v)}
		<option value={v}>{v === '' ? '—' : v}</option>
	{/each}
</select>

<style>
	.qm-select {
		width: 100%;
		box-sizing: border-box;
		padding: 0.3rem 0.45rem;
		border: 1px solid var(--qm-border, #d4d4d4);
		border-radius: 4px;
		font: inherit;
		background: var(--qm-field-bg, #fff);
	}
</style>
