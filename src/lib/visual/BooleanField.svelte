<!--
  A `boolean` field → toggle. (No boolean field exists in the reference quill, so
  this control is implemented to the schema contract but is UNTESTED against a
  real leaf — noted in the phase report.)
-->
<script lang="ts">
	import { syncedLocal } from './synced.svelte.js';

	interface Props {
		value: boolean | undefined;
		fallback?: boolean;
		/** Accessible name — the visual label is a bare span the checkbox can't reference. */
		label?: string;
		onCommit: (v: boolean) => void;
		testid?: string;
	}
	let { value, fallback, label, onCommit, testid }: Props = $props();

	// Local toggle state synced to `value`; own-toggles stay local, only an external
	// change reconciles back in (see `syncedLocal`).
	const local = syncedLocal(() => value ?? fallback ?? false);
</script>

<input
	class="qm-check"
	type="checkbox"
	checked={local.value}
	aria-label={label}
	data-testid={testid}
	onchange={(e) => {
		local.value = (e.currentTarget as HTMLInputElement).checked;
		onCommit(local.value);
	}}
/>

<style>
	.qm-check {
		width: 1rem;
		height: 1rem;
	}
</style>
