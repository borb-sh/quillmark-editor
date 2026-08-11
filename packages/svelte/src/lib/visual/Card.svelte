<!--
 One card block, its fields grouped by `ui.group`/`ui.compact`. `main` is headerless
 and takes no controls. Every prose leaf takes a parent-built live address, so a card
 reorder re-targets its commits without a remount.
-->
<script lang="ts">
	import { wording } from './strings.js';

	// Ambient from the editor root, with the package's English off-tree, so this
	// component renders standalone too.
	const t = wording();
	import { untrack } from 'svelte';
	import Icon from './icons/Icon.svelte';
	import type { Document, Quill, Addr, Diagnostic } from '@quillmark/wasm';
	import type { EditorErrorHandler } from '../core/errors.js';
	import type { LeafRegistry } from './leaves.js';
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
		quill: Quill;
		isFirst: boolean;
		isLast: boolean;
		kinds: string[];
		ops: CardOps;
		enumDisallowed?: 'hide' | 'disable';
		onFocus?: (addr: Addr) => void;
		onCaretMove?: (addr: Addr, pos: number) => void;
		onChange?: (addr: Addr) => void;
		onError?: EditorErrorHandler;
		/** Every field in this card registers its landing handle here, which is what the
		 *  editor's `focusField`/`setCaret` resolve a `DocPath` to. */
		leaves?: LeafRegistry;
	}
	let {
		card,
		doc,
		quill,
		isFirst,
		isLast,
		kinds,
		ops,
		enumDisallowed,
		onFocus,
		onCaretMove,
		onChange,
		onError,
		leaves
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

	// The pre-edit value Escape rolls back to; the rename itself stays live on input.
	let titleAtFocus = '';
	function onTitleFocus(e: FocusEvent): void {
		titleAtFocus = localTitle;
		(e.currentTarget as HTMLInputElement).select();
	}
	// A press on an unfocused title would place a caret on mouseup, collapsing the
	// focus-time select-all. A press while already focused stays normal, so clicking
	// mid-title to place the caret still works.
	function onTitleMousedown(e: MouseEvent): void {
		const el = e.currentTarget as HTMLInputElement;
		if (document.activeElement !== el) {
			e.preventDefault();
			el.focus();
		}
	}
	// A press on the region's empty width enters the title edit, and starts no text
	// selection on the wrapper. A press on the input itself is `onTitleMousedown`'s.
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

	/** Not `--_qm-glyph-control`: that rung centres a glyph in a tap target, where this
	 * one stands in a run of text at the body rung and is sized to sit level with it. */
	const CHEVRON = 16;

	const ungrouped = $derived(card.sections.filter((s) => s.group == null));
	const grouped = $derived(card.sections.filter((s) => s.group != null));

	// A schema that declares no fields still gets a body, and a bracket around nothing is
	// worse than none: with no content between them the two horizontals land on one y and
	// paint as a single stroke of twice the width.
	const hasMeta = $derived(ungrouped.length > 0 || grouped.length > 0);

	// Seeded once from the card's shape. Card is keyed by stable id, so this survives the
	// VisualEditor re-derive that reassigns `card` and resets only on a remount. Not
	// reconciled to later section changes: a retype is the one reshape, and the open
	// group stays where it still exists.
	// svelte-ignore state_referenced_locally
	let expanded = $state<string | null>(initialExpandedGroup(card.sections));
	let headers = $state<Record<string, HTMLButtonElement | undefined>>({});
	let panels = $state<Record<string, HTMLElement | undefined>>({});
	/**
	 * Move to `next` (`null` = all closed). A closing panel goes `inert` with whatever it
	 * held still focused, and `inert` does not say where focus should go — the browser
	 * drops it on the body — so the close hands focus to the header, which is what
	 * reopens the section. Every write to `expanded` goes through here: a group also
	 * closes when another opens.
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
	 * Open the group holding leaf `key`: a caret placed in a collapsed panel does not
	 * land at all. `VisualEditor.setCaret` calls this on every card and then waits a
	 * flush before landing, since `inert` clears when the panel renders open, not when
	 * `expanded` is assigned.
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
	 * Bring this card into view after the structure mutation that placed it: `center` for
	 * an insert, `nearest` for a reorder. The reduced-motion guard is JS rather than the
	 * CSS the accordion uses: a scroll's behaviour is an argument, not a transition a
	 * media query can cancel.
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
	class:qm-unschemable={card.unschemable}
>
	{#if card.unschemable}
		{@render recoveryShell()}
	{:else}
		{#if !card.isMain}
			<header class="qm-card-header">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="qm-card-rename" onmousedown={onRenameMousedown}>
					<span class="qm-card-title-sizer" data-value={localTitle || card.titlePlaceholder}>
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
			<!-- One element whose top and bottom edges are the bracket's two horizontals.
		 Anchored here rather than on the header and on the accordion so an open section's
		 vertical reaches them, and so a card with no groups still terminates above its
		 body. -->
			{#if hasMeta}
				<div
					class="qm-card-meta"
					class:qm-meta-top={!card.isMain}
					class:qm-meta-bottom={card.hasBody}
				>
					{#each ungrouped as section (section.group ?? '_ungrouped')}
						<div class="qm-section">
							{@render sectionFields(section.fields)}
						</div>
					{/each}

					<!-- One open at a time. Rendered only when a card has groups, so an empty
				     accordion is not the bracket's last child: the bottom rule's inset belongs
				     to whichever block abuts it. -->
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
										<Icon
											name="chevron-right"
											class="qm-group-chevron"
											size={CHEVRON}
										/>{section.label}
									</button>
									<!-- The panel is clipped, not unmounted, so without `inert` every field
								     in a hidden section keeps its place in the tab order and in the a11y
								     tree, under a header announcing `aria-expanded="false"`. -->
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

			<!-- Unframed: the body is the only surface at the card's own tone, where every
		 other typed value sits in a well cut into it, and that is what makes it read as
		 paper instead of as one more field. -->
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
						{leaves}
					/>
					<DiagnosticList diagnostics={ops.diagFor(undefined)} />
				</div>
			{/if}
		</div>
	{/if}
</section>

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
				addr={ops.makeAddr(f.name)}
				leafKey={ops.leafKey(f.name)}
				domIds={ops.domIds(f.name)}
				onCommitScalar={(v) => ops.commit(f.name, v)}
				optionAllowed={(v) => ops.enumAllowed(f.name, v)}
				{enumDisallowed}
				{onFocus}
				{onCaretMove}
				{onChange}
				{onError}
				{leaves}
				diagnostics={ops.diagFor(f.name)}
			/>
		{/each}
	</div>
{/snippet}

<!-- A card whose `kind` has no schema stays visible and removable, its fields, body and
 `$ext` intact in the Document, so it is never a data trap. `setCardKind` swaps the kind
 and leaves payload and body untouched, so retyping drops no field; with no kinds to
 offer, delete is the only exit. -->
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

{#snippet kindOptions()}
	{#each kinds as k (k)}
		<option value={k}>{humanize(k)}</option>
	{/each}
{/snippet}

<style>
	/* An island, and the tone is the whole of what makes it one: the card is the base
	 plane and the column behind it is the sunken one (ARCHITECTURE §Styling). The inset
	 is the same rung as the gap, so what separates the header from the fields is what
	 separates the fields from the card's edge. */
	.qm-card {
		border-radius: var(--_qm-radius);
		padding: var(--_qm-space-3);
		background: var(--_qm-surface);
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
	/* The overhang is the tap target's own centring given back, so the glyphs sit on the
	 card's gutter rather than the targets around them. It is the fill that crosses the
	 line, not a box: an icon button rests unboxed and fills only under the pointer. */
	.qm-card-header-right {
		display: flex;
		align-items: center;
		gap: var(--_qm-space-2);
		margin-right: calc(-1 * (var(--_qm-tap-min) - var(--_qm-glyph-control)) / 2);
	}
	/* Focus as well as hover, so a caret in any leaf, the title, or a chevron holds the
	 reveal: hover alone would strand the pair on keyboard and touch. */
	.qm-card:hover :global(.qm-card-reorder),
	.qm-card:focus-within :global(.qm-card-reorder) {
		opacity: 1;
	}
	/* The rename hit region is the header's free width at full height, so a press
	 anywhere left of the controls enters the title edit. `align-self: stretch` beats the
	 header's centring, which is also what keeps the target legal with no padding: WCAG
	 2.5.8's floor is the row's, which the controls hold at `--_qm-tap-min`. */
	.qm-card-rename {
		flex: 1;
		min-width: 0;
		align-self: stretch;
		display: flex;
		align-items: center;
		cursor: text;
	}
	/* Autosize: the ::after mirrors the text into the same grid cell as the input, so the
	 overlaid input tracks its content width. Both carry the same nothing for a box model
	 and inherit the same type tokens, which is what makes the two measure alike.

	 The type is the group header's, down to the ink and its hover step below: a card
	 title and a section header both name a block of fields, so they read as one register
	 and what ranks them is position rather than a size step. */
	.qm-card-title-sizer {
		display: inline-grid;
		align-items: center;
		min-width: 0;
		max-width: 100%;
		font-size: var(--_qm-text-body);
		font-weight: var(--_qm-weight-mid);
		line-height: var(--_qm-leading-tight);
		font-family: inherit;
	}
	.qm-card-title-sizer::after {
		content: attr(data-value) ' ';
		grid-area: 1 / 1;
		visibility: hidden;
		white-space: pre;
		min-width: 2ch;
	}
	/* The title draws no box in any state: a card title is already the one line that
	 reads as the card's name, and the region's `cursor: text` says the rest. The ink step
	 replaces it, the same cue the group header takes — a wide borderless target has no
	 other way to answer the pointer. */
	.qm-card-title {
		grid-area: 1 / 1;
		width: 100%;
		min-width: 0;
		font: inherit;
		/* `font: inherit` does not carry colour: a form control defaults to the UA's own
		 text colour rather than the header's ink without this line. */
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
	.qm-card-body,
	.qm-card-meta {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-3);
	}
	/* The metadata bracket, in three strokes at one rung: these two horizontals and the
	 open section's vertical below. A bracket whose sides disagree on width or tone reads
	 as three unrelated lines rather than one figure, which is why the vertical takes
	 `--_qm-border` and not `--_qm-accent`.

	 Each condition is what its stroke means: a top rule is the line under a card title,
	 so the headerless `main` has none; a bottom rule divides fields from body, so a card
	 with no body has nothing to divide. Sometimes two strokes and sometimes one — an open
	 figure, which is what distinguishes it from a second box inside the card. */
	.qm-meta-top {
		border-top: var(--_qm-border-width) solid var(--_qm-border);
	}
	.qm-meta-bottom {
		border-bottom: var(--_qm-border-width) solid var(--_qm-border);
	}
	/* The inset sits on the fields rather than on the block that holds them: an open
	 section's vertical has to reach the rule to close a corner against it, and padding
	 between the two is the distance by which it would miss. Unqualified by open — a shut
	 panel clips it. */
	.qm-meta-top > .qm-section {
		padding-top: var(--_qm-space-3);
	}
	.qm-meta-bottom > .qm-section:last-child,
	.qm-meta-bottom .qm-group:last-child .qm-group-panel-inner > .qm-fields {
		padding-bottom: var(--_qm-space-3);
	}
	/* Two query containers, one per kind of section, so capacity follows the width the
	 fields actually get: a panel's inset makes that narrower than the card. */
	.qm-section,
	.qm-group-panel-inner {
		container-type: inline-size;
	}
	/* Capacity is the container's, not JavaScript's: nothing measures, so there is no
	 observer to loop and no re-packing to restructure the DOM under a prose leaf.

	 It steps 1 → 2 → 4, skipping 3: each rung is the width at which a track still clears
	 the comfortable field minimum, and an even capacity is what lets `lone`'s half land
	 on a track boundary. A field ends on its track's own edge, so a rung is
	 `n * 220px + gaps`. */
	.qm-fields {
		--cols: 1;
		--cols-half: 1;
		display: grid;
		grid-template-columns: repeat(var(--cols), 1fr);
		column-gap: var(--_qm-space-2);
		row-gap: var(--_qm-space-3);
	}
	@container (min-width: 28rem) {
		.qm-fields {
			--cols: 2;
			--cols-half: 1;
		}
	}
	@container (min-width: 57rem) {
		.qm-fields {
			--cols: 4;
			--cols-half: 2;
		}
	}
	.qm-groups,
	.qm-group {
		display: flex;
		flex-direction: column;
	}
	/* The bracket's third stroke, on the section rather than on its panel: spanning the
	 header is what gives it a corner to close into at the block's edge. Drawn transparent
	 when closed rather than absent, so a toggle moves no text. */
	.qm-group {
		border-left: var(--_qm-border-width) solid transparent;
		transition: border-color var(--_qm-duration-slow) var(--_qm-ease-reverse);
	}
	.qm-group.qm-open {
		border-left-color: var(--_qm-border);
	}
	/* Symmetric vertical padding at the tightest rung that still clears WCAG 2.5.8's
	 24×24 floor: the header is the whole row, so adjacent labels share one rhythm with no
	 dead strip outside the button. Horizontal is one rung left and zero right — left,
	 because at zero the chevron stands on the section's vertical with only the icon box's
	 own bearing between them, and the glyph's rotation swaps which bearing faces the
	 stroke; right, because the row is the target and an inset there is target given back.

	 `font: inherit` because a UA button inherits no face, then the body rung, one step
	 over the field labels beneath it: at the label rung the two read as one register and
	 the accordion stops looking like structure. Size, weight and leading sit after
	 `font`, a shorthand that carries `line-height`. */
	.qm-group-header {
		display: flex;
		align-items: center;
		gap: var(--_qm-space);
		width: 100%;
		border: none;
		background: transparent;
		padding: var(--_qm-space) 0 var(--_qm-space) var(--_qm-space);
		font: inherit;
		font-size: var(--_qm-text-body);
		font-weight: var(--_qm-weight-mid);
		line-height: var(--_qm-leading-tight);
		cursor: pointer;
		color: var(--_qm-ink-label);
		text-align: left;
		transition: color var(--_qm-duration-fast) var(--_qm-ease-reverse);
	}
	.qm-group-header :global(.qm-group-chevron) {
		flex-shrink: 0;
		display: block;
		transform: rotate(0deg);
		transform-origin: center;
		transition: transform var(--_qm-duration-slow) var(--_qm-ease-reverse);
	}
	/* Open shares hover's ink step: a big borderless target draws no box, so the ink is
	 the only cue an open section keeps once the pointer leaves it. The chevron's
	 rotation is the other cue, and stays open-only below. */
	.qm-group-header:hover,
	.qm-group.qm-open .qm-group-header {
		color: var(--_qm-ink);
	}
	.qm-group.qm-open .qm-group-header :global(.qm-group-chevron) {
		transform: rotate(90deg);
	}
	.qm-group-panel {
		display: grid;
		grid-template-rows: 0fr;
		transition: grid-template-rows var(--_qm-duration-slow) var(--_qm-ease-reverse);
	}
	.qm-group.qm-open .qm-group-panel {
		grid-template-rows: 1fr;
	}
	/* Two boxes because the axes clip differently, and the track is the only thing that
	 animates: a field sits at its open position from the first frame of the reveal.

	 The clip box takes the inline inset, which costs a shut panel no height and holds the
	 queried width still. The block inset goes on the content, where a `0fr` track clips
	 it: declared one box out it collapses the content but not itself, and stands under a
	 shut header as dead space. Neither is animated, and neither is qualified by open. */
	.qm-group-panel-inner {
		min-height: 0;
		overflow: hidden;
		padding-inline-start: var(--_qm-space-4);
	}
	.qm-group-panel-inner > .qm-fields {
		padding-block: var(--_qm-space-2);
	}
	.qm-body-leaf {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space);
	}
	/* The one card that draws an edge at all: an ordinary card is a plane, so a stroke
	 around this one is a state rather than heavier chrome. */
	.qm-card.qm-unschemable {
		border: var(--_qm-border-width) dashed var(--_qm-border);
	}
	/* One typographic role with the editable title above. */
	.qm-card-title-static {
		font-size: var(--_qm-text-body);
		font-weight: var(--_qm-weight-mid);
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
	/* The one native control the surface draws, on the box's own recipe (controls.css). */
	.qm-recovery-retype select {
		font: inherit;
		border: none;
		border-radius: var(--_qm-radius-inner);
		background: var(--_qm-surface-well);
		padding: var(--_qm-space-half) var(--_qm-space-2);
	}
</style>
