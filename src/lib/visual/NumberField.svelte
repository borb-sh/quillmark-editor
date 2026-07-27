<!--
  A `number` / `integer` field → numeric input (fixture `font_size` = 11.5).
  Commits at `change` (blur/Enter), NOT per keystroke: a partial numeric entry
  (`-`, `1.`, `1e`) is never a document state worth a boundary round-trip, and
  committing it live flashes a coercion diagnostic + `console.error` on every
  intermediate prefix, announced by `DiagnosticList`'s `role="status"` live
  region (issue #13). A blank entry commits `undefined` — the UNSET rung of the
  commitment ladder: the parent removes the field and the engine renders the
  ghosted `default:` (issue #12). Settling at `change` also keeps
  select-all-and-retype from flashing the preview through the default mid-keystroke.

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
	import { syncedLocal } from './synced.svelte.js';
	import './controls.css';

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

	// Local input state synced to `value` (as a string projection); own-typing
	// stays local, only an external change reconciles back in (see `syncedLocal`).
	const local = syncedLocal(() => (value != null ? String(value) : ''));

	// Parse a settled entry and emit it; `local` is owned by `oninput`. Blank →
	// `undefined` (the unset rung — parent removes the field, default renders).
	function commit(raw: string): void {
		if (raw.trim() === '') return void onCommit(undefined);
		// Number(), not parseFloat/parseInt: a prefix parse would silently commit
		// `14.5` for `14.5x` (and truncate `11.9` → 11 on integer fields) instead
		// of letting the boundary judge the full entry.
		const n = Number(raw);
		onCommit(Number.isNaN(n) ? raw : n);
	}
</script>

<input
	class="qm-input qm-focus-ring"
	type="text"
	inputmode={integer ? 'numeric' : 'decimal'}
	value={local.value}
	placeholder={fallback != null ? String(fallback) : ''}
	aria-label={label}
	data-testid={testid}
	oninput={(e) => {
		local.value = (e.currentTarget as HTMLInputElement).value;
	}}
	onchange={(e) => commit((e.currentTarget as HTMLInputElement).value)}
/>
