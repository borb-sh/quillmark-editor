<!--
 An `array` field → an add/remove repeater. Elements commit by VALUE: every
 edit / add / remove rebuilds the whole array and hands it to the parent's typed
 `writer.set(field, wholeArray)` (arrays are not op-addressed). Element control
 by `items.type`: `string` → text input, `richtext` → a prose element
 ({@link ProseArrayElement}), `object` → a minimal JSON editor, keeping the prior
 element value on an entry that does not parse. The add affordance sits in the
 label header row (space-between with the field label); {@link Field} skips its
 own label for array controls and hands this component the label track with it.

 A row ends in the reserved action column (`--action-col`), which the field insets
 and this reaches back across: the element controls stop where a scalar's does and
 the remove sits beyond them, on the right edge the field's track keeps.

 Keys carry the list without the mouse: Enter inserts a
 sibling below and takes the caret there, Backspace on an EMPTY element removes it
 and hands focus back up the list.

 No reorder: an array's order is fixed at declaration/entry order. Elements
 carry a parallel session-id list, spliced with the values as one operation at
 whatever index a mutation names; so an element holds its id for life and the
 surviving order never permutes, which is what lets a keyed prose element survive an
 insert or a remove ABOVE it rather than remounting.
-->
<script lang="ts">
	import { wording } from './strings.js';

	// The surface's words, ambient from the editor root; the package's English
	// off-tree, so this component renders standalone too.
	const t = wording();
	import { onDestroy, tick } from 'svelte';
	import type { Content, QuillFieldSchema } from '@quillmark/wasm';
	import { emptyContent } from '../core/codec/index.js';
	import { createLifespan } from '../core/teardown.js';
	import { IdSeq, controlKind } from './structure.js';
	import Icon from './icons/Icon.svelte';
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
		/** Schema `description`: the label's help affordance. */
		description?: string;
		/** The label's own DOM id. An array is a GROUP (N inputs, no single `for`
		 * target) so the label names the set and each element keeps its indexed
		 * `aria-label`. */
		labelId?: string;
		/** Where the description parks, for the group's `aria-describedby`. */
		descriptionId?: string;
		onCommit: (arr: unknown[]) => void;
	}
	let { value, items, label, required, description, labelId, descriptionId, onCommit }: Props =
		$props();

	// The ELEMENT control is the item schema's own; an array declaring no `items`
	// has text elements.
	const control = $derived(items ? controlKind(items) : 'text');
	const plaintext = $derived(items?.type === 'plaintext');
	const arr = $derived((value ?? []) as unknown[]);

	// Parallel stable ids, one per element, kept in lockstep with the data below.
	// Seeded eagerly so a non-empty array renders its rows on the FIRST pass:
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
	// text element and a prose element disagree on what focusing is: the difference
	// is stated on `ProseArrayElement.focus`, which owns it.
	//
	// Every path that drops an id deletes its entry: `bind:this` teardown nulls the
	// VALUE on unmount and leaves the key, so a card that outlives its elements
	// accumulates one dead key per element ever created.
	//
	// `$state` for the BINDING's sake, not this component's: nothing here reads `els`
	// reactively (every read is inside an event handler or a post-flush focus hop), but
	// `bind:this` into a property of a plain object is a write Svelte cannot track, and
	// it says so once per element per render. Thirteen lines on one memo's first paint,
	// in the console a consumer is reading to find its own defects. Same shape
	// {@link Card} keeps its header/panel refs in.
	const els: Record<string, { focus: () => void } | undefined> = $state({});
	let addEl: HTMLButtonElement | undefined = $state();
	let rootEl: HTMLElement | undefined = $state();

	// The awaited flush below is the only work that outlives a gesture here, so the
	// span carries no cancellers: it is the liveness `focusAfterFlush` asks for.
	const span = createLifespan();
	onDestroy(() => span.end());

	function emptyElement(): unknown {
		if (control === 'prose') return emptyContent();
		if (control === 'object') return {};
		return '';
	}

	function commitElement(k: number, next: unknown): void {
		const copy = arr.slice();
		// A cleared element control commits `undefined` (the unset rung), but an
		// array slot is positional: an array defaults as a whole (`[]`), no
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
		// key does: the button under the pointer is part of what it destroys.
		focusAfterFlush(next[Math.max(k - 1, 0)]);
	}
	/** Take the caret: the FIRST element, or the add affordance when the list is empty;
	 * which is then the only thing there is to land on, and the next thing the user
	 * wants anyway. Reached by a label click and by the editor's landing verbs, which
	 * ask one function so they cannot disagree (`Field`, `leaves.ts`). */
	export function focus(): void {
		if (ids.length === 0) return void addEl?.focus();
		const first = els[ids[0]];
		if (first) return first.focus();
		// The JSON element registers no controller: it is a plain textarea, with
		// nothing about focusing it that the DOM does not already know.
		rootEl?.querySelector<HTMLTextAreaElement>('.qm-array-row textarea')?.focus();
	}
	/** Take the caret to element `k`: what a landing on an element ADDRESS resolves to
	 * (`leaves.ts`). The index is resolved to the element's session id here, at the
	 * call, never carried as one — an index is stale the moment anything above it
	 * splices. An index past the live list falls back to {@link focus}: the field is
	 * right and the row is gone, which is a compile the document has moved past. */
	export function focusElement(k: number): void {
		const el = els[ids[k]];
		if (el) el.focus();
		else focus();
	}
	/** Focus element `id` after the flush, never in the same tick: a mutation commits
	 * the array BY VALUE, so the parent re-derives and the row does not exist until
	 * then. `undefined` is the empty list: the add affordance.
	 *
	 * The commit that schedules this can also remove the CARD holding the field, which
	 * unmounts this component inside the window (core/teardown.ts). */
	async function focusAfterFlush(id: string | undefined): Promise<void> {
		if (!(await span.resumes(tick()))) return;
		if (id === undefined) addEl?.focus();
		else els[id]?.focus();
	}
	/** Whether element `k` reads empty to the user. A text element's committed value
	 * LAGS the input: a cleared field commits at `change`, not per keystroke
	 * ({@link TextField}); so the input's own value is the truth; a prose element
	 * commits every edit, so the committed `Content` is. */
	function elementEmpty(k: number, target: EventTarget | null): boolean {
		if (control === 'prose') return !(arr[k] as Content | undefined)?.text;
		return target instanceof HTMLInputElement && !target.value;
	}
	/**
	 * The element keyboard contract. Both keys ride the element control's own keydown
	 * (the input's, or the PM view's through `handleDOMEvents`) since neither
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
			// the emptiness test reads the state BEFORE this keystroke applies; so the
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
>
	<div class="qm-array-header">
		{#if label != null}
			<FieldLabel
				{label}
				id={labelId}
				{descriptionId}
				onActivate={focus}
				{required}
				{description}
			/>
		{:else}
			<span></span>
		{/if}
		<button type="button" class="qm-add-el qm-add-affordance" bind:this={addEl} onclick={add}
			>{t.strings.arrayAdd}</button
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
				/>
			{:else if control === 'object'}
				<textarea
					class="qm-input qm-json qm-focus-ring"
					aria-label={label != null ? `${label} ${k + 1}` : undefined}
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
				/>
			{/if}
			<button
				type="button"
				class="qm-icon-btn qm-remove"
				title={t.strings.arrayRemove}
				onclick={() => remove(k)}><Icon name="x" size={14} /></button
			>
		</div>
	{/each}
</div>

<style>
	.qm-array {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space);
		/* The one field that reaches across the reserved action column: its rows END in
		   that column, so an element control stops exactly where the scalar beside it
		   does and the remove never sits over a long value. The reservation is the
		   FIELD's inset (Field.svelte), so this cancels it wherever the field landed:
		   its own row, or one track of a shared one. */
		margin-right: calc(-1 * var(--action-col));
	}
	/* The array's first line IS the row's label line: this component owns the label
	 track (Field.svelte), so the header has to measure what a `.qm-field-label-row`
	 measures or an array shares a row with a scalar and their labels sit apart. The
	 label is the same component; what had to give was the add affordance's height,
	 below. */
	.qm-array-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--_qm-space-2);
	}
	/* The element takes the section's tracks, the remove takes the action column, and
	 the gutter between them is the section's own: the row is that column's only
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
	/* The JSON element is a `.qm-input` (controls.css): box, focus ring, and all;
	 what a textarea adds over an input is the face and a floor on its height. */
	.qm-json {
		font-family: var(--_qm-font-mono);
		min-height: 2.5rem;
	}
	/* Chrome, hover fill and target come from `.qm-add-affordance` (controls.css);
	 what is here is this trigger's own type, box and recede ladder. It rests dim like
	 the card stack's gap triggers and comes up on hover of the FIELD or on focus: one
	 trigger at the head of a row of controls is found by looking at the array, not by
	 grazing its first line.

	 THE BOX IS THE LABEL'S LINE BOX, and the target is the `::after`: the same split
	 the field label's guidance marker takes, for the same reason and one row over.
	 This is the other affordance that sits IN a line of text rather than in a row of
	 its own, and the line is a label's, so a
	 target-sized box would stand the header 8px taller than the `.qm-field-label-row`
	 beside it in a shared row and put the two labels on different lines. So the family's
	 floor comes off the box and goes out of flow, unpainted and centred on it: the row
	 keeps the label's line box, the press keeps the floor. The horizontal edges are the
	 button's own, the word being already wider than the threshold.

	 The type is the LABEL rung in place of the family's body rung, which the family
	 invites (controls.css: a caller whose button carries a label restates the rung it
	 wants). It reads as one more thing on the label line rather than as a control that
	 wandered up from the row below. */
	.qm-add-el {
		position: relative;
		min-height: 0;
		padding: 0 var(--_qm-space);
		font-size: var(--_qm-text-label);
		opacity: var(--_qm-opacity-idle);
	}
	.qm-add-el::after {
		content: '';
		position: absolute;
		inset-inline: 0;
		top: 50%;
		height: var(--_qm-tap-min);
		transform: translateY(-50%);
	}
	.qm-array:hover .qm-add-el,
	.qm-add-el:focus-visible {
		opacity: 1;
	}
	/* Touch has no hover: keep a faint always-on affordance so add stays reachable. */
	@media (hover: none) {
		.qm-add-el {
			opacity: var(--_qm-opacity-muted);
		}
	}
</style>
