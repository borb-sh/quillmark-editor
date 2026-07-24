<!--
  An `array` field → an add/remove repeater. Elements commit by VALUE: every
  edit / add / remove rebuilds the whole array and hands it to the parent's typed
  `writer.set(field, wholeArray)` (arrays are not op-addressed). Element control
  by `items.type`: `string` → text input, `richtext` → a prose element
  ({@link ProseArrayElement}), `object` → a minimal JSON editor (no
  array-of-object field exists in the fixture — implemented minimally, UNTESTED).
  The add affordance sits in the label header row (space-between with the field
  label); {@link Field} skips its own label for array controls.

  No reorder: an array's order is fixed at declaration/entry order. Elements
  carry a parallel session-id list so add/remove splices keyed editors rather
  than remounting the tail; the ids only ever grow or shrink, never permute.
-->
<script lang="ts">
	import type { Content, QuillFieldSchema } from '../core/index.js';
	import { emptyContent } from '../core/codec/index.js';
	import { IdSeq, elementControl } from './structure.js';
	import TextField from './TextField.svelte';
	import ProseArrayElement from './ProseArrayElement.svelte';

	interface Props {
		value: unknown[] | undefined;
		items: QuillFieldSchema | undefined;
		/** Accessible-name prefix for the element controls (`label` + 1-based index). */
		label?: string;
		onCommit: (arr: unknown[]) => void;
		/** A prose element gained focus — joins the field in the focus federation. */
		onFocusEl?: () => void;
		testid?: string;
	}
	let { value, items, label, onCommit, onFocusEl, testid }: Props = $props();

	const control = $derived(elementControl(items));
	const plaintext = $derived(items?.type === 'plaintext');
	const arr = $derived((value ?? []) as unknown[]);

	// Parallel stable ids, one per element, kept in lockstep with the data below.
	// Seeded eagerly so a non-empty array renders its rows on the FIRST pass —
	// an effect-only seed mounts every element editor in a second render.
	const seq = new IdSeq();
	// svelte-ignore state_referenced_locally
	let ids = $state<string[]>(Array.from({ length: (value ?? []).length }, () => seq.next()));
	// Length reconcile (defend against an out-of-band length change);
	// order is maintained by the mutators, not here.
	$effect(() => {
		const n = arr.length;
		if (ids.length === n) return;
		if (ids.length < n) ids = [...ids, ...Array.from({ length: n - ids.length }, () => seq.next())];
		else ids = ids.slice(0, n);
	});

	function emptyElement(): unknown {
		if (control === 'prose') return emptyContent();
		if (control === 'object') return {};
		return '';
	}

	function commitElement(k: number, next: unknown): void {
		const copy = arr.slice();
		// A cleared element control commits `undefined` (the unset rung), but an
		// array slot is positional — an array defaults as a whole (`[]`), no
		// per-element `default:` to fall back to. Keep the slot as the type's empty
		// element, not an array hole.
		copy[k] = next === undefined ? emptyElement() : next;
		onCommit(copy);
	}
	function add(): void {
		ids = [...ids, seq.next()];
		onCommit([...arr, emptyElement()]);
	}
	function remove(k: number): void {
		ids = ids.filter((_, i) => i !== k);
		onCommit(arr.filter((_, i) => i !== k));
	}
</script>

<div class="qm-array" data-testid={testid}>
	<div class="qm-array-header">
		{#if label != null}
			<span class="qm-field-label">{label}</span>
		{:else}
			<span></span>
		{/if}
		<button
			type="button"
			class="qm-add-el"
			data-testid={testid ? `${testid}-add` : undefined}
			onclick={add}>+ Add</button
		>
	</div>
	{#each ids as id, k (id)}
		<div class="qm-array-row">
			{#if control === 'prose'}
				<ProseArrayElement
					value={(arr[k] ?? emptyElement()) as Content}
					{plaintext}
					label={label != null ? `${label} ${k + 1}` : undefined}
					onChange={(rt) => commitElement(k, rt)}
					{onFocusEl}
					testid={testid ? `${testid}-el-${k}` : undefined}
				/>
			{:else if control === 'object'}
				<textarea
					class="qm-input qm-json"
					aria-label={label != null ? `${label} ${k + 1}` : undefined}
					data-testid={testid ? `${testid}-el-${k}` : undefined}
					value={JSON.stringify(arr[k] ?? {})}
					onchange={(e) => {
						try {
							commitElement(k, JSON.parse((e.currentTarget as HTMLTextAreaElement).value));
						} catch {
							/* keep prior value on invalid JSON */
						}
					}}
				></textarea>
			{:else}
				<div class="qm-array-input">
					<TextField
						value={String(arr[k] ?? '')}
						label={label != null ? `${label} ${k + 1}` : undefined}
						onCommit={(v) => commitElement(k, v)}
						testid={testid ? `${testid}-el-${k}` : undefined}
					/>
				</div>
			{/if}
			<button
				type="button"
				class="qm-mini qm-remove"
				title="Remove"
				data-testid={testid ? `${testid}-remove-${k}` : undefined}
				onclick={() => remove(k)}>✕</button
			>
		</div>
	{/each}
</div>

<style>
	.qm-array {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.qm-array-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}
	.qm-field-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--qm-label, #555);
	}
	.qm-array-row {
		display: flex;
		align-items: flex-start;
		gap: 0.3rem;
	}
	.qm-array-input {
		flex: 1;
	}
	.qm-mini {
		border: 1px solid var(--qm-border, #d4d4d4);
		background: var(--qm-field-bg, #fff);
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.7rem;
		line-height: 1;
		padding: 0.15rem 0.3rem;
	}
	.qm-mini:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.qm-remove {
		align-self: center;
	}
	.qm-json {
		width: 100%;
		box-sizing: border-box;
		font-family: ui-monospace, monospace;
		min-height: 2.5rem;
	}
	/* Themed focus ring in place of the raw UA outline (SURFACES §Focus). */
	.qm-json:focus-visible {
		outline: 2px solid var(--qm-focus-ring, #2563eb);
		outline-offset: 1px;
	}
	.qm-add-el {
		border: 1px dashed var(--qm-border, #b8b8b8);
		background: transparent;
		border-radius: 4px;
		cursor: pointer;
		padding: 0.2rem 0.6rem;
		font-size: 0.85rem;
	}
</style>
