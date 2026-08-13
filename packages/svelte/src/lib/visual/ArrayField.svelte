<!--
 An `array` field → an add/remove repeater. Elements commit by value: every
 edit / add / remove rebuilds the whole array and hands it to the parent's typed
 `writer.set(field, wholeArray)` (arrays are not op-addressed). Element control
 by `items.type`: `string` / `plaintext` → text input, `richtext` → a prose element
 ({@link ProseArrayElement}), `object` → a minimal JSON editor, keeping the prior
 element value on an entry that does not parse. The add affordance sits in the
 label header row (space-between with the field label); {@link Field} skips its
 own label for array controls and hands this component the label track with it.

 The remove is inside the element: a slab over the end of the element's own box, taking
 its two end-side corners. So a row's box is the element's box, and an array's rows end
 where every other field's control does.

 Keys carry the list without the mouse: Enter inserts a
 sibling below and takes the caret there, Backspace on an empty element removes it
 and hands focus back up the list.

 No reorder: an array's order is fixed at declaration/entry order. Elements
 carry a parallel session-id list, spliced with the values as one operation at
 whatever index a mutation names; so an element holds its id for life and the
 surviving order never permutes, which is what lets a keyed prose element survive an
 insert or a remove above it rather than remounting.
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
		/** The label's own DOM id. An array is a group (N inputs, no single `for`
		 * target) so the label names the set and each element keeps its indexed
		 * `aria-label`. */
		labelId?: string;
		/** Where the description parks, for the group's `aria-describedby`. */
		descriptionId?: string;
		onCommit: (arr: unknown[]) => void;
	}
	let { value, items, label, required, description, labelId, descriptionId, onCommit }: Props =
		$props();

	// The element control is the item schema's own, with one departure: a `plaintext`
	// element is a text input where the scalar field of that type is a prose leaf. A
	// `plaintext` value rests as its literal string (canon SCHEMAS.md §"Content fields
	// rest per codec"), and the read that decodes a resting value to `Content` addresses
	// a field, never an element (`getContent`; borb-sh/quillmark#1243), so a string is
	// what the row is handed and a string is what it commits. The prose element stays
	// the `richtext` arm: `Content` after a bound load or a commit, the authored
	// string through the transport door, lowered in the row for the same reason.
	//
	// An array declaring no `items` has text elements.
	const control = $derived(items && items.type !== 'plaintext' ? controlKind(items) : 'text');
	const arr = $derived((value ?? []) as unknown[]);

	// Parallel stable ids, one per element, kept in lockstep with the data below.
	// Seeded eagerly so a non-empty array renders its rows on the first pass:
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
	// value on unmount and leaves the key, so a card that outlives its elements
	// accumulates one dead key per element ever created.
	//
	// `$state` for the binding's sake, not this component's: nothing here reads `els`
	// reactively (every read is inside an event handler or a post-flush focus hop), but
	// `bind:this` into a property of a plain object is a write Svelte cannot track, and
	// it says so once per element per render. Thirteen lines on one memo's first paint,
	// in the console a consumer is reading to find its own defects. Same shape
	// {@link Card} keeps its header/panel refs in.
	const els: Record<string, { focus: () => void } | undefined> = $state({});
	let addEl: HTMLButtonElement | undefined = $state();
	let rootEl: HTMLElement | undefined = $state();
	let rowsEl: HTMLElement | undefined = $state();

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
	/** Take the caret: the first element, or the add affordance when the list is empty;
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
	/** The box an arrival wash blooms in (`leaves.ts`, `core/bloom.ts`): the elements,
	 * not the header above them. This component owns the field's label, so the wrapper
	 * `Field` blooms every other control inside would wash the label here too. Empty,
	 * the box is `display: none` and the landing is answered by the focus the add
	 * affordance takes. */
	export function washBox(): HTMLElement | undefined {
		return rowsEl;
	}
	/** Take the caret to element `k`: what a landing on an element address resolves to
	 * (`leaves.ts`). The index resolves to the element's session id here, at the call,
	 * never carried as one — an index is stale the moment anything above it splices.
	 * Past the live list it falls back to {@link focus}: the field is right and the row
	 * is gone, which is a landing off a compile the document has moved past. */
	export function focusElement(k: number): void {
		const el = els[ids[k]];
		if (el) el.focus();
		else focus();
	}
	/** Focus element `id` after the flush, never in the same tick: a mutation commits
	 * the array by value, so the parent re-derives and the row does not exist until
	 * then. `undefined` is the empty list: the add affordance.
	 *
	 * The commit that schedules this can also remove the card holding the field, which
	 * unmounts this component inside the window (core/teardown.ts). */
	async function focusAfterFlush(id: string | undefined): Promise<void> {
		if (!(await span.resumes(tick()))) return;
		if (id === undefined) addEl?.focus();
		else els[id]?.focus();
	}
	/** Whether element `k` reads empty to the user. A text element's committed value
	 * lags the input: a cleared field commits at `change`, not per keystroke
	 * ({@link TextField}); so the input's own value is the truth. A prose element
	 * commits every edit, so the committed `Content` is; an authored string, the
	 * transport-door rest, is empty when it has no characters. */
	function elementEmpty(k: number, target: EventTarget | null): boolean {
		if (control === 'prose') {
			const el = arr[k];
			if (typeof el === 'string') return el.length === 0;
			return !(el as Content | undefined)?.text;
		}
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
			// the emptiness test reads the state before this keystroke applies; so the
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
		<button
			type="button"
			class="qm-add-el qm-add-affordance qm-tap-floor"
			bind:this={addEl}
			onclick={add}>{t.strings.arrayAdd}</button
		>
	</div>
	<div class="qm-array-rows" class:empty={ids.length === 0} bind:this={rowsEl}>
		{#each ids as id, k (id)}
			<div class="qm-array-row">
				{#if control === 'prose'}
					<ProseArrayElement
						bind:this={els[id]}
						value={(arr[k] ?? emptyElement()) as Content | string}
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
					class="qm-icon-btn qm-remove qm-focus-ring"
					title={t.strings.arrayRemove}
					onclick={() => remove(k)}><Icon name="minus" /></button
				>
			</div>
		{/each}
	</div>
</div>

<style>
	.qm-array {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space);
	}
	/* The array's first line is the row's label line: this component owns the label
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
	/* The elements, in a box of their own: the arrival wash blooms here rather than over
	 the wrapper `Field` hands this component (`washBox`), which is the label's box too.
	 Positioned for the wash's inset child, and rounded to the rung a row's own box
	 draws, the way `.qm-field-control` is for every other control.

	 `display: none` when there are no elements, so the header does not stand a gap above
	 an empty box; a wash over it then paints nothing, which is what an array with
	 nothing in it has to show. */
	.qm-array-rows {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space);
		border-radius: var(--_qm-radius-inner);
	}
	.qm-array-rows.empty {
		display: none;
	}
	/* A grid rather than a block: an `<input>` and a `<textarea>` are inline-level and
	 would sit on a baseline, standing the row a descender taller than the box the slab
	 measures itself against. `minmax(0, …)` because a long unbroken value grows an `auto`
	 track, and the edge with it. */
	.qm-array-row {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1fr);
	}
	/* The end inset the slab stands in, taken off whichever box the element drew:
	 `.qm-input` is the text element and the JSON textarea, `.qm-control-box` the prose
	 one. `:global`, because the box belongs to the child component's markup and the scope
	 class stops at this component's. The longhand beats the family's `padding` shorthand
	 without a specificity fight: this block is unlayered and `controls.css` is not. */
	.qm-array-row :global(.qm-input),
	.qm-array-row :global(.qm-control-box) {
		padding-inline-end: var(--_qm-tap-min);
	}
	/* The box's end wall, floor to ceiling: a height of its own would leave a sliver of
	 well above or below, and the corners it takes are the box's — the end-side pair keeps
	 `.qm-icon-btn`'s radius, which is the same rung the box draws.

	 It comes up on its own row rather than on the field: a destructive control is offered
	 by the row the pointer is on, not by every row at once. Hover is where it says
	 destructive, ink with fill, a tint alone being a wash under a label-toned glyph. */
	.qm-remove {
		position: absolute;
		inset-block: 0;
		inset-inline-end: 0;
		width: var(--_qm-tap-min);
		color: var(--_qm-ink-label);
		opacity: var(--_qm-opacity-idle);
		border-start-start-radius: 0;
		border-end-start-radius: 0;
		transition:
			opacity var(--_qm-duration-fast) var(--_qm-ease-reverse),
			background-color var(--_qm-duration-fast) var(--_qm-ease-reverse),
			color var(--_qm-duration-fast) var(--_qm-ease-reverse);
	}
	.qm-remove :global(svg) {
		width: var(--_qm-glyph-control);
		height: var(--_qm-glyph-control);
	}
	.qm-array-row:hover .qm-remove,
	.qm-array-row:focus-within .qm-remove {
		opacity: 1;
	}
	.qm-remove:hover {
		background: var(--_qm-danger-tint);
		color: var(--_qm-danger);
	}
	/* The JSON element is a `.qm-input` (controls.css): box, focus ring, and all;
	 what a textarea adds over an input is the face and a floor on its height. */
	.qm-json {
		font-family: var(--_qm-font-mono);
		min-height: 2.5rem;
	}
	/* It rests dim and comes up on hover of the field rather than of itself: one trigger
	 at the head of a row of controls is found by looking at the array, not by grazing its
	 first line.

	 The box is the label's line box and the target is `.qm-tap-floor`'s (controls.css): a
	 target-sized box would stand the header 8px taller than the `.qm-field-label-row`
	 beside it in a shared row and put the two labels on different lines.

	 The label rung in place of the family's body rung, which the family invites: it reads
	 as one more thing on the label line rather than as a control from the row below. */
	.qm-add-el {
		padding: 0 var(--_qm-space);
		font-size: var(--_qm-text-label);
		opacity: var(--_qm-opacity-idle);
	}
	.qm-array:hover .qm-add-el,
	.qm-add-el:focus-visible {
		opacity: 1;
	}
	@media (hover: none) {
		.qm-add-el,
		.qm-remove {
			opacity: var(--_qm-opacity-muted);
		}
	}
</style>
