<!--
  A `number` / `integer` field → numeric input. `integer` steps by 1 and parses
  as int; `number` allows decimals (fixture `font_size` = 11.5). Commits the
  parsed value on change; a blank entry commits nothing (the field falls back
  to its `default:` at render).

  `type="text"`, not `type="number"` — a native number input SANITIZES an
  invalid string to `""` before the DOM `value` setter even runs (verified:
  `.value = "abc"` on `type="number"` never lands), which would make a
  genuinely bad entry untypeable. Phase 4b's commit-time coercion diagnostic
  (VISUAL_EDITOR §Diagnostics) needs exactly that path reachable through the
  UI, so a non-blank entry that fails to parse forwards the RAW STRING to
  `onCommit` unchanged — the boundary's own `writer.set` coercion is the judge
  (throws a `QuillmarkError` the parent turns into a field diagnostic), not a
  client-side guess. `inputmode` keeps the numeric mobile keyboard.
-->
<script lang="ts">
	import { untrack } from 'svelte';

	interface Props {
		value: number | undefined;
		integer?: boolean;
		fallback?: number;
		onCommit: (v: number | string) => void;
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
		onCommit(Number.isNaN(n) ? raw : n);
	}
</script>

<input
	class="qm-input"
	type="text"
	inputmode={integer ? 'numeric' : 'decimal'}
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
