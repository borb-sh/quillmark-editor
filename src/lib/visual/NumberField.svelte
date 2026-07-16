<!--
  A `number` / `integer` field → numeric input. `integer` steps by 1 and parses
  as int; `number` allows decimals (fixture `font_size` = 11.5). Commits the
  parsed value on change; a blank or NaN entry commits nothing (the field falls
  back to its `default:` at render).
-->
<script lang="ts">
	import { untrack } from 'svelte';

	interface Props {
		value: number | undefined;
		integer?: boolean;
		fallback?: number;
		onCommit: (v: number) => void;
		testid?: string;
	}
	let { value, integer, fallback, onCommit, testid }: Props = $props();

	// svelte-ignore state_referenced_locally
	let local = $state(value != null ? String(value) : '');
	$effect(() => {
		const incoming = value != null ? String(value) : '';
		untrack(() => {
			if (incoming !== local) local = incoming;
		});
	});

	function commit(raw: string): void {
		local = raw;
		if (raw.trim() === '') return;
		const n = integer ? parseInt(raw, 10) : parseFloat(raw);
		if (!Number.isNaN(n)) onCommit(n);
	}
</script>

<!-- One-way `value` (a string) — NOT `bind:value`, which coerces to a number. -->
<input
	class="qm-input"
	type="number"
	step={integer ? '1' : 'any'}
	value={local}
	placeholder={fallback != null ? String(fallback) : ''}
	data-testid={testid}
	oninput={(e) => commit((e.currentTarget as HTMLInputElement).value)}
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
