<!--
  One card block (VISUAL_EDITOR_UIUX §"Card stack"): the header (composable cards
  only — an inline-editable title over a full-width rename region, and the reorder/
  delete controls), the grouped field list packed by `ui.group`/`ui.compact`, and
  the body prose leaf. `main` is headerless with no controls. Every prose leaf
  takes a parent-built LIVE address so a card reorder re-targets its commits
  without a remount.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { Document, Addr, Diagnostic } from '../core/index.js';
	import type { FieldController } from '../core/codec/index.js';
	import type { CardModel, FieldModel } from './structure.js';
	import { packRows, humanize, initialExpandedGroup } from './structure.js';
	import Field from './Field.svelte';
	import FieldLabel from './FieldLabel.svelte';
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
		/** Consumer enum-option policy for a field (issue #73); true when no hook set. */
		enumAllowed: (field: string, value: string) => boolean;
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

	// Inline-editable title (issue #58 §8): select-all on entry so a title reads as
	// text you replace, and Enter/Escape as commit/revert. Rename stays LIVE on
	// input — `titleAtFocus` is the pre-edit value Escape rolls back to.
	let titleAtFocus = '';
	function onTitleFocus(e: FocusEvent): void {
		titleAtFocus = localTitle;
		(e.currentTarget as HTMLInputElement).select();
	}
	// A mouse press on an UNFOCUSED title would place a caret on mouseup, collapsing
	// the focus-time select-all. Take focus manually and suppress that caret so a
	// click-to-enter selects all too; a press while already focused stays normal, so
	// clicking mid-title to place the caret still works.
	function onTitleMousedown(e: MouseEvent): void {
		const el = e.currentTarget as HTMLInputElement;
		if (document.activeElement !== el) {
			e.preventDefault();
			el.focus();
		}
	}
	// The rename region extends the title's hit area to the header's free width (issue
	// #123). A press on that empty space focuses the input — which selects all, the
	// same click-to-enter the title itself gets — and preventDefault keeps the press
	// from starting a text selection on the wrapper. A press ON the input is left to
	// `onTitleMousedown`, which owns the already-focused caret-placement case.
	function onRenameMousedown(e: MouseEvent): void {
		const input = (e.currentTarget as HTMLElement).querySelector('input');
		if (!input || e.target === input) return;
		e.preventDefault();
		input.focus();
	}
	function onTitleKeydown(e: KeyboardEvent): void {
		const el = e.currentTarget as HTMLInputElement;
		if (e.key === 'Enter') {
			e.preventDefault();
			el.blur(); // commit — the live value already persisted on input
		} else if (e.key === 'Escape') {
			e.preventDefault();
			if (localTitle !== titleAtFocus) {
				localTitle = titleAtFocus;
				ops.rename(titleAtFocus); // roll back the live edits
			}
			el.blur();
		}
	}

	// Group accordion (issue #60). Ungrouped fields (`group == null`) render above,
	// always visible; grouped sections collapse into a one-open-at-a-time accordion.
	const ungrouped = $derived(card.sections.filter((s) => s.group == null));
	const grouped = $derived(card.sections.filter((s) => s.group != null));

	// Ephemeral session state — the open group's id (`null` = all collapsed). Seeded
	// ONCE from the card's shape (structure.initialExpandedGroup); Card is keyed by
	// stable id, so this survives the VisualEditor re-derive that reassigns `card`
	// and resets only on a remount (reload). It is NOT reconciled to later section
	// changes — a retype is the one reshape, and it reads fine to keep the user's
	// open group where it still exists.
	// svelte-ignore state_referenced_locally
	let expanded = $state<string | null>(initialExpandedGroup(card.sections, card.hasBody));
	/** Toggle a group: open it (closing any other), or collapse it if already open. */
	function toggleGroup(group: string): void {
		expanded = expanded === group ? null : group;
	}

	/**
	 * Open the group holding leaf `key`, if this card has one. A collapsed panel is
	 * clipped to zero height rather than unmounted, so a caret placed inside it — and
	 * the arrival wash with it — lands where nobody can see it. `VisualEditor.setCaret`
	 * calls this on every card before landing; the card keeps owning `expanded`, and a
	 * card that does not hold the key does nothing.
	 *
	 * A call, not a prop: a reveal is an event, and modelling it as state needs a
	 * fresh-identity wrapper to re-fire and an `untrack` to keep the per-keystroke
	 * re-derive from reopening the accordion under the user.
	 */
	export function revealLeaf(key: string): void {
		const section = grouped.find((s) => s.fields.some((f) => ops.leafKey(f.name) === key));
		if (section?.group) expanded = section.group;
	}

	let el = $state<HTMLElement | undefined>(undefined);
	/**
	 * Bring this card into view after the structure mutation that placed it (issue
	 * #123) — `center` for an insert, `nearest` for a reorder that only needs to stay
	 * on screen. `scrollIntoView` walks to its own scroll ancestor, so this is
	 * indifferent to whether the package or the consumer owns the scroll container.
	 *
	 * The reduced-motion guard is JS rather than the CSS the accordion uses: a
	 * scroll's behaviour is an argument, not a transition a media query can cancel.
	 */
	export function scrollIntoViewCard(block: ScrollLogicalPosition): void {
		const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
		el?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block });
	}
