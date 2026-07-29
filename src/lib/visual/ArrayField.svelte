<!--
  An `array` field → an add/remove repeater. Elements commit by VALUE: every
  edit / add / remove rebuilds the whole array and hands it to the parent's typed
  `writer.set(field, wholeArray)` (arrays are not op-addressed). Element control
  by `items.type`: `string` → text input, `richtext` → a prose element
  ({@link ProseArrayElement}), `object` → a minimal JSON editor (no
  array-of-object field exists in the fixture — implemented minimally, UNTESTED).
  The add affordance sits in the label header row (space-between with the field
  label); {@link Field} skips its own label for array controls.

  A row ends in the section's reserved action column (Card `--action-col`), which the
  field reaches back across: the element controls stop where a scalar's does and the
  remove sits beyond them, on the one right edge the section keeps (SURFACES §Rhythm).

  Keys carry the list without the mouse (VISUAL_EDITOR_UIUX §Fields): Enter inserts a
  sibling below and takes the caret there, Backspace on an EMPTY element removes it
  and hands focus back up the list.

  No reorder: an array's order is fixed at declaration/entry order. Elements
  carry a parallel session-id list, spliced with the values as one operation at
  whatever index a mutation names — so an element holds its id for life and the
  surviving order never permutes, which is what lets a keyed prose element survive an
  insert or a remove ABOVE it rather than remounting.
-->
<script lang="ts">
	import { tick } from 'svelte';
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
		/** No-default field → a persistent required `*` on the label. */
		required?: boolean;
		/** Schema `description` — the label's help affordance. */
		description?: string;
		/** The label's own DOM id. An array is a GROUP — N inputs, no single `for`
		 * target — so the label names the set and each element keeps its indexed
		 * `aria-label`. */
		labelId?: string;
		/** Where the description parks, for the group's `aria-describedby`. */
		descriptionId?: string;
		onCommit: (arr: unknown[]) => void;
		/** A prose element gained focus — joins the field in the focus federation. */
		onFocusEl?: () => void;
		testid?: string;
	}
	let {
		value,
		items,
		label,
		required,
		description,
		labelId,
		descriptionId,
		onCommit,
		onFocusEl,
		testid
	}: Props = $props();

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
		else {
			for (const id of ids.slice(n)) delete els[id];
			ids = ids.slice(0, n);
		}
	});

	// The focus targets, keyed by element ID rather than index: an index goes stale on
	// the splice that focus is chasing. An element control exposes `focus()` because a
	// text element and a prose element disagree on what focusing is — the difference
	// is stated on `ProseArrayElement.focus`, which owns it.
	//
	// Every path that drops an id deletes its entry: `bind:this` teardown nulls the
	// VALUE on unmount and leaves the key, so a card that outlives its elements
	// accumulates one dead key per element ever created.
	const els: Record<string, { focus: () => void } | undefined> = {};
	let addEl: HTMLButtonElement | undefined = $state();
	let rootEl: HTMLElement | undefined = $state();

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
	/** Insert an empty element after `k` (`-1` prepends) and take focus to it. */
	function insertAfter(k: number): void {
		const id = seq.next();
		const at = k + 1;
		ids = [...ids.slice(0, at), id, ...ids.slice(at)];
		const next = arr.slice();
		next.splice(at, 0, emptyElement());
		onCommit(next);
		focusAfterFlush(id);
	}
	function add(): void {
		insertAfter(ids.length - 1);
	}
	function remove(k: number): void {
		const dropped = ids[k];
		const next = ids.filter((_, i) => i !== k);
		ids = next;
		delete els[dropped];
		onCommit(arr.filter((_, i) => i !== k));
		// Focus lands on the element before the removed one, or on the one that slid
		// into its place; on the add affordance once the list is empty, which is then
		// the only thing left to hold it. Clicking the remove needs this as much as the
		// key does — the button under the pointer is part of what it destroys.
		focusAfterFlush(next[Math.max(k - 1, 0)]);
	}
	/** A label click on an array, resolved rather than left to dangle: the FIRST
	 * element, or the add affordance when the list is empty — which is then the only
	 * thing there is to land on, and the next thing the user wants anyway. */
	function activate(): void {
		if (ids.length === 0) return void addEl?.focus();
		const first = els[ids[0]];
		if (first) return first.focus();
		// The JSON element registers no controller — it is a plain textarea, with
		// nothing about focusing it that the DOM does not already know.
		rootEl?.querySelector<HTMLTextAreaElement>('.qm-array-row textarea')?.focus();
	}
	/** Focus element `id` after the flush, never in the same tick: a mutation commits
	 * the array BY VALUE, so the parent re-derives and the row does not exist until
	 * then. `undefined` is the empty list — the add affordance. */
	async function focusAfterFlush(id: string | undefined): Promise<void> {
		await tick();
		if (id === undefined) addEl?.focus();
		else els[id]?.focus();
	}
	/** Whether element `k` reads empty to the user. A text element's committed value
	 * LAGS the input — a cleared field commits at `change`, not per keystroke
	 * ({@link TextField}) — so the input's own value is the truth; a prose element
	 * commits every edit, so the committed `Content` is. */
	function elementEmpty(k: number, target: EventTarget | null): boolean {
		if (control === 'prose') return !(arr[k] as Content | undefined)?.text;
		return target instanceof HTMLInputElement && !target.value;
	}
	/**
	 * The element keyboard contract. Both keys ride the element control's own keydown
	 * — the input's, or the PM view's through `handleDOMEvents` — since neither
	 * surface is a place a keymap of this component's could sit. The JSON element is
	 * out: Enter is a newline in a textarea.
	 */
	function onElementKey(e: KeyboardEvent, k: number): void {
		if (control === 'object' || e.isComposing) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			insertAfter(k);
		} else if (e.key === 'Backspace' && !e.repeat && elementEmpty(k, e.target)) {
			// Destructive with nothing to undo it, so it takes a deliberate press:
			// `repeat` is a held key running on past the character it just cleared, and
			// the emptiness test reads the state BEFORE this keystroke applies — so the
			// press that empties an element never also removes it.
			e.preventDefault();
			remove(k);
		}
	}
