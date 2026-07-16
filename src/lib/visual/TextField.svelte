<!--
  A `string` field → text input. Commits live (on input) via the parent's typed
  `writer.set`. The ghosted `default:` is the placeholder — shown, never written
  (VISUAL_EDITOR §"the commitment ladder").
-->
<script lang="ts">
	import { untrack } from 'svelte';

	interface Props {
		value: string | undefined;
		placeholder?: string;
		onCommit: (v: string) => void;
		testid?: string;
	}
	let { value, placeholder, onCommit, testid }: Props = $props();

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
