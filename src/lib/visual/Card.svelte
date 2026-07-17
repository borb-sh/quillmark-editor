<!--
  One card block (VISUAL_EDITOR_UIUX §"Card stack"): the header (composable cards
  only — an inline-editable title, a degenerate retype selector, and the reorder/
  delete controls), the grouped field list packed by `ui.group`/`ui.compact`, and
  the body prose leaf. `main` is headerless with no controls. Every prose leaf
  takes a parent-built LIVE address so a card reorder re-targets its commits
  without a remount.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import type { Document, Addr, Diagnostic } from '../core/index.js';
	import type { FieldController } from '../core/codec/index.js';
	import type { CardModel, FieldModel } from './structure.js';
	import { packRows, humanize } from './structure.js';
	import Field from './Field.svelte';
	import ProseField from './ProseField.svelte';
	import CardControls from './CardControls.svelte';
	import DiagnosticList from './DiagnosticList.svelte';

	/** The per-card operation bundle the VisualEditor builds (all resolve id→index lazily). */
	interface CardOps {
		makeAddr: (field?: string) => Addr;
		leafKey: (field?: string) => string;
		commit: (name: string, value: unknown) => void;
		move: (dir: -1 | 1) => void;
		remove: () => void;
		retype: (kind: string) => void;
		rename: (title: string) => void;
		diagFor: (field?: string) => Diagnostic[] | undefined;
	}

	interface Props {
		card: CardModel;
		doc: Document;
		index: number;
		isFirst: boolean;
		isLast: boolean;
		active: boolean;
		kinds: string[];
		ops: CardOps;
		onFocus?: (addr: Addr) => void;
		onCaretMove?: (addr: Addr, pos: number) => void;
		register?: (key: string, controller: FieldController) => void;
		unregister?: (key: string) => void;
	}
	let {
		card,
		doc,
		index,
		isFirst,
		isLast,
		active,
		kinds,
		ops,
		onFocus,
		onCaretMove,
		register,
		unregister
	}: Props = $props();

	const base = $derived(card.isMain ? 'main' : `card${index}`);

	// Local title reconcile (external change only), like the scalar controls.
	// svelte-ignore state_referenced_locally
	let localTitle = $state(card.titleOverride);
	$effect(() => {
		const incoming = card.titleOverride;
		untrack(() => {
			if (incoming !== localTitle) localTitle = incoming;
		});
	});
</script>

<section class="qm-card" class:qm-main={card.isMain} class:qm-active={active}>
	{#if !card.isMain}
		<header class="qm-card-header">
			<input
				class="qm-card-title"
				value={localTitle}
				placeholder={card.titlePlaceholder}
				aria-label="Card title"
				data-testid={`card-title-${index}`}
				oninput={(e) => {
					localTitle = (e.currentTarget as HTMLInputElement).value;
					ops.rename(localTitle);
				}}
			/>
			<div class="qm-card-header-right">
				{#if kinds.length > 1}
					<select
						class="qm-retype"
						value={card.kind}
						data-testid={`card-retype-${index}`}
						onchange={(e) => ops.retype((e.currentTarget as HTMLSelectElement).value)}
					>
						{#each kinds as k (k)}
							<option value={k}>{humanize(k)}</option>
						{/each}
					</select>
				{:else}
					<!-- Degenerate retype (one declared kind): still wired to setCardKind. -->
					<button
						type="button"
						class="qm-retype-btn"
						title="Retype card"
						data-testid={`card-retype-${index}`}
						onclick={() => ops.retype(card.kind)}>{humanize(card.kind)}</button
					>
				{/if}
				<CardControls
					{isFirst}
					{isLast}
					onMoveUp={() => ops.move(-1)}
					onMoveDown={() => ops.move(1)}
					onDelete={() => ops.remove()}
					testidPrefix={`card-${index}`}
				/>
			</div>
		</header>
	{/if}

	<div class="qm-card-body">
		{#each card.sections as section (section.group ?? '_ungrouped')}
			<div class="qm-section">
				{#if section.label}
					<div class="qm-section-label">{section.label}</div>
				{/if}
				{#each packRows(section.fields) as row, ri (ri)}
					<div class="qm-row" class:packed={row.length > 1}>
						{#each row as f (f.name)}
							<Field
								field={f}
								value={card.values[f.name]}
								{doc}
								proseAddr={ops.makeAddr(f.name)}
								leafKey={ops.leafKey(f.name)}
								onCommitScalar={(v) => ops.commit(f.name, v)}
								{onFocus}
								{onCaretMove}
								{register}
								{unregister}
								diagnostics={ops.diagFor(f.name)}
								testid={`${base}-${f.name}`}
							/>
						{/each}
					</div>
				{/each}
			</div>
		{/each}

		{#if card.hasBody}
			<div class="qm-body-leaf">
				<span class="qm-field-label">Body</span>
				<ProseField
					{doc}
					addr={ops.makeAddr(undefined)}
					label="Body"
					leafKey={ops.leafKey(undefined)}
					{onFocus}
					{onCaretMove}
					{register}
					{unregister}
					testid={`prose-${base}-body`}
				/>
				<DiagnosticList diagnostics={ops.diagFor(undefined)} testid={`diag-${base}-body`} />
			</div>
		{/if}
	</div>
</section>

<style>
	.qm-card {
		border: 1px solid var(--qm-border, #e2e2e2);
		border-radius: 8px;
		padding: 0.85rem 1rem;
		background: var(--qm-card-bg, #fafafa);
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.qm-card.qm-main {
		background: var(--qm-main-bg, #fff);
	}
	.qm-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
	}
	.qm-card-header-right {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	/* Reveal the reorder chevrons on hover or while active (CardControls owns the
	   default hidden state). */
	.qm-card:hover :global(.qm-card-reorder),
	.qm-card.qm-active :global(.qm-card-reorder) {
		opacity: 1;
	}
	.qm-card-title {
		flex: 1;
		font-size: 1rem;
		font-weight: 600;
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 0.2rem 0.35rem;
		background: transparent;
		font-family: inherit;
	}
	.qm-card-title:hover,
	.qm-card-title:focus {
		border-color: var(--qm-border, #d4d4d4);
		background: #fff;
		outline: none;
	}
	.qm-retype,
	.qm-retype-btn {
		font-size: 0.72rem;
		border: 1px solid var(--qm-border, #d4d4d4);
		border-radius: 4px;
		background: var(--qm-field-bg, #fff);
		padding: 0.18rem 0.4rem;
		cursor: pointer;
		color: #555;
	}
	.qm-card-body {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
	}
	.qm-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.qm-section-label {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--qm-section-label, #8a8a8a);
		border-bottom: 1px solid var(--qm-border, #ececec);
		padding-bottom: 0.15rem;
	}
	.qm-row {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.qm-row.packed {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: flex-start;
	}
	.qm-body-leaf {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.qm-field-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--qm-label, #555);
	}
</style>
