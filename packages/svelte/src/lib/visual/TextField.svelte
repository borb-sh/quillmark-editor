<!--
 A `string` field → text input. Commits a non-empty edit live (on input) via the
 parent's typed `writer.set`, so the preview tracks typing. A cleared field is the
 unset rung of the commitment ladder (VISUAL_EDITOR §"Structure mirrors the schema"): it
 commits `undefined` (the parent removes the field, ghosted `default:` renders):
 but at `change` (blur), not per keystroke, so select-all-and-retype doesn't flash
 the field through its default between the delete and the first typed char.
 Trade-off (recorded in VISUAL_EDITOR): an explicit empty string over a non-empty
 default is inexpressible from the UI: clear and unset collapse to one gesture.
-->
<script lang="ts">
	import { syncedLocal } from './synced.svelte.js';
	import './controls.css';

	interface Props {
		value: string | undefined;
		placeholder?: string;
		/** Accessible name for an input nothing else names: an array element, whose
		 * name is the field label plus its 1-based index. A field's own input takes
		 * `id` instead and is named by the `<label for>` beside it. */
		label?: string;
		/** `<label for>` target. Set → the label names this input, so `aria-label`
		 * comes off: two names is where implementations disagree about which wins. */
		id?: string;
		/** The parked `description` (FieldLabel): announced after the name. */
		describedBy?: string;
		onCommit: (v: string | undefined) => void;
		/** Raw keydown, for a container whose own keys run through this control: the
		 * array repeater's Enter/Backspace (`ArrayField`). */
		onKey?: (e: KeyboardEvent) => void;
	}
	let { value, placeholder, label, id, describedBy, onCommit, onKey }: Props = $props();

	// Local input state synced to `value`: own-typing stays local, only an external
	// change reconciles back in (see `syncedLocal`).
	const local = syncedLocal(() => value ?? '');

	let inputEl: HTMLInputElement | undefined = $state();
	/** Take the caret: what a parent placing focus on this control calls. */
	export function focus(): void {
		inputEl?.focus();
	}
</script>

<input
	bind:this={inputEl}
	class="qm-input qm-focus-ring"
	type="text"
	value={local.value}
	{id}
	{placeholder}
	aria-label={id ? undefined : label}
	aria-describedby={describedBy}
	onkeydown={onKey}
	oninput={(e) => {
		local.value = (e.currentTarget as HTMLInputElement).value;
		// Live-commit a non-empty edit; defer a cleared field to `change` (see header).
		if (local.value !== '') onCommit(local.value);
	}}
	onchange={() => {
		if (local.value === '') onCommit(undefined);
	}}
/>
