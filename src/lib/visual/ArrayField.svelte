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
	import { IdSeq, controlKind } from './structure.js';
	import X from '@lucide/svelte/icons/x';
	import TextField from './TextField.svelte';
	import ProseArrayElement from './ProseArrayElement.svelte';
	import FieldLabel from './FieldLabel.svelte';
	import './controls.css';

	interface Props {
		value: unknown[] | undefined;
		items: QuillFieldSchema | undefined;
		/** Accessible-name prefix for the element controls (`label` + 1-based index). */
		label?: string;
		/** No-default field → a persistent required `*` on the label (issue #75a). */
		required?: boolean;
		/** Schema `description` — the label's help affordance (issue #75b). */
		description?: string;
		onCommit: (arr: unknown[]) => void;
		/** A prose element gained focus — joins the field in the focus federation. */
		onFocusEl?: () => void;
		testid?: string;
	}
	let { value, items, label, required, description, onCommit, onFocusEl, testid }: Props = $props();

	// The ELEMENT control is the item schema's own; an array declaring no `items`
	// has text elements.
	const control = $derived(items ? controlKind(items) : 'text');
	const plaintext = $derived(items?.type === 'plaintext');
	const arr = $derived((value ?? []) as unknown[]);

	// Parallel stable ids, one per element, kept in lockstep with the data below.
	// Seeded eagerly so a non-empty array renders its rows on the FIRST pass —
	// an effect-only seed mounts every element editor in a second render.
	const seq = new IdSeq();
	// svelte-ignore state_referenced_locally
	let ids = $state<string[]>(seq.take((value ?? []).length));
	// Length reconcile (defend against an out-of-band length change);
	// order is maintained by the mutators, not here.
	$effect(() => {
		const n = arr.length;
		if (ids.length === n) return;
		if (ids.length < n) ids = [...ids, ...seq.take(n - ids.length)];
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
			<FieldLabel {label} {required} {description} {testid} />
		{:else}
			<span></span>
		{/if}
		<button
			type="button"
			class="qm-add-el qm-add-affordance"
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
					class="qm-input qm-json qm-focus-ring"
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
				class="qm-icon-btn qm-remove"
				title="Remove"
				data-testid={testid ? `${testid}-remove-${k}` : undefined}
				onclick={() => remove(k)}><X size={14} /></button
			>
		</div>
	{/each}
</div>

<style>
	.qm-array {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space);
	}
	.qm-array-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--_qm-space-2);
	}
	.qm-array-row {
		display: flex;
		align-items: flex-start;
		gap: var(--_qm-space);
	}
	.qm-array-input {
		flex: 1;
	}
	.qm-remove {
		align-self: center;
	}
	/* The JSON element is a `.qm-input` (controls.css) — box, focus ring, and all;
	   what a textarea adds over an input is the face and a floor on its height. */
	.qm-json {
		font-family: var(--_qm-font-mono);
		min-height: 2.5rem;
	}
	/* Chrome, hover fill and target come from `.qm-add-affordance` (controls.css);
	   what is here is this trigger's own inset and recede ladder
	   (issue #58 §6) — the sole foot add rests dim, like the card stack's LAST
	   trigger, and surfaces on hover of the field or on focus. */
	.qm-add-el {
		padding: var(--_qm-space) var(--_qm-space-2);
		opacity: var(--_qm-opacity-idle);
	}
	.qm-array:hover .qm-add-el,
	.qm-add-el:focus-visible {
		opacity: 1;
	}
	/* Touch has no hover — keep a faint always-on affordance so add stays reachable. */
	@media (hover: none) {
		.qm-add-el {
			opacity: var(--_qm-opacity-muted);
		}
	}
</style>
