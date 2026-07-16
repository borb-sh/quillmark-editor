<!--
  A `boolean` field → toggle. (No boolean field exists in the reference quill, so
  this control is implemented to the schema contract but is UNTESTED against a
  real leaf — noted in the phase report.)
-->
<script lang="ts">
	import { untrack } from 'svelte';

	interface Props {
		value: boolean | undefined;
		fallback?: boolean;
		/** Accessible name — the visual label is a bare span the checkbox can't reference. */
		label?: string;
		onCommit: (v: boolean) => void;
		testid?: string;
	}
	let { value, fallback, label, onCommit, testid }: Props = $props();

	// svelte-ignore state_referenced_locally
	let local = $state(value ?? fallback ?? false);
	$effect(() => {
		const incoming = value ?? fallback ?? false;
		untrack(() => {
			if (incoming !== local) local = incoming;
		});
	});
</script>

<input
	class="qm-check"
	type="checkbox"
	checked={local}
	aria-label={label}
	data-testid={testid}
	onchange={(e) => {
		local = (e.currentTarget as HTMLInputElement).checked;
		onCommit(local);
	}}
/>

<style>
	.qm-check {
		width: 1rem;
		height: 1rem;
	}
</style>
