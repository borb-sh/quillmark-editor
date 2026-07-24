<!--
  A `string`+`enum` (or `type: 'enum'`) field → select over `enum ?? values`.
  When nothing is authored the select shows a distinct UNSET sentinel that GHOSTS
  the `default:` (muted, shown-never-written), distinguishable from an authored
  pick and re-selectable — so re-picking the default fires `onchange` (issue #21a).
  The sentinel commits nothing; any real pick — INCLUDING the value that equals the
  default — commits via the parent's typed `writer.set`. Explicitly picking the
  default is the one place "commit the default" is genuine intent, expressible. The
  sentinel stays in the list once a value is authored, as the "clear back to
  default" (unset) affordance.
-->
<script lang="ts">
	import { syncedLocal } from './synced.svelte.js';

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

	// Local select state synced to `value` (sentinel when unauthored); own-picks
	// stay local, only an external change reconciles back in (see `syncedLocal`).
	const local = syncedLocal(() => value ?? UNSET);
</script>

<select
	class="qm-select"
	class:ghosted={local.value === UNSET}
	value={local.value}
	aria-label={label}
	data-testid={testid}
	onchange={(e) => {
		local.value = (e.currentTarget as HTMLSelectElement).value;
		// Sentinel → unset (parent `removeField`, default renders); any real pick
		// (incl. the default value) → a genuine write.
		onCommit(local.value === UNSET ? undefined : local.value);
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
		padding: var(--_qm-space) var(--_qm-space-2);
		border: 1px solid var(--qm-border, #d4d4d4);
		border-radius: var(--_qm-radius-inner);
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
