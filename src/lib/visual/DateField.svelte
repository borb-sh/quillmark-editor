<!--
  A `date` (or `datetime`) field → native date control. The stored value is a
  string (fixture uses `YYYY-MM-DD`, blank to mean "today at render"); this binds
  that string directly and commits it at `change`. A cleared control commits
  `undefined` — the unset rung: the parent removes the field, so the memo quill's
  blank-date → `datetime.today()` substitution applies (issue #12). The value-object
  a date field lowers to is a render-time concern — the editor only sees the stored string.
-->
<script lang="ts">
	import { syncedLocal } from './synced.svelte.js';

	interface Props {
		value: string | undefined;
		/** Accessible name — the visual label is a bare span the input can't reference. */
		label?: string;
		onCommit: (v: string | undefined) => void;
		testid?: string;
	}
	let { value, label, onCommit, testid }: Props = $props();

	// Local input state synced to `value`; own-edits stay local, only an external
	// change reconciles back in (see `syncedLocal`).
	const local = syncedLocal(() => value ?? '');
</script>

<input
	class="qm-input"
	type="date"
	value={local.value}
	aria-label={label}
	data-testid={testid}
	oninput={(e) => {
		local.value = (e.currentTarget as HTMLInputElement).value;
	}}
	onchange={() => {
		// `local` is owned by `oninput`. Blank → `undefined` (unset rung); a real date as-is.
		onCommit(local.value === '' ? undefined : local.value);
	}}
/>

<style>
	.qm-input {
		width: 100%;
		box-sizing: border-box;
		padding: var(--_qm-space) var(--_qm-space-2);
		border: 1px solid var(--_qm-border);
		border-radius: var(--_qm-radius-inner);
		font: inherit;
		background: var(--_qm-surface);
	}
	/* Themed focus ring in place of the raw UA outline (SURFACES §Focus). */
	.qm-input:focus-visible {
		outline: 2px solid var(--_qm-accent);
		outline-offset: 1px;
	}
</style>
