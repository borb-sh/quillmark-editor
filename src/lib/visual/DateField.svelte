<!--
  A `date` (or `datetime`) field → native date control. The stored value is a
  string (fixture uses `YYYY-MM-DD`, blank to mean "today at render"); this binds
  that string directly and commits it at `change`. A cleared control commits
  `undefined` — the unset rung: the parent removes the field, so the memo quill's
  blank-date → `datetime.today()` substitution applies (issue #12). The value-object
  a date field lowers to is a render-time concern — the editor only sees the stored string.
-->
<script lang="ts">
	import { untrack } from 'svelte';

	interface Props {
		value: string | undefined;
		/** Accessible name — the visual label is a bare span the input can't reference. */
		label?: string;
		onCommit: (v: string | undefined) => void;
		testid?: string;
	}
	let { value, label, onCommit, testid }: Props = $props();

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
	aria-label={label}
	data-testid={testid}
	oninput={(e) => {
		local = (e.currentTarget as HTMLInputElement).value;
	}}
	onchange={() => {
		// `local` is owned by `oninput`. Blank → `undefined` (unset rung); a real date as-is.
		onCommit(local === '' ? undefined : local);
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