</script>

<div
	bind:this={rootEl}
	class="qm-array"
	role="group"
	aria-labelledby={label != null ? labelId : undefined}
	aria-describedby={description ? descriptionId : undefined}
	data-testid={testid}
>
	<div class="qm-array-header">
		{#if label != null}
			<FieldLabel
				{label}
				id={labelId}
				{descriptionId}
				onActivate={activate}
				{required}
				{description}
				{testid}
			/>
		{:else}
			<span></span>
		{/if}
		<button
			type="button"
			class="qm-add-el qm-add-affordance"
			data-testid={testid ? `${testid}-add` : undefined}
			bind:this={addEl}
			onclick={add}>+ Add</button
		>
	</div>
	{#each ids as id, k (id)}
		<div class="qm-array-row">
			{#if control === 'prose'}
				<ProseArrayElement
					bind:this={els[id]}
					value={(arr[k] ?? emptyElement()) as Content}
					{plaintext}
					label={label != null ? `${label} ${k + 1}` : undefined}
					onChange={(rt) => commitElement(k, rt)}
					onKey={(e) => onElementKey(e, k)}
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
				<TextField
					bind:this={els[id]}
					value={String(arr[k] ?? '')}
					label={label != null ? `${label} ${k + 1}` : undefined}
					onCommit={(v) => commitElement(k, v)}
					onKey={(e) => onElementKey(e, k)}
					testid={testid ? `${testid}-el-${k}` : undefined}
				/>
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
		/* The one field that reaches across the section's reserved action column: its
		   rows END in that column, so an element control stops exactly where the scalar
		   above it does and the remove never sits over a long value. */
		margin-right: calc(-1 * var(--action-col));
	}
	.qm-array-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--_qm-space-2);
	}
	/* The element takes the section's tracks, the remove takes the action column, and
	   the gutter between them is the section's own — the row is that column's only
	   occupant, so it reads as one more column of the grid rather than a nested layout.
	   `minmax(0, …)` because an element control must be allowed to be narrower than its
	   content: a long unbroken value grows the track otherwise, and the edge with it. */
	.qm-array-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) var(--_qm-tap-min);
		column-gap: var(--_qm-space-2);
		align-items: start;
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
	   what is here is this trigger's own inset and recede ladder — the sole foot add
	   rests dim, like the card stack's LAST
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
