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
	import { syncedLocal } from './synced.svelte.js';

	interface Props {
		value: string | undefined;
		placeholder?: string;
		/** Accessible name — the visual label is a bare span the input can't reference. */
		label?: string;
		onCommit: (v: string | undefined) => void;
		testid?: string;
	}
	let { value, placeholder, label, onCommit, testid }: Props = $props();

	// Local input state synced to `value`: own-typing stays local, only an external
	// change reconciles back in (see `syncedLocal`).
	const local = syncedLocal(() => value ?? '');
</script>

<input
	class="qm-input"
	type="text"
	value={local.value}
	{placeholder}
	aria-label={label}
	data-testid={testid}
	oninput={(e) => {
		local.value = (e.currentTarget as HTMLInputElement).value;
		// Live-commit a non-empty edit; defer a cleared field to `change` (see header).
		if (local.value !== '') onCommit(local.value);
	}}
	onchange={() => {
		if (local.value === '') onCommit(undefined);
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
	/* Themed focus ring in place of the raw UA outline — one hue with the prose
	   leaf's active border and the preview active box (SURFACES §Focus). */
	.qm-input:focus-visible {
		outline: 2px solid var(--qm-focus-ring, #2563eb);
		outline-offset: 1px;
	}
</style>
