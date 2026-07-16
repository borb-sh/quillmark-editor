<!--
  An `array` field → a reorderable repeater. Elements commit by VALUE: every
  edit / reorder / add / remove rebuilds the whole array and hands it to the
  parent's typed `writer.set(field, wholeArray)` (arrays are not op-addressed).
  Element control by `items.type`: `string` → text input, `richtext` → a prose
  element ({@link ProseArrayElement}), `object` → a minimal JSON editor (no
  array-of-object field exists in the fixture — implemented minimally, UNTESTED).

  Elements carry a parallel session-id list reordered in lockstep with the data,
  so a reorder MOVES the keyed element editors rather than remounting them.
-->
<script lang="ts">
	import type { RichText, QuillFieldSchema } from '../core/index.js';
	import { IdSeq, elementControl } from './structure.js';
	import TextField from './TextField.svelte';
	import ProseArrayElement from './ProseArrayElement.svelte';

	interface Props {
		value: unknown[] | undefined;
		items: QuillFieldSchema | undefined;
		onCommit: (arr: unknown[]) => void;
		testid?: string;
	}
	let { value, items, onCommit, testid }: Props = $props();

	const control = $derived(elementControl(items));
	const plaintext = $derived(items?.type === 'plaintext');
	const arr = $derived((value ?? []) as unknown[]);

	// Parallel stable ids, one per element, kept in lockstep with the data below.
	const seq = new IdSeq();
	let ids = $state<string[]>([]);
	// Length reconcile (seed + defend against an out-of-band length change);
	// order is maintained by the mutators, not here.
	$effect(() => {
		const n = arr.length;
		if (ids.length === n) return;
		if (ids.length < n) ids = [...ids, ...Array.from({ length: n - ids.length }, () => seq.next())];
		else ids = ids.slice(0, n);
	});

	function emptyElement(): unknown {
		if (control === 'prose') {
			const rt: RichText = {
				text: '',
				lines: [{ containers: [], kind: 'para' }],
				marks: [],
				islands: []
			};
			return rt;
		}
		if (control === 'object') return {};
		return '';
	}

	function commitElement(k: number, next: unknown): void {
		const copy = arr.slice();
		copy[k] = next;
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
	function move(k: number, dir: -1 | 1): void {
		const j = k + dir;
		if (j < 0 || j >= arr.length) return;
		const a = arr.slice();
		[a[k], a[j]] = [a[j], a[k]];
		const w = ids.slice();
		[w[k], w[j]] = [w[j], w[k]];
		ids = w;
		onCommit(a);
	}
</script>

<div class="qm-array" data-testid={testid}>
	{#each ids as id, k (id)}
		<div class="qm-array-row">
			<div class="qm-array-reorder">
				<button
					type="button"
					class="qm-mini"
					title="Move up"
					disabled={k === 0}
					data-testid={testid ? `${testid}-up-${k}` : undefined}
					onclick={() => move(k, -1)}>↑</button
				>
				<button
					type="button"
					class="qm-mini"
					title="Move down"
					disabled={k === arr.length - 1}
					data-testid={testid ? `${testid}-down-${k}` : undefined}
					onclick={() => move(k, 1)}>↓</button
				>
			</div>
			{#if control === 'prose'}
				<ProseArrayElement
					value={(arr[k] ?? emptyElement()) as RichText}
					{plaintext}
					onChange={(rt) => commitElement(k, rt)}
					testid={testid ? `${testid}-el-${k}` : undefined}
				/>
			{:else if control === 'object'}
				<textarea
					class="qm-input qm-json"
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
	<button
		type="button"
		class="qm-add-el"
		data-testid={testid ? `${testid}-add` : undefined}
		onclick={add}>+ Add</button
	>
</div>

<style>
	.qm-array {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.qm-array-row {
		display: flex;
		align-items: flex-start;
		gap: 0.3rem;
	}
	.qm-array-reorder {
		display: flex;
		flex-direction: column;
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
	.qm-add-el {
		align-self: flex-start;
		border: 1px dashed var(--qm-border, #b8b8b8);
		background: transparent;
		border-radius: 4px;
		cursor: pointer;
		padding: 0.2rem 0.6rem;
		font-size: 0.85rem;
	}
</style>
