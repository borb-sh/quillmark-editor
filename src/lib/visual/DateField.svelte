<!--
  A `datetime` field → native date control. The corpus stores the value as a
  string (fixture uses `YYYY-MM-DD`, blank to mean "today at render"); this binds
  that string directly and commits it on change.
-->
<script lang="ts">
	import { untrack } from 'svelte';

	interface Props {
		value: string | undefined;
		onCommit: (v: string) => void;
		testid?: string;
	}
	let { value, onCommit, testid }: Props = $props();

	// svelte-ignore state_referenced_locally
	let local = $state(value ?? '');
	$effect(() => {
		const incoming = value ?? '';
		untrack(() => {
			if (incoming !== local) local = incoming;
		});
	});
</script>

<input
	class="qm-input"
	type="date"
	value={local}
	data-testid={testid}
	oninput={(e) => {
		local = (e.currentTarget as HTMLInputElement).value;
		onCommit(local);
	}}
/>

<style>
	.qm-input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.3rem 0.45rem;
		border: 1px solid var(--qm-border, #d4d4d4);
		border-radius: 4px;
		font: inherit;
		background: var(--qm-field-bg, #fff);
	}
</style>
