<!--
  A `string`+`enum` (or `type: 'enum'`) field → select over `enum ?? values`.
  When nothing is authored the select shows a distinct UNSET sentinel that GHOSTS
  the `default:` (muted, shown-never-written) — not the default masquerading as a
  selected value (issue #21a): that made the ghost indistinguishable from an
  authored pick AND made re-picking the default a no-op (the value already equaled
  it, so `onchange` never fired). The sentinel commits nothing; any real pick —
  INCLUDING the value that equals the default — commits via the parent's typed
  `writer.set`. Explicitly picking the default is the one place "commit the default"
  is genuine intent, now expressible. The sentinel stays in the list even once a
  value is authored, as the "clear back to default" (unset) affordance.
-->
<script lang="ts">
	import { untrack } from 'svelte';

	interface Props {
		value: string | undefined;
		values: string[];
		fallback?: string;
		/** Accessible name — the visual label is a bare span the select can't reference. */
		label?: string;
		onCommit: (v: string | undefined) => void;
		testid?: string;
	}
	let { value, values, fallback, label, onCommit, testid }: Props = $props();

	// The sentinel's option value — a namespaced marker that no schema-authored
	// enum member would ever be (`values` are classification markings, seal ids, and
	// the like), so it never collides with a real option.
	const UNSET = '__qm_unset__';

	// svelte-ignore state_referenced_locally
	let local = $state(value ?? UNSET);
	$effect(() => {
		const incoming = value ?? UNSET;
		untrack(() => {
			if (incoming !== local) local = incoming;
		});
	});
</script>

<select
	class="qm-select"
	class:ghosted={local === UNSET}
	value={local}
	aria-label={label}
	data-testid={testid}
	onchange={(e) => {
		local = (e.currentTarget as HTMLSelectElement).value;
		// Sentinel → unset (parent `removeField`, default renders); any real pick
		// (incl. the default value) → a genuine write.
		onCommit(local === UNSET ? undefined : local);
	}}
>
	<option value={UNSET} class="qm-ghost"
		>{fallback != null && fallback !== '' ? fallback : '—'}</option
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
	/* Shown-never-written: the closed control reads muted while unset, matching the
	   ghosted placeholder the text/number controls show. */
	.qm-select.ghosted {
		color: var(--qm-ghost, #9a9a9a);
	}
	.qm-ghost {
		color: var(--qm-ghost, #9a9a9a);
	}
</style>