</script>

<section
	bind:this={el}
	class="qm-card"
	class:qm-main={card.isMain}
	class:qm-active={active}
	class:qm-unschemable={card.unschemable}
>
	{#if card.unschemable}
		{@render recoveryShell()}
	{:else}
		{#if !card.isMain}
			<header class="qm-card-header">
				<!-- The rename target is the header's whole free width, not the title's text
			     box (issue #123). The autosize keeps that box exactly as wide as its
			     text; this wrapper makes the rest of the row enter the edit too. -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="qm-card-rename"
					data-testid={`card-rename-${index}`}
					onmousedown={onRenameMousedown}
				>
					<!-- Autosize: the sizer span's ::after mirrors the text and dictates the grid
				     cell width, so the overlaid input grows with content and reads as text,
				     not a persistent box (issue #58 §8). `data-value` falls back to the
				     placeholder so an empty title still reserves its resolved-title width. -->
					<span class="qm-card-title-sizer" data-value={localTitle || card.titlePlaceholder}>
						<input
							class="qm-card-title"
							value={localTitle}
							placeholder={card.titlePlaceholder}
							aria-label="Card title"
							size="1"
							data-testid={`card-title-${index}`}
							onmousedown={onTitleMousedown}
							onfocus={onTitleFocus}
							onkeydown={onTitleKeydown}
							oninput={(e) => {
								localTitle = (e.currentTarget as HTMLInputElement).value;
								ops.rename(localTitle);
							}}
						/>
					</span>
				</div>
				<div class="qm-card-header-right">
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
			<!-- Ungrouped fields render above the accordion, always visible (issue #60):
		     a label-less section has no header to toggle, and these read as the card's
		     primary fields. -->
			{#each ungrouped as section (section.group ?? '_ungrouped')}
				<div class="qm-section">
					{#each packRows(section.fields) as row, ri (ri)}
						{@render fieldRow(row)}
					{/each}
				</div>
			{/each}

			<!-- Group accordion (issue #60): each `ui.group` is a collapsible section,
		     one open at a time. The header toggles; the panel slides via a
		     0fr↔1fr grid row (the `slow` duration rung). The sections share ONE wrapper
		     with no gap of its own: each header's symmetric padding is the whole
		     inter-group rhythm, so a label sits equidistant from the rule above it and
		     its own (issue #118). The card body's gap still separates this block from
		     the ungrouped fields and the body leaf. -->
			<div class="qm-groups">
				{#each grouped as section (section.group)}
					{@const isOpen = expanded === section.group}
					<div class="qm-group" class:qm-open={isOpen}>
						<button
							type="button"
							class="qm-group-header"
							aria-expanded={isOpen}
							data-testid={`group-${base}-${section.group}`}
							onclick={() => toggleGroup(section.group as string)}
						>
							<ChevronRight class="qm-group-chevron" size={14} />
							<span class="qm-group-label">{section.label}</span>
						</button>
						<div class="qm-group-panel">
							<div class="qm-group-panel-inner">
								{#each packRows(section.fields) as row, ri (ri)}
									{@render fieldRow(row)}
								{/each}
							</div>
						</div>
					</div>
				{/each}
			</div>

			{#if card.hasBody}
				<div class="qm-body-leaf">
					<FieldLabel label="Body" />
					<ProseField
						{doc}
						addr={ops.makeAddr(undefined)}
						label="Body"
						placeholder={card.bodyGhost}
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
	{/if}
</section>

<!-- One packed row of fields — shared by the ungrouped block and the accordion
     panels so both render a group's fields identically (issue #60). -->
{#snippet fieldRow(row: FieldModel[])}
	<div class="qm-row" class:packed={row.length > 1}>
		{#each row as f (f.name)}
			<Field
				field={f}
				value={card.values[f.name]}
				provenance={card.provenance[f.name]}
				{doc}
				proseAddr={ops.makeAddr(f.name)}
				leafKey={ops.leafKey(f.name)}
				onCommitScalar={(v) => ops.commit(f.name, v)}
				optionAllowed={(v) => ops.enumAllowed(f.name, v)}
				{onFocus}
				{onCaretMove}
				{register}
				{unregister}
				diagnostics={ops.diagFor(f.name)}
				testid={`${base}-${f.name}`}
			/>
		{/each}
	</div>
{/snippet}

<!-- Recovery shell for an un-schemable card (issue #72): a card whose `kind` has no
     schema (foreign kind, or a schema declaring no `card_kinds`). It stays VISIBLE and
     REMOVABLE — its fields/body/`$ext` remain in the Document — so it is never a data
     trap. Retyping to a declared kind projects it against that kind on the next
     derive — `setCardKind` swaps the kind and leaves payload and body untouched, so
     no field is dropped; with no kinds to offer, delete is the only exit. -->
{#snippet recoveryShell()}
	<header class="qm-card-header">
		<span class="qm-card-title-static" data-testid={`card-unschemable-title-${index}`}
			>{humanize(card.kind)}</span
		>
		<div class="qm-card-header-right">
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
	<div class="qm-card-recovery" data-testid={`card-recovery-${index}`}>
		<p class="qm-recovery-note">
			Unrecognized card type <code>{card.kind}</code>. Its content is preserved.
		</p>
		{#if kinds.length}
			<label class="qm-recovery-retype">
				Change to
				<select
					data-testid={`recovery-retype-${index}`}
					onchange={(e) => {
						const el = e.currentTarget as HTMLSelectElement;
						if (el.value) ops.retype(el.value);
					}}
				>
					<option value="" disabled selected>Choose a type…</option>
					{@render kindOptions()}
				</select>
			</label>
		{:else}
			<p class="qm-recovery-note qm-recovery-muted">
				This document declares no card types — delete this card to remove it.
			</p>
		{/if}
	</div>
{/snippet}

<!-- The declared card kinds as `<option>`s for the recovery shell's retype (issue #72),
     the one place a card's kind changes after insert. -->
{#snippet kindOptions()}
	{#each kinds as k (k)}
		<option value={k}>{humanize(k)}</option>
	{/each}
{/snippet}

<style>
	.qm-card {
		border: 1px solid var(--_qm-border);
		border-radius: var(--_qm-radius);
		/* Uniform inset on every side (SURFACES §Rhythm) — a body-shown and a
		   body-hidden card stay symmetric, every left edge on one gutter. */
		padding: var(--_qm-space-4);
		background: var(--_qm-surface-raised);
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-3);
	}
	.qm-card.qm-main {
		background: var(--_qm-surface);
	}
	.qm-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--_qm-space-2);
	}
	.qm-card-header-right {
		display: flex;
		align-items: center;
		gap: var(--_qm-space-2);
	}
	/* Reveal the reorder chevrons on hover or while active (CardControls owns the
	   default hidden state). */
	.qm-card:hover :global(.qm-card-reorder),
	.qm-card.qm-active :global(.qm-card-reorder) {
		opacity: 1;
	}
	/* The rename hit region (issue #123): the header's free width, full height, so a
	   press anywhere left of the controls enters the title edit. `min-width: 0` lets
	   it shrink past the title's intrinsic width; `align-self: stretch` beats the
	   header's `align-items: center` so the region is the row's whole height rather
	   than the input's. */
	.qm-card-rename {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		display: flex;
		align-items: center;
		cursor: text;
	}
	/* Autosize sizer (issue #58 §8): an inline-grid whose ::after mirrors the text
	   into the single cell, so the overlaid input tracks its content width. Bounded
	   to the rename region's width (`min-width: 0` + `max-width: 100%`), which the
	   header's space-between keeps clear of the controls. The input inherits the type
	   tokens (`font: inherit`) so the mirror and the input measure alike. */
	.qm-card-title-sizer {
		display: inline-grid;
		align-items: center;
		min-width: 0;
		max-width: 100%;
		font-size: var(--_qm-text-title);
		font-weight: var(--_qm-weight-label);
		font-family: inherit;
	}
	.qm-card-title-sizer::after {
		content: attr(data-value) ' ';
		grid-area: 1 / 1;
		visibility: hidden;
		white-space: pre;
		min-width: 2ch;
		/* Match the input's box model so the mirror and the input measure alike. */
		padding: var(--_qm-space);
		border: 1px solid transparent;
	}
	.qm-card-title {
		grid-area: 1 / 1;
		width: 100%;
		min-width: 0;
		font: inherit;
		border: 1px solid transparent;
		border-radius: var(--_qm-radius-inner);
		padding: var(--_qm-space);
		background: transparent;
	}
	.qm-card-title:hover,
	.qm-card-title:focus {
		border-color: var(--_qm-border);
		background: var(--_qm-surface);
		outline: none;
	}
	.qm-card-body {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-3);
	}
	.qm-section {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
	}
	/* Group accordion (issue #60, VISUAL_EDITOR_UIUX §Fields). The header is a toggle
	   at the field-label rung; the panel slides via a 0fr↔1fr grid row so the height
	   animates without a magic max-height. */
	/* The wrapper carries NO gap: the headers' own padding is the rhythm (see the
	   markup note). */
	.qm-groups,
	.qm-group {
		display: flex;
		flex-direction: column;
	}
	/* Symmetric padding: the label is equidistant from the rule above it and the one
	   it draws, and the box is the whole row — no dead strip outside it, ambiguous
	   about which section it belongs to. WCAG 2.5.8's 24x24 is the floor. */
	.qm-group-header {
		display: flex;
		align-items: center;
		gap: var(--_qm-space);
		width: 100%;
		border: none;
		background: transparent;
		padding: var(--_qm-space-2) 0;
		cursor: pointer;
		color: var(--_qm-ink-meta);
		border-bottom: 1px solid var(--_qm-border);
		text-align: left;
		transition: color var(--_qm-duration-fast) ease;
	}
	/* Sentence case at the field-label rung — a section name is structurally a
	   heading, and uppercase costs it twice: the word shape a column of them is
	   scanned by, and apparent width, so a long label crowds sooner. The rung is
	   reused rather than a fifth size minted. */
	.qm-group-label {
		font-size: var(--_qm-text-label);
		font-weight: var(--_qm-weight-soft);
	}
	.qm-group-header :global(.qm-group-chevron) {
		flex-shrink: 0;
		transition: transform var(--_qm-duration-slow) ease;
	}
	/* Open and hover are both an ink step, not a hue: an expanded section is not a
	   status, and AESTHETIC §Rules keeps the three status hues as the only exits from
	   the greyscale. The chevron's rotation already says open. Hover had no cue at
	   all, which a bigger borderless target needs more than a small one did. */
	.qm-group.qm-open .qm-group-header,
	.qm-group-header:hover {
		color: var(--_qm-ink);
	}
	.qm-group.qm-open .qm-group-header :global(.qm-group-chevron) {
		transform: rotate(90deg);
	}
	/* Sliding panel: the grid track goes 0fr→1fr; the inner clips at min-height 0.
	   An open panel gains an accent left rule. */
	.qm-group-panel {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows var(--_qm-duration-slow) ease;
	}
	.qm-group.qm-open .qm-group-panel {
		grid-template-rows: 1fr;
	}
	.qm-group-panel-inner {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
		min-height: 0;
		overflow: hidden;
		/* Zero when closed, so the inset arrives with the panel: a `0fr` track collapses
		   the CONTENT, not the padding, and a top inset declared here stands under a
		   closed header as dead space the header's symmetric padding cannot absorb. */
		padding: 0;
		border-left: 2px solid transparent;
		transition:
			padding var(--_qm-duration-slow) ease,
			border-color var(--_qm-duration-slow) ease;
	}
	.qm-group.qm-open .qm-group-panel-inner {
		padding: var(--_qm-space-2) 0 0 var(--_qm-space-3);
		border-left-color: var(--_qm-accent);
	}
	@media (prefers-reduced-motion: reduce) {
		.qm-group-panel,
		.qm-group-panel-inner,
		.qm-group-header,
		.qm-group-header :global(.qm-group-chevron) {
			transition: none;
		}
	}
	.qm-row {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
	}
	.qm-row.packed {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: flex-start;
	}
	.qm-body-leaf {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space);
	}
	/* Recovery shell (issue #72): a receding, dashed-edge card marking an un-schemable
	   card — visibly distinct from a normal card, but not alarming; the content behind
	   it is intact. */
	.qm-card.qm-unschemable {
		border-style: dashed;
		background: var(--_qm-surface-raised);
	}
	.qm-card-title-static {
		font-size: var(--_qm-text-title);
		font-weight: var(--_qm-weight-label);
		color: var(--_qm-ink-label);
	}
	.qm-card-recovery {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
	}
	.qm-recovery-note {
		margin: 0;
		font-size: var(--_qm-text-label);
		color: var(--_qm-ink-label);
	}
	.qm-recovery-note code {
		font-family: var(--_qm-font-mono);
	}
	.qm-recovery-muted {
		color: var(--_qm-ink-ghost);
	}
	.qm-recovery-retype {
		display: inline-flex;
		align-items: center;
		gap: var(--_qm-space-2);
		font-size: var(--_qm-text-label);
		color: var(--_qm-ink-label);
	}
	.qm-recovery-retype select {
		font: inherit;
		border: 1px solid var(--_qm-border);
		border-radius: var(--_qm-radius-inner);
		background: var(--_qm-surface);
		padding: var(--_qm-space-half) var(--_qm-space-2);
	}
</style>
