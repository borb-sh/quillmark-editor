<!--
  A `string` field → text input. Commits a non-empty edit LIVE (on input) via the
  parent's typed `writer.set`, so the preview tracks typing. A cleared field is the
  UNSET rung of the commitment ladder (VISUAL_EDITOR §"the commitment ladder"): it
  commits `undefined` (the parent removes the field, ghosted `default:` renders) —
  but at `change` (blur), NOT per keystroke, so select-all-and-retype doesn't flash
  the field through its default between the delete and the first typed char.
  Trade-off (recorded in VISUAL_EDITOR): an explicit empty string OVER a non-empty
  default is inexpressible from the UI — clear and unset collapse to one gesture.
-->
<script lang="ts">
	import { untrack } from 'svelte';

	interface Props {
		value: string | undefined;
		placeholder?: string;
		/** Accessible name — the visual label is a bare span the input can't reference. */
		label?: string;
		onCommit: (v: string | undefined) => void;
		testid?: string;
	}
	let { value, placeholder, label, onCommit, testid }: Props = $props();

	// Local input state; reconcile only an EXTERNAL change (untrack the local
	// read/write so own-typing never re-runs the sync and resets the caret). The
	// initial-value capture is intentional — external updates flow via the effect.
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
	type="text"
	value={local}
	{placeholder}
	aria-label={label}
	data-testid={testid}
	oninput={(e) => {
		local = (e.currentTarget as HTMLInputElement).value;
		// Live-commit a non-empty edit; defer a cleared field to `change` (see header).
		if (local !== '') onCommit(local);
	}}
	onchange={() => {
		if (local === '') onCommit(undefined);
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
