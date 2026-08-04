<!--
 One card block (VISUAL_EDITOR_UIUX §"Card stack"): the header (composable cards
 only: an inline-editable title over a full-width rename region, and the reorder/
 delete controls), the grouped field list packed by `ui.group`/`ui.compact`, and
 the body prose leaf. `main` is headerless with no controls. Every prose leaf
 takes a parent-built LIVE address so a card reorder re-targets its commits
 without a remount.
-->
<script lang="ts">
	import { wording } from './strings.js';

	// The surface's words, ambient from the editor root; the package's English
	// off-tree, so this component renders standalone too.
	const t = wording();
	import { untrack } from 'svelte';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import type { Document, Quill, Addr, Diagnostic } from '@quillmark/wasm';
	import type { EditorErrorHandler } from '../core/errors.js';
	import type { FieldController } from '../core/codec/index.js';
	import type { CardModel, FieldModel } from './structure.js';
	import { placeFields, humanize, initialExpandedGroup } from './structure.js';
	import type { FieldDomIds } from './domid.js';
	import Field from './Field.svelte';
	import ProseField from './ProseField.svelte';
	import CardControls from './CardControls.svelte';
	import DiagnosticList from './DiagnosticList.svelte';

	/** The per-card operation bundle the VisualEditor builds (all resolve id→index lazily). */
	interface CardOps {
		makeAddr: (field?: string) => Addr;
		leafKey: (field?: string) => string;
		domIds: (field?: string) => FieldDomIds;
		panelId: (group: string) => string;
		commit: (name: string, value: unknown) => void;
		move: (dir: -1 | 1) => void;
		remove: () => void;
		retype: (kind: string) => void;
		rename: (title: string) => void;
		diagFor: (field?: string) => Diagnostic[] | undefined;
		/** Consumer enum-option policy for a field; true when no hook set. */
		enumAllowed: (field: string, value: string) => boolean;
	}

	interface Props {
		card: CardModel;
		doc: Document;
		/** The schema a prose leaf reads its content through (`ProseField`). */
		quill: Quill;
		index: number;
		isFirst: boolean;
		isLast: boolean;
		kinds: string[];
		ops: CardOps;
		onFocus?: (addr: Addr) => void;
		onCaretMove?: (addr: Addr, pos: number) => void;
		onChange?: (addr: Addr) => void;
		onError?: EditorErrorHandler;
		register?: (key: string, controller: FieldController) => void;
		unregister?: (key: string) => void;
	}
	let {
		card,
		doc,
		quill,
		index,
		isFirst,
		isLast,
		kinds,
		ops,
		onFocus,
		onCaretMove,
		onChange,
		onError,
		register,
		unregister
	}: Props = $props();

	// Local title reconcile (external change only), like the scalar controls.
	// svelte-ignore state_referenced_locally
	let localTitle = $state(card.titleOverride);
	$effect(() => {
		const incoming = card.titleOverride;
		untrack(() => {
			if (incoming !== localTitle) localTitle = incoming;
		});
	});

	// Inline-editable title: select-all on entry so a title reads as
	// text you replace, and Enter/Escape as commit/revert. Rename stays LIVE on
	// input: `titleAtFocus` is the pre-edit value Escape rolls back to.
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
	// The rename region extends the title's hit area to the header's free width.
	// A press on that empty space focuses the input (which selects all, the
	// same click-to-enter the title itself gets) and preventDefault keeps the press
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
			el.blur(); // commit: the live value already persisted on input
		} else if (e.key === 'Escape') {
			e.preventDefault();
			if (localTitle !== titleAtFocus) {
				localTitle = titleAtFocus;
				ops.rename(titleAtFocus); // roll back the live edits
			}
			el.blur();
		}
	}

	// Group accordion. Ungrouped fields (`group == null`) render above,
	// always visible; grouped sections collapse into a one-open-at-a-time accordion.
	const ungrouped = $derived(card.sections.filter((s) => s.group == null));
	const grouped = $derived(card.sections.filter((s) => s.group != null));

	// Whether there is a metadata block to bracket at all. A schema that
	// declares no fields still gets a body (`bodyEnabled` defaults true), and a bracket
	// around nothing is worse than none: with no content between them the two
	// horizontals land on one y and paint as a stroke of twice the width, which is the
	// one thing a figure claiming one width cannot do.
	const hasMeta = $derived(ungrouped.length > 0 || grouped.length > 0);

	// Ephemeral session state: the open group's id (`null` = all collapsed). Seeded
	// ONCE from the card's shape (structure.initialExpandedGroup); Card is keyed by
	// stable id, so this survives the VisualEditor re-derive that reassigns `card`
	// and resets only on a remount (reload). Not reconciled to later section changes:
	// a retype is the one reshape, and the open group stays where it still exists.
	// svelte-ignore state_referenced_locally
	let expanded = $state<string | null>(initialExpandedGroup(card.sections));
	// The accordion's two elements per group, by group id. A closing panel goes
	// `inert` with whatever it held still focused, and `inert` does not say where
	// focus should go: the browser drops it on the body, losing the user's place in
	// the card. So the close hands focus to the header, which is what reopens the
	// section.
	let headers = $state<Record<string, HTMLButtonElement | undefined>>({});
	let panels = $state<Record<string, HTMLElement | undefined>>({});
	/**
	 * Move to `next` (`null` = all closed), evacuating focus from the group this
	 * closes. Every write to `expanded` goes through here: a group also closes when
	 * ANOTHER opens, which is not a gesture the user aimed at the closing section.
	 */
	function setExpanded(next: string | null): void {
		const closing = expanded;
		if (closing !== null && closing !== next && panels[closing]?.contains(document.activeElement))
			headers[closing]?.focus();
		expanded = next;
	}
	function toggleGroup(group: string): void {
		setExpanded(expanded === group ? null : group);
	}

	/**
	 * Open the group holding leaf `key`, if this card has one. A collapsed panel is
	 * clipped to zero height and `inert` rather than unmounted, so a caret placed
	 * inside it does not land at all and the arrival wash goes unseen.
	 * `VisualEditor.setCaret` calls this on every card and then waits a flush before
	 * landing: `inert` clears when the panel renders open, not when `expanded` is
	 * assigned. The card keeps owning `expanded`, and a card that does not hold the
	 * key does nothing.
	 *
	 * A call, not a prop: a reveal is an event, and modelling it as state needs a
	 * fresh-identity wrapper to re-fire and an `untrack` to keep the per-keystroke
	 * re-derive from reopening the accordion under the user.
	 */
	export function revealLeaf(key: string): void {
		const section = grouped.find((s) => s.fields.some((f) => ops.leafKey(f.name) === key));
		if (section?.group) setExpanded(section.group);
	}

	let el = $state<HTMLElement | undefined>(undefined);
	/**
	 * Bring this card into view after the structure mutation that placed it:
	 * `center` for an insert, `nearest` for a reorder that only needs to stay
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

<!-- `qm-main` is a structural marker and carries no fill: a tone here would bet on
     what the consumer put behind the column, and structure already says which card
     this is (SURFACES §Elevation). -->
<section
	bind:this={el}
	class="qm-card"
	class:qm-main={card.isMain}
	class:qm-unschemable={card.unschemable}
>
	{#if card.unschemable}
		{@render recoveryShell()}
	{:else}
		{#if !card.isMain}
			<header class="qm-card-header">
				<!-- The rename target is the header's whole free width, not the title's text
			     box. The autosize keeps that box exactly as wide as its
			     text; this wrapper makes the rest of the row enter the edit too. -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="qm-card-rename" onmousedown={onRenameMousedown}>
					<!-- Autosize: the sizer span's ::after mirrors the text and dictates the grid
				     cell width, so the overlaid input grows with content and reads as text,
				     not a persistent box. `data-value` falls back to the
				     placeholder so an empty title still reserves its resolved-title width. -->
					<span class="qm-card-title-sizer" data-value={localTitle || card.titlePlaceholder}>
						<!-- `qm-focus-ring` is what the box used to do: it was this control's ONLY
					     focus indicator, and the ink step that replaced it cannot be one, since
					     hover already takes that step. `:focus-visible`, so a press enters the
					     edit unringed while a tab into it draws one. -->
						<input
							class="qm-card-title qm-focus-ring"
							value={localTitle}
							placeholder={card.titlePlaceholder}
							aria-label={t.strings.cardTitle}
							size="1"
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
					/>
				</div>
			</header>
		{/if}

		<div class="qm-card-body">
			<!-- The metadata block, and the thing the bracket brackets: every
		 field the card has, ungrouped and grouped alike, inside one element whose
		 top and bottom EDGES are the bracket's two horizontals. Anchoring them here
		 rather than on the header and on the accordion is what lets an open
		 section's vertical actually reach them: a rule drawn in the card body's
		 gap instead would stand clear of where that vertical stops, and the corner
		 it exists to close would miss. It also survives the shapes the accordion
		 does not have: a card with no groups still terminates above its body,
		 because the rule belongs to the fields, not to the sections.

		 Rendered only when there ARE fields: the bracket is a statement about a
		 block, so with no block there is nothing to say, and an empty wrapper
		 between two rules is what collapses them onto each other. -->
			{#if hasMeta}
				<div
					class="qm-card-meta"
					class:qm-meta-top={!card.isMain}
					class:qm-meta-bottom={card.hasBody}
				>
					<!-- Ungrouped fields render above the accordion, always visible:
			     a label-less section has no header to toggle, and these read as the card's
			     primary fields. -->
					{#each ungrouped as section (section.group ?? '_ungrouped')}
						<div class="qm-section">
							{@render sectionFields(section.fields)}
						</div>
					{/each}

					<!-- Group accordion: each `ui.group` is a collapsible section,
			     one open at a time. The header toggles; the panel slides via a
			     0fr↔1fr grid row (the `slow` duration rung). The sections share ONE wrapper
			     with no gap of its own: each header's symmetric padding is the whole
			     inter-group rhythm. The card body's gap still separates this
			     block from the ungrouped fields and the body leaf.

			     Rendered only when a card HAS groups, so an empty accordion is not the
			     bracket's last child: the bottom rule's inset belongs to whichever block
			     actually abuts it, and a zero-height wrapper standing there would take it
			     from the ungrouped fields that do. -->
					{#if grouped.length}
						<div class="qm-groups">
							{#each grouped as section (section.group)}
								{@const group = section.group as string}
								{@const isOpen = expanded === group}
								{@const panelId = ops.panelId(group)}
								<div class="qm-group" class:qm-open={isOpen}>
									<button
										type="button"
										class="qm-group-header"
										bind:this={headers[group]}
										aria-expanded={isOpen}
										aria-controls={panelId}
										onclick={() => toggleGroup(group)}
									>
										<ChevronRight class="qm-group-chevron" size={14} />{section.label}
									</button>
									<!-- `inert` is what makes closed mean CLOSED (SURFACES §"Focus and active
								     state"): the panel is clipped, not unmounted, so without it every field
								     in a hidden section keeps its place in the tab order and in the a11y
								     tree, under a header announcing `aria-expanded="false"`. Paint is
								     untouched, so the 0fr↔1fr slide is the same slide. -->
									<div
										class="qm-group-panel"
										id={panelId}
										inert={!isOpen}
										bind:this={panels[group]}
									>
										<div class="qm-group-panel-inner">
											{@render sectionFields(section.fields)}
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- The body: no label and no box. "Body" names the surface the
		 card is printed on, which is the redundancy AESTHETIC §"Strip redundancy"
		 cuts; and the accessible name survives on the leaf itself, so the region
		 is still announced. Unframed is the point rather than a saving: the body is
		 the ONLY surface in the card without an edge, which is what makes it read
		 as paper instead of as one more field, and the bracket's bottom rule
		 already does the separating a box was doing. -->
			{#if card.hasBody}
				<div class="qm-body-leaf">
					<ProseField
						{doc}
						{quill}
						addr={ops.makeAddr(undefined)}
						unframed
						label="Body"
						placeholder={card.bodyGhost}
						leafKey={ops.leafKey(undefined)}
						{onFocus}
						{onCaretMove}
						{onChange}
						{onError}
						{register}
						{unregister}
					/>
					<DiagnosticList diagnostics={ops.diagFor(undefined)} />
				</div>
			{/if}
		</div>
	{/if}
</section>

<!-- A section's fields as ONE grid: shared by the ungrouped block and the accordion
 panels so both render a group's fields identically. Rows are the
 grid's business: fields carry a span and auto-place, so nothing here re-derives
 structure on resize and a prose leaf's key never moves. -->
{#snippet sectionFields(fields: FieldModel[])}
	<div class="qm-fields">
		{#each placeFields(fields) as { field: f, span } (f.name)}
			<Field
				field={f}
				{span}
				value={card.values[f.name]}
				provenance={card.provenance[f.name]}
				{doc}
				{quill}
				proseAddr={ops.makeAddr(f.name)}
				leafKey={ops.leafKey(f.name)}
				domIds={ops.domIds(f.name)}
				onCommitScalar={(v) => ops.commit(f.name, v)}
				optionAllowed={(v) => ops.enumAllowed(f.name, v)}
				{onFocus}
				{onCaretMove}
				{onChange}
				{onError}
				{register}
				{unregister}
				diagnostics={ops.diagFor(f.name)}
			/>
		{/each}
	</div>
{/snippet}

<!-- Recovery shell for an un-schemable card: a card whose `kind` has no
 schema (foreign kind, or a schema declaring no `card_kinds`). It stays VISIBLE and
 REMOVABLE (its fields/body/`$ext` remain in the Document) so it is never a data
 trap. Retyping to a declared kind projects it against that kind on the next
 derive: `setCardKind` swaps the kind and leaves payload and body untouched, so
 no field is dropped; with no kinds to offer, delete is the only exit. -->
{#snippet recoveryShell()}
	<header class="qm-card-header">
		<span class="qm-card-title-static">{humanize(card.kind)}</span>
		<div class="qm-card-header-right">
			<CardControls
				{isFirst}
				{isLast}
				onMoveUp={() => ops.move(-1)}
				onMoveDown={() => ops.move(1)}
				onDelete={() => ops.remove()}
			/>
		</div>
	</header>
	<div class="qm-card-recovery">
		<p class="qm-recovery-note">
			{t.strings.unknownKind(card.kind)}
		</p>
		{#if kinds.length}
			<label class="qm-recovery-retype">
				{t.strings.retypeLabel}
				<select
					onchange={(e) => {
						const el = e.currentTarget as HTMLSelectElement;
						if (el.value) ops.retype(el.value);
					}}
				>
					<option value="" disabled selected>{t.strings.retypePlaceholder}</option>
					{@render kindOptions()}
				</select>
			</label>
		{:else}
			<p class="qm-recovery-note qm-recovery-muted">
				{t.strings.noCardKinds}
			</p>
		{/if}
	</div>
{/snippet}

<!-- The declared card kinds as `<option>`s for the recovery shell's retype,
     the one place a card's kind changes after insert. -->
{#snippet kindOptions()}
	{#each kinds as k (k)}
		<option value={k}>{humanize(k)}</option>
	{/each}
{/snippet}

<style>
	.qm-card {
		border: var(--_qm-border-width) solid var(--_qm-border);
		border-radius: var(--_qm-radius);
		/* Uniform inset on every side (SURFACES §Rhythm): a body-shown and a
		 body-hidden card stay symmetric, every left edge on one gutter. The SAME rung
		 as the gap between the card's stacked regions below: the card's inset and its
		 internal rhythm are one number, so what separates the header from the fields is
		 what separates the fields from the card's edge. */
		padding: var(--_qm-space-3);
		background: var(--_qm-surface-raised);
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-3);
	}
	.qm-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--_qm-space-2);
	}
	/* The header's other end, hung so the row is balanced: the title's ink sits on the
	 card's gutter, and this puts the control glyphs on the opposite one. What stands
	 between a glyph and the region's edge is the tap target's own centring — half the
	 difference between `--_qm-tap-min` and the glyph — which is a target, not a
	 rhythm, and so is exactly what a gutter should not be measured from. Both ends
	 therefore hang by the chrome they carry and by nothing else; the title's is now
	 zero, and this one is the arithmetic of two rungs rather than a rung of its own,
	 because the amount is off the space scale (5px at the shipped dials) and a scale
	 that could express it would be a scale with a step nothing else uses.

	 It is the fill, not the box, that overhangs the gutter here: an icon button rests
	 unboxed and fills only under the pointer (SURFACES §"The shared recipe"), so the
	 thing crossing the line is a transient target wash, not an edge the card claims. */
	.qm-card-header-right {
		display: flex;
		align-items: center;
		gap: var(--_qm-space-2);
		margin-right: calc(-1 * (var(--_qm-tap-min) - var(--_qm-glyph-control)) / 2);
	}
	/* Reveal the reorder chevrons while the pointer or the caret is in the card
	 (CardControls owns the default hidden state). Focus is read off the CARD, so a
	 caret in any leaf, the title, or a chevron itself holds the reveal: hover
	 alone would strand the pair on keyboard and touch (SURFACES §"Focus and active
	 state"). This is the card's whole active treatment; nothing marks the section
	 itself. */
	.qm-card:hover :global(.qm-card-reorder),
	.qm-card:focus-within :global(.qm-card-reorder) {
		opacity: 1;
	}
	/* The rename hit region: the header's free width, full height, so a
	 press anywhere left of the controls enters the title edit. `min-width: 0` lets
	 it shrink past the title's intrinsic width; `align-self: stretch` beats the
	 header's `align-items: center` so the region is the row's whole height rather
	 than the input's.

	 It hangs by NOTHING, which is the whole of what the title carrying no box buys:
	 the first character lands on the card's gutter with the field list, the
	 bracket's rules and the body's first character (SURFACES §Rhythm) because
	 nothing stands between the region's edge and the glyph. The stretch is also what
	 keeps the target legal with the padding gone: WCAG 2.5.8's floor is the ROW's,
	 which the controls hold at `--_qm-tap-min`, so the input never carried it. */
	.qm-card-rename {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		display: flex;
		align-items: center;
		cursor: text;
	}
	/* Autosize sizer: an inline-grid whose ::after mirrors the text
	 into the single cell, so the overlaid input tracks its content width. Bounded
	 to the rename region's width (`min-width: 0` + `max-width: 100%`), which the
	 header's space-between keeps clear of the controls. The input inherits the type
	 tokens (`font: inherit`, leading included) so the mirror and the input measure
	 alike; which is why the leading rung is declared here and not on the input. */
	.qm-card-title-sizer {
		display: inline-grid;
		align-items: center;
		min-width: 0;
		max-width: 100%;
		font-size: var(--_qm-text-title);
		font-weight: var(--_qm-weight-label);
		line-height: var(--_qm-leading-tight);
		font-family: inherit;
	}
	/* The mirror has no box model to match, because the input has none: with the
	 padding and the hairline gone from both, the two measure alike by carrying the
	 same nothing. */
	.qm-card-title-sizer::after {
		content: attr(data-value) ' ';
		grid-area: 1 / 1;
		visibility: hidden;
		white-space: pre;
		min-width: 2ch;
	}
	/* The title draws NO box, in any state (AESTHETIC §"Strip redundancy"). A box is
	 what says "type here", and a card title is already the one line of a card that
	 reads as its name; the region's `cursor: text` and the caret that lands on a
	 press say the rest. A hover-summoned box was also the inverse of the recipe every
	 other control follows, where the box rests drawn and hover changes nothing
	 (SURFACES §"The shared recipe"), and it filled to `--_qm-surface` — the page rung,
	 BELOW the card it sits on, so the one hover on this surface that receded instead
	 of lifting.

	 What replaces it is an ink step, the same cue the group header takes for the same
	 reason: a wide borderless target drawing no box has no other way to answer the
	 pointer. Rest is `--_qm-ink-label`, which is where the recovery shell's static
	 title already sits, so the editable title and its unschemable twin finally agree
	 on tone as well as on the three type rungs they share. */
	.qm-card-title {
		grid-area: 1 / 1;
		width: 100%;
		min-width: 0;
		font: inherit;
		/* `font: inherit` does not carry colour: an actual form control, unlike this
		 rule's neighbours, defaults to the UA's own text colour rather than the
		 header's ink without this line. */
		color: var(--_qm-ink-label);
		border: none;
		padding: 0;
		background: transparent;
		transition: color var(--_qm-duration-fast) var(--_qm-ease-reverse);
	}
	.qm-card-title:hover,
	.qm-card-title:focus {
		color: var(--_qm-ink);
	}
	/* One rhythm for the card's stacked regions and for the metadata block inside it:
	   the gap between a field list and the body is the gap between two field lists. */
	.qm-card-body,
	.qm-card-meta {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-3);
	}
	/* The metadata bracket: the card's chrome brackets its metadata, and
	 the body is what falls outside it. Three strokes at ONE rung: the two
	 horizontals here and the open section's vertical below; because a bracket whose
	 sides disagree on width or tone reads as three unrelated lines rather than as
	 one figure. That sameness is the whole effect; it is why the vertical takes
	 `--_qm-border` and not `--_qm-accent`, which under AESTHETIC §Rules would be
	 ornament with the chevron and the header's ink step already saying open.

	 Both horizontals are conditional, and each condition is what the stroke means: a
	 top rule is the line under a card title, so the headerless `main` has none and
	 its bracket starts at the card's own top inset; a bottom rule divides fields from
	 body, so a card with no body has nothing to divide. The bracket is therefore
	 sometimes two strokes and sometimes one: an open figure by construction, which
	 is what distinguishes it from the second box SURFACES §Elevation forbids. */
	.qm-meta-top {
		border-top: var(--_qm-border-width) solid var(--_qm-border);
	}
	.qm-meta-bottom {
		border-bottom: var(--_qm-border-width) solid var(--_qm-border);
	}
	/* No inset between a horizontal and the accordion, deliberately: an open section's
	 vertical has to REACH the rule to close a corner against it, and any padding here
	 is the distance by which it would miss. The accordion needs none anyway: a group
	 header's symmetric padding is the whole inter-group rhythm.

	 A block of FIELDS has no padding of its own, so it takes the inset wherever it
	 abuts a rule; three places, since three blocks can: an ungrouped block under the
	 top rule, an ungrouped block over the bottom rule (only reachable because the
	 accordion's `{#if}` keeps an empty wrapper out of last position), and the last
	 section's panel when it is open, whose inset is otherwise zero at the bottom and
	 would stand its final row of controls directly on the stroke. The panel's padding
	 is inside `.qm-group`, so the vertical still runs the full height to the corner.
	 Ungrouped fields always render first, so the top selector needs no qualifier. */
	.qm-meta-top > .qm-section {
		padding-top: var(--_qm-space-3);
	}
	.qm-meta-bottom > .qm-section:last-child,
	.qm-meta-bottom .qm-group:last-child.qm-open .qm-group-panel-inner {
		padding-bottom: var(--_qm-space-3);
	}
	/* The two query containers: an ungrouped section, and a group panel's inner. Each
	 is its own, so capacity follows the width the fields actually get: a panel's
	 inset makes that narrower than the card.

	 The ACTION COLUMN is minted here and spent one level down, on the field
	 (`Field.svelte` holds why it is the field's inset and not this container's). It
	 is declared on the query container because both of its consumers hang off one:
	 the fields inside, and the capacity ramp below, which has to carry the column in
	 its own arithmetic now that the query no longer reads a content box the
	 reservation already narrowed. */
	.qm-section,
	.qm-group-panel-inner {
		--action-col: calc(var(--_qm-tap-min) + var(--_qm-space-2));
		container-type: inline-size;
	}
	/* One grid per section. Capacity is the container's, not JavaScript's:
	 nothing measures, so there is no observer to loop, no pre-measure pass at the
	 wrong capacity, and no re-packing to restructure the DOM under a prose leaf.
	 Fields auto-place, which is what keeps a trailing orphan at its column width
	 instead of growing to fill the line.

	 Capacity steps 1 → 2 → 4, skipping 3: each rung is the width at which a track
	 still clears the comfortable field minimum (2 needs 32rem, 4 needs 65rem), and
	 an even capacity is what lets `lone`'s half land on a track boundary. Each rung
	 pays for a track's own action column as well as the gutters between tracks, since
	 the reservation is per field now: a rung is `n * (220px + action) + gaps`.

	 A row-sharing field spans three implicit row tracks (Field.svelte), so `row-gap`
	 here is the gutter BETWEEN field rows; the tighter one inside a field is the
	 subgrid's own. The grid takes the container's full width; each field insets its
	 own action column inside the track it lands in. */
	.qm-fields {
		--cols: 1;
		--cols-half: 1;
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		column-gap: var(--_qm-space-2);
		row-gap: var(--_qm-space-2);
	}
	@container (min-width: 32rem) {
		.qm-fields {
			--cols: 2;
			--cols-half: 1;
		}
	}
	@container (min-width: 65rem) {
		.qm-fields {
			--cols: 4;
			--cols-half: 2;
		}
	}
	/* Group accordion (VISUAL_EDITOR_UIUX §Fields). The header is a toggle
	   at the field-label rung; the panel slides via a 0fr↔1fr grid row so the height
	   animates without a magic max-height. */
	/* The wrapper carries NO gap: the headers' own padding is the rhythm (see the
	   markup note). */
	.qm-groups,
	.qm-group {
		display: flex;
		flex-direction: column;
	}
	/* The bracket's third stroke, on the SECTION rather than on its panel:
	 spanning the header and the content is what gives it a corner to close into at
	 the block's edge: a rule that starts below the header has nothing to meet there.
	 One rung with the two horizontals, held there by `check:style`'s border-width axis.

	 Drawn transparent when closed rather than absent, so the 1px it occupies is the
	 same open or shut and a toggle moves no text. */
	.qm-group {
		border-left: var(--_qm-border-width) solid transparent;
		transition: border-color var(--_qm-duration-slow) var(--_qm-ease-reverse);
	}
	.qm-group.qm-open {
		border-left-color: var(--_qm-border);
	}
	/* Vertical padding is symmetric and is the TIGHTEST rung that still clears WCAG
	 2.5.8's 24×24 floor over the label rung's line box: the header is the whole row,
	 so adjacent labels share one rhythm with no dead strip outside the button, and a
	 rung above the floor is a rung spent per section on a card whose scarce axis is
	 vertical. Horizontal is one rung left and zero right. Left, because the section's
	 vertical runs down this row: at zero the chevron stands on the stroke with only
	 the icon box's own bearing between them, which is neither a rung nor a constant:
	 the glyph's rotation swaps which bearing faces the stroke, so the clearance moves
	 as the section opens. Right stays at zero because the row is the target and an
	 inset there is target given back; the left one is inside the button and costs
	 none.

	 A button by tag and NEITHER button family by recipe: it reads no
	 `--_qm-tap-min` (the padding above already clears the floor) and takes no hover
	 fill (an ink step, below); so the type a family would have carried is declared
	 here. `font: inherit` because a UA button inherits no face and `--qm-font` would
	 stop at this row; then the field-label rung, at the tight leading a single line
	 takes. Sentence case at that rung, reused rather than a fifth size minted: a
	 section name is structurally a heading, and uppercase costs it twice: the word
	 shape a column of them is scanned by, and apparent width, so a long label crowds
	 sooner. Size, weight and leading all sit after `font`, which is a shorthand that
	 carries `line-height`.

	 On the BUTTON rather than on a span inside it: the row's type is one decision,
	 and a wrapper that carries nothing else is indirection between the header and
	 its own label. The label is a text run beside the chevron, and flex gives it an
	 anonymous item either way. */
	.qm-group-header {
		display: flex;
		align-items: center;
		gap: var(--_qm-space);
		width: 100%;
		border: none;
		background: transparent;
		padding: var(--_qm-space) 0 var(--_qm-space) var(--_qm-space);
		font: inherit;
		font-size: var(--_qm-text-label);
		font-weight: var(--_qm-weight-soft);
		line-height: var(--_qm-leading-tight);
		cursor: pointer;
		color: var(--_qm-ink-meta);
		text-align: left;
		transition: color var(--_qm-duration-fast) var(--_qm-ease-reverse);
	}
	.qm-group-header :global(.qm-group-chevron) {
		flex-shrink: 0;
		transition: transform var(--_qm-duration-slow) var(--_qm-ease-reverse);
	}
	/* An ink step, not a hue: AESTHETIC §Rules keeps the three status hues as the only
	   exits from the greyscale, and a section standing open is not a status anyway.

	   HOVER'S ALONE, though the step suits open as well. `color` is one transition
	   declaration, and open is the accordion's gesture where hover is its own, so the two
	   share a rung and one of them is wrong: an ink step at the slow rung lags the
	   pointer, and at the fast one it settles 80ms before the panel it belongs to
	   (SURFACES §Motion). Hover keeps the property because open has another cue in the
	   chevron's rotation and hover has none, a big borderless target drawing no box. */
	.qm-group-header:hover {
		color: var(--_qm-ink);
	}
	.qm-group.qm-open .qm-group-header :global(.qm-group-chevron) {
		transform: rotate(90deg);
	}
	/* Sliding panel: the grid track goes 0fr→1fr; the inner clips at min-height 0.
	 Clipping is the whole of what CSS does here: what a closed panel is OUT of is
	 `inert`'s to say, on the element (SURFACES §"Focus and active state"). The panel
	 draws no rule of its own: the vertical is the section's (`.qm-group`), which is
	 what spans the header too. */
	.qm-group-panel {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows var(--_qm-duration-slow) var(--_qm-ease-reverse);
	}
	.qm-group.qm-open .qm-group-panel {
		grid-template-rows: 1fr;
	}
	/* The grouped sections' query container (declared above): its left inset is
	 exactly what makes a panel's usable width differ from the card's. */
	.qm-group-panel-inner {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
		min-height: 0;
		overflow: hidden;
		/* Zero when closed, so the insets arrive with the panel: a `0fr` track collapses
		 the CONTENT, not the padding, and a top inset declared here stands under a
		 closed header as dead space the header's symmetric padding cannot absorb. The
		 panel animates its width along with them, and the capacity ramp reads that
		 width: a closed panel is `inert` and unmeasured either way, so what a rung
		 crosses mid-slide is a hidden grid. */
		padding: 0;
		transition: padding var(--_qm-duration-slow) var(--_qm-ease-reverse);
	}
	.qm-group.qm-open .qm-group-panel-inner {
		padding: var(--_qm-space-2) 0 0 var(--_qm-space-3);
	}
	.qm-body-leaf {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space);
	}
	/* Recovery shell: dashed edge marks an un-schemable card. The edge
	 alone carries that: fill stays the card rung, content behind it intact. */
	.qm-card.qm-unschemable {
		border-style: dashed;
	}
	/* One typographic role with the editable title above, so it reads the same three
	 rungs: including the tight leading a card title takes over the root's reading
	 rhythm (SURFACES §Rhythm). */
	.qm-card-title-static {
		font-size: var(--_qm-text-title);
		font-weight: var(--_qm-weight-label);
		line-height: var(--_qm-leading-tight);
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
		border: var(--_qm-border-width) solid var(--_qm-border);
		border-radius: var(--_qm-radius-inner);
		background: var(--_qm-surface);
		padding: var(--_qm-space-half) var(--_qm-space-2);
	}
</style>
