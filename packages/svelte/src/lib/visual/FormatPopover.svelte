<!--
 The formatting selection popover (VISUAL_EDITOR §Chrome). ONE popover,
 shell-owned, observing the ACTIVE leaf through
 `getActiveLeaf`: the VisualEditor's accessor over its `leaves` registry, and
 the whole of what this surface knows about the editor. A non-empty selection in
 the active leaf raises it over
 that leaf's selection rect; each button dispatches a PM `toggleMark` command
 straight at the leaf's `EditorView`. The codec's own `dispatchTransaction`
 (field.ts, read-only from here) lowers the resulting transaction to
 `markOps` and commits via `applyChange`: this component never touches the
 content. The keymap mirror (Mod-b/i/u) already lives in the codec's keymap
 (field.ts); this is the pointer affordance for all six marks.

 SELECTION OBSERVATION. The view's `dispatchTransaction` is the codec's
 (read-only), so there is no hook to observe transactions from outside.
 Fallback: a document-level `selectionchange` listener, coalesced to one
 `requestAnimationFrame`-deferred check (see `deferredSync` below: a bare
 microtask is NOT late enough; verified a "select all" gesture fires several
 transient `selectionchange` events first). `focusout` keeps the popover honest
 when focus leaves the leaf.

 Nothing here watches SCROLL. `sync` decides whether the surface is up and what
 its buttons read, which a scroll changes neither of; where it sits is the
 anchor's own question, and the anchor answers it by measuring when floating-ui
 asks rather than by being handed a rect (`codec/anchor.ts`).

 FOCUS DISCIPLINE. Three failure modes a naive Popover.Content invites:
 (1) its default `trapFocus` (true) redirects any focus landing outside its
 DOM back inside; which would make it impossible to click back into
 the editor to change the selection while the popover is showing. Fixed
 by `trapFocus={false}`.
 (2) its open-auto-focus (unconditional on mount, regardless of trapFocus;
 verified against bits-ui's FocusScope) would steal focus from the
 editor onto the first button the instant the popover appears. Fixed by
 `onOpenAutoFocus` calling `preventDefault`.
 (3) its default `onCloseAutoFocus` returns focus to the element focused
 before open (the prose leaf holding the selection). Clicking a native
 input (card-title, TextField, NumberField) while the popover is open
 bounces focus off that input back to the leaf; ProseMirror re-asserts
 the retained selection and the browser scrolls it into view, yanking
 the viewport off the clicked field. Fixed by `onCloseAutoFocus`
 calling `preventDefault`: the intentional returns after mark toggle
 / link submit go through `view.focus` in `toggle`/`submitLink`.
 A mark button ALSO swallows its own `mousedown` (prosemirror-menu's own
 trick): without it, the browser's default mousedown action focuses the
 button before `click` fires, blurring the editor and collapsing the
 selection the command is supposed to act on.
-->
<script lang="ts">
	import { wording } from './strings.js';

	// The surface's words, ambient from the editor root; the package's English
	// off-tree, so this component renders standalone too.
	const t = wording();
	import { toggleMark } from 'prosemirror-commands';
	import { TextSelection } from 'prosemirror-state';
	import type { EditorView } from 'prosemirror-view';
	import type { MarkType } from 'prosemirror-model';
	import { Popover } from 'bits-ui';
	import Icon from './icons/Icon.svelte';
	import type { IconName } from './icons/nodes.js';
	import {
		rangeAnchor,
		type FieldController,
		type LeafViews,
		type RangeAnchor
	} from '../core/codec/index.js';
	import './controls.css';

	type LeafWithView = FieldController & Partial<LeafViews>;

	interface Props {
		/** The observation seam VisualEditor exposes over its `leaves` registry. */
		getActiveLeaf: () => FieldController | undefined;
	}
	let { getActiveLeaf }: Props = $props();

	/** Mark size: the shared control-glyph rule for the popover icons. */
	const GLYPH = 15;
	/** The six content formatting marks; `anchor` is a 7th, rendered separately (a decoration toggle, not a PM `toggleMark` (see the button below). Each carries a glyph) the icon *is* the label. */
	const MARKS: { name: string; icon: IconName; title: string }[] = $derived([
		{ name: 'strong', icon: 'bold', title: t.strings.formatBold },
		{ name: 'em', icon: 'italic', title: t.strings.formatEmphasis },
		{ name: 'underline', icon: 'underline', title: t.strings.formatUnderline },
		{ name: 'strike', icon: 'strikethrough', title: t.strings.formatStrikethrough },
		{ name: 'code', icon: 'code', title: t.strings.formatCode },
		{ name: 'link', icon: 'link', title: t.strings.formatLink }
	]);

	let open = $state(false);
	let activeMarks = $state<Record<string, boolean>>({});
	/** Whether the selection is in the FIELD's coordinate space, which an anchor needs
	 *  and a table cell is not (see `sync`). */
	let anchorAvailable = $state(true);
	let linkPromptOpen = $state(false);
	let linkValue = $state('');
	let contentEl = $state<HTMLElement | undefined>(undefined);
	/** The root to portal INTO: `document.body` escapes the editor's subtree and
	 * the consumer's dials with it, so a pane-scoped palette misses this surface.
	 * Resolved from the active leaf's own DOM, so the popover lands inside whichever
	 * root raised it; `undefined` falls back to bits-ui's `document.body` for a leaf
	 * mounted outside any root. */
	let portalTarget = $state<HTMLElement | undefined>(undefined);

	/** The selection the surface hangs off, live rather than measured (`codec/anchor.ts`): floating-ui re-reads it through every scroll and reflow, so `sync` mints one only when the RANGE moves. A NEW object each time it does, so bits-ui's `watch( => opts.customAnchor.current, …)` sees the change and repositions (a mutated-in-place object would not). */
	let anchor = $state<RangeAnchor | undefined>(undefined);

	/** The view the caret is actually in: the leaf's own, or the NESTED cell view of a
	 * table island (`codec/table-view.ts`). The six marks are the inline schema's
	 * too, so a selection in a cell raises the same popover and toggles the same
	 * commands; only `anchor` is withheld (below). */
	function activeLeafView(): EditorView | undefined {
		const leaf = getActiveLeaf() as LeafWithView | undefined;
		return leaf?.focusedView?.() ?? leaf?.view;
	}

	/** Recompute open/anchor/active-marks from the active leaf's CURRENT PM selection. */
	function sync(): void {
		const insidePopover =
			!!contentEl && !!document.activeElement && contentEl.contains(document.activeElement);
		// Interacting with the popover itself (e.g. the link input): leave state as-is.
		// Costs nothing to hold: the anchor minted below goes on measuring while this
		// returns early, so a surface frozen here still tracks the selection it covers.
		if (insidePopover) return;
		const leaf = getActiveLeaf() as LeafWithView | undefined;
		const view = leaf?.focusedView?.() ?? leaf?.view;
		// A non-empty TEXT selection. A NODE selection is non-empty too and has nothing
		// to format: it covers a leaf block (an island, a rule), which is exactly where
		// Escape out of a table cell lands.
		const selection = view?.state.selection;
		const formattable = selection instanceof TextSelection && !selection.empty;
		if (!view || !view.hasFocus() || !formattable) {
			open = false;
			linkPromptOpen = false;
			return;
		}
		portalTarget = view.dom.closest<HTMLElement>('[data-qm-root]') ?? undefined;
		const { from, to } = view.state.selection;
		anchor = rangeAnchor(view, from, to);
		const marks: Record<string, boolean> = {};
		for (const m of MARKS) {
			const type = view.state.schema.marks[m.name];
			marks[m.name] = !!type && view.state.doc.rangeHasMark(from, to, type);
		}
		// `anchor` is a decoration, not a PM mark (CODEC §Marks): its active state is
		// whether the selection covers an identity anchor, read off the leaf in USV.
		//
		// A selection inside a table CELL is not in that coordinate space at all: the
		// field's position map holds one `atom` run for the whole island, so there is
		// no USV offset to mint an anchor at. The button is withheld rather than
		// disabled, because what it would toggle does not exist there (CODEC §Islands).
		anchorAvailable = !!leaf && view === leaf.view;
		if (leaf && anchorAvailable) {
			const sel = leaf.selectionRange();
			marks.anchor = leaf.anchorsInRange(sel.from, sel.to).length > 0;
		}
		activeMarks = marks;
		open = true;
	}

	// A burst of DOM events (verified: browser "select all" processing fires
	// `selectionchange` several times, transiently EMPTY before landing on the
	// final range) must coalesce to ONE settled check, not one `sync()` per
	// event: reacting to each intermediate state mounts/unmounts
	// `Popover.Content` repeatedly within a few event-loop turns, which is both
	// visibly unstable (a moving, momentarily detached click target) and races
	// bits-ui's own internal effects (observed: Svelte's
	// `derived_inert` warning from a stale read after a too-fast unmount). A
	// microtask is not late enough: those transient events are themselves
	// separated by microtasks. `requestAnimationFrame` is: it runs once
	// per-frame, after the browser has finished dispatching every synchronous
	// consequence of the user gesture, so it always reads the FINAL, settled
	// selection. `pending` collapses a burst to a single scheduled callback.
	let pending = false;
	let rafHandle = 0;
	function deferredSync(): void {
		if (pending) return;
		pending = true;
		rafHandle = requestAnimationFrame(() => {
			pending = false;
			sync();
		});
	}

	$effect(() => {
		document.addEventListener('selectionchange', deferredSync);
		document.addEventListener('focusout', deferredSync);
		return () => {
			document.removeEventListener('selectionchange', deferredSync);
			document.removeEventListener('focusout', deferredSync);
			// A burst-coalescing rAF may still be in flight at teardown; cancel it so
			// `sync()` never runs against the destroyed component.
			if (pending) cancelAnimationFrame(rafHandle);
			pending = false;
		};
	});

	// Any close path that bypasses `sync` (e.g. Escape while the link input holds
	// focus: bits-ui flips `open` itself) must not leave a stale prompt for the
	// next open.
	$effect(() => {
		if (!open) linkPromptOpen = false;
	});

	/** Swallow the button's mousedown so focus/selection never leave the leaf. */
	function keepFocus(e: MouseEvent): void {
		e.preventDefault();
	}

	function toggle(name: string): void {
		const view = activeLeafView();
		if (!view) return;
		const type: MarkType | undefined = view.state.schema.marks[name];
		if (!type) return;
		if (name === 'link' && !activeMarks.link) {
			linkPromptOpen = true;
			linkValue = '';
			return;
		}
		toggleMark(type)(view.state, view.dispatch);
		view.focus();
		sync();
	}

	/**
	 * Toggle an identity anchor over the selection: the `anchor`
	 * button's answer to a formatting toggle. If the selection already covers
	 * anchors, remove them; else insert one at its start with a freshly-minted
	 * unique id (the caller-supplied, invariant id the 0.97 policy settles).
	 * Zero-width and glyph-less (CODEC §Marks): the identity handle persists in
	 * the content, its chrome awaiting comment-thread UX.
	 */
	function toggleAnchor(): void {
		const leaf = getActiveLeaf();
		const view = activeLeafView();
		if (!leaf || !view || view.state.selection.empty) return;
		const { from, to } = leaf.selectionRange();
		const covered = leaf.anchorsInRange(from, to);
		if (covered.length) covered.forEach((id) => leaf.removeAnchor(id));
		else leaf.insertAnchor(crypto.randomUUID(), from);
		view.focus();
		sync();
	}

	function submitLink(): void {
		const view = activeLeafView();
		const type = view?.state.schema.marks.link;
		linkPromptOpen = false;
		if (!view || !type) return;
		const href = linkValue.trim();
		if (href) toggleMark(type, { href })(view.state, view.dispatch);
		view.focus();
		sync();
	}

	function cancelLink(): void {
		linkPromptOpen = false;
		activeLeafView()?.focus();
		sync();
	}
</script>

<Popover.Root bind:open>
	<Popover.Portal to={portalTarget}>
		<Popover.Content
			customAnchor={anchor ?? null}
			side="top"
			align="center"
			trapFocus={false}
			sideOffset={8}
			onOpenAutoFocus={(e: Event) => e.preventDefault()}
			onCloseAutoFocus={(e: Event) => e.preventDefault()}
		>
			<!-- The `child` snippet, so the surface IS the primitive's content node
			 rather than a pill inside it: the dismissal is a CSS animation and the
			 primitive unmounts on the content node's own animations finishing. It
			 also keeps the recipe reachable from this
			 component's scoped styles, which a class handed to a primitive as a
			 string never picks up the scoping hash for. `wrapperProps` is
			 floating-ui's positioning box: spread, never styled. `inert` is the half
			 of the dismissal the recipe cannot carry: the surface is still on screen
			 for the length of the fade, and a surface on its way out is not a thing
			 to click, tab into, or read. -->
			{#snippet child({ props, wrapperProps, open: raised })}
				<div {...wrapperProps}>
					<div
						bind:this={contentEl}
						{...props}
						class="qm-format-popover qm-popover-surface"
						data-qm-root
						inert={!raised}
					>
						{#if linkPromptOpen}
							<form
								class="qm-link-prompt"
								onsubmit={(e) => {
									e.preventDefault();
									submitLink();
								}}
							>
								<input
									class="qm-link-input"
									type="text"
									placeholder={t.strings.linkPlaceholder}
									bind:value={linkValue}
								/>
								<button type="submit" class="qm-icon-btn qm-mark-btn">{t.strings.linkApply}</button>
								<button
									type="button"
									class="qm-icon-btn qm-mark-btn"
									onmousedown={keepFocus}
									onclick={cancelLink}>{t.strings.linkCancel}</button
								>
							</form>
						{:else}
							<!-- `role="group"`, not `toolbar`: these buttons carry no roving-tabindex /
							     arrow-key navigation, so the ARIA toolbar contract would be a lie;
							     a labelled group is the honest description. -->
							<div class="qm-format-buttons" role="group" aria-label={t.strings.formatGroup}>
								{#each MARKS as m (m.name)}
									<button
										type="button"
										class="qm-icon-btn qm-mark-btn"
										class:active={activeMarks[m.name]}
										title={m.title}
										aria-label={m.title}
										onmousedown={keepFocus}
										onclick={() => toggle(m.name)}><Icon name={m.icon} size={GLYPH} /></button
									>
								{/each}
								{#if anchorAvailable}
									<button
										type="button"
										class="qm-icon-btn qm-mark-btn"
										class:active={activeMarks.anchor}
										title={t.strings.formatAnchorTitle}
										aria-label={t.strings.formatAnchor}
										onmousedown={keepFocus}
										onclick={toggleAnchor}><Icon name="hash" size={GLYPH} /></button
									>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

<style>
	/* This surface PORTALS out of the leaf's DOM but INTO the nearest `[data-qm-root]`
	   (the target is resolved in `sync`), so it inherits the consumer's dials like
	   every other surface. It carries the marker itself too: floating over content is
	   still a detached subtree for the derivation's purposes, and the marker is what
	   applies it (core/theme.css). */
	/* The lift, the translucency, the blur and the scale-in come from
	   `.qm-popover-surface` (controls.css); this surface's own is a row and an inset. */
	.qm-format-popover {
		display: flex;
		padding: var(--_qm-space);
	}
	.qm-format-buttons {
		display: flex;
		gap: var(--_qm-space-half);
	}
	/* Chrome, type, target floor, hover fill and disabled recede come from
	 `.qm-icon-btn` (controls.css); what is here is this surface's own. The border is
	 drawn transparent rather than absent so the active inversion adds no width and
	 shifts no glyph, and the ink is stated because the family deliberately declares
	 none: its callers disagree, and a popover over content reads at the card's. */
	.qm-mark-btn {
		border: var(--_qm-border-width) solid transparent;
		padding: var(--_qm-space) var(--_qm-space-2);
		color: var(--_qm-ink);
	}
	/* Active is an ink inversion, the one state on this surface a hover fill cannot
	   say: a mark already carried is not a mark under the pointer. */
	.qm-mark-btn.active {
		background: var(--_qm-ink);
		color: var(--_qm-surface);
	}
	.qm-link-prompt {
		display: flex;
		gap: var(--_qm-space);
		align-items: center;
	}
	/* A typed value on a floating surface: it draws `.qm-input`'s recipe by hand rather
	   than carrying the class, because it takes none of the width the form control
	   adds. The inset is the shared rung, so a URL sits as far into its box here as a
	   subject line does in the card below. */
	.qm-link-input {
		font: inherit;
		font-size: var(--_qm-text-body);
		padding: var(--_qm-inset-control);
		border: var(--_qm-border-width) solid var(--_qm-border);
		border-radius: var(--_qm-radius-inner);
		min-width: 12rem;
	}
</style>
