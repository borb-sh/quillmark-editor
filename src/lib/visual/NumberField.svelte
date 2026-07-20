<!--
  A `number` / `integer` field → numeric input (fixture `font_size` = 11.5).
  Commits at `change` (blur/Enter), NOT per keystroke: a partial numeric entry
  (`-`, `1.`, `1e`) is never a document state worth a boundary round-trip, and
  committing it live flashes a coercion diagnostic + `console.error` on every
  intermediate prefix — now announced by `DiagnosticList`'s `role="status"` live
  region (issue #13). A blank entry commits `undefined` — the UNSET rung of the
  commitment ladder: the parent removes the field and the engine renders the
  ghosted `default:` for real (issue #12), instead of the document silently
  keeping its last value. Settling at `change` also keeps select-all-and-retype
  from flashing the preview through the default mid-keystroke.

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
		/** Accessible name — the visual label is a bare span the input can't reference. */
		label?: string;
		onCommit: (v: number | string | undefined) => void;
		testid?: string;
	}
	let { value, integer, fallback, label, onCommit, testid }: Props = $props();

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
		// Blank → `undefined`: the unset rung (parent removes the field, default
		// renders). Any non-blank entry commits at `change` only (see the header).
		if (raw.trim() === '') return void onCommit(undefined);
		// Number(), not parseFloat/parseInt: a prefix parse would silently commit
		// `14.5` for `14.5x` (and truncate `11.9` → 11 on integer fields) instead
		// of letting the boundary judge the full entry.
		const n = Number(raw);
		onCommit(Number.isNaN(n) ? raw : n);
	}
</script>

<input
	class="qm-input"
	type="text"
	inputmode={integer ? 'numeric' : 'decimal'}
	value={local}
	placeholder={fallback != null ? String(fallback) : ''}
	aria-label={label}
	data-testid={testid}
	oninput={(e) => {
		local = (e.currentTarget as HTMLInputElement).value;
	}}
	onchange={(e) => commit((e.currentTarget as HTMLInputElement).value)}
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
