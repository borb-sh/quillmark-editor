<!--
  The formatting selection popover (VISUAL_EDITOR §Chrome, VISUAL_EDITOR_UIUX
  §Formatting). ONE popover, shell-owned, observing the ACTIVE leaf through
  `getActiveLeaf` — the accessor 4a left as "the 4b formatting-popover
  observation seam". A non-empty selection in the active leaf raises it over
  that leaf's selection rect; each button dispatches a PM `toggleMark` command
  straight at the leaf's `EditorView`. The codec's own `dispatchTransaction`
  (field.ts, read-only from here) lowers the resulting transaction to
  `markOps` and commits via `applyChange` — this component never touches the
  content. The keymap mirror (Mod-b/i/u) already lives in the codec's keymap
  (field.ts); this is the pointer affordance for all six marks.

  SELECTION OBSERVATION. The view's `dispatchTransaction` is the codec's
  (read-only), so there is no hook to observe transactions from outside.
  Fallback: a document-level `selectionchange` listener, coalesced to one
  `requestAnimationFrame`-deferred check (see `deferredSync` below — a bare
  microtask is NOT late enough; verified a "select all" gesture fires several
  transient `selectionchange` events first). `focusout`/scroll/resize keep the
  popover honest when focus leaves the leaf or the page scrolls.

  FOCUS DISCIPLINE. Three failure modes a naive Popover.Content invites:
    (1) its default `trapFocus` (true) redirects any focus landing outside its
        DOM back inside — which would make it impossible to click back into
        the editor to change the selection while the popover is showing. Fixed
        by `trapFocus={false}`.
    (2) its open-auto-focus (unconditional on mount, regardless of trapFocus —
        verified against bits-ui's FocusScope) would steal focus from the
        editor onto the first button the instant the popover appears. Fixed by
        `onOpenAutoFocus` calling `preventDefault()`.
    (3) its default `onCloseAutoFocus` returns focus to the element focused
        before open — the prose leaf holding the selection. Clicking a native
        input (card-title, TextField, NumberField) while the popover is open
        bounces focus off that input back to the leaf; ProseMirror re-asserts
        the retained selection and the browser scrolls it into view, yanking
        the viewport off the clicked field. Fixed by `onCloseAutoFocus`
        calling `preventDefault()` — the intentional returns after mark toggle
        / link submit go through `view.focus()` in `toggle()`/`submitLink()`.
  A mark button ALSO swallows its own `mousedown` (prosemirror-menu's own
  trick): without it, the browser's default mousedown action focuses the
  button before `click` fires, blurring the editor and collapsing the
  selection the command is supposed to act on.
-->
<script lang="ts">
	import { toggleMark } from 'prosemirror-commands';
	import type { EditorView } from 'prosemirror-view';
	import type { MarkType } from 'prosemirror-model';
	import { Popover } from 'bits-ui';
	import type { FieldController } from '../core/codec/index.js';

	type LeafWithView = FieldController & { view?: EditorView };

	interface Props {
		/** The 4b observation seam VisualEditor exposes over its `leaves` registry. */
		getActiveLeaf: () => FieldController | undefined;
	}
	let { getActiveLeaf }: Props = $props();

	/** The six content formatting marks (VISUAL_EDITOR_UIUX §Formatting); `anchor` is a 7th, separately rendered disabled (see the button below). */
	const MARKS: { name: string; label: string; title: string }[] = [
		{ name: 'strong', label: 'B', title: 'Bold (Mod-B)' },
		{ name: 'em', label: 'I', title: 'Emphasis (Mod-I)' },
		{ name: 'underline', label: 'U', title: 'Underline (Mod-U)' },
		{ name: 'strike', label: 'S', title: 'Strikethrough' },
		{ name: 'code', label: '<>', title: 'Code' },
		{ name: 'link', label: 'Link', title: 'Link' }
	];

	let open = $state(false);
	let rect = $state<{ left: number; top: number; right: number; bottom: number } | undefined>(
		undefined
	);
	let activeMarks = $state<Record<string, boolean>>({});
	let linkPromptOpen = $state(false);
	let linkValue = $state('');
	let contentEl = $state<HTMLElement | undefined>(undefined);

	/** A floating-ui `Measurable` virtual anchor over the selection rect — a NEW object each time `rect` changes, so bits-ui's `watch(() => opts.customAnchor.current, …)` sees the change and repositions (a mutated-in-place object would not). */
	const anchor = $derived.by(() => {
		const r = rect;
		if (!r) return null;
		return {
			getBoundingClientRect: () => new DOMRect(r.left, r.top, r.right - r.left, r.bottom - r.top)
		};
	});

	function activeLeafView(): EditorView | undefined {
		return (getActiveLeaf() as LeafWithView | undefined)?.view;
	}

	/** Recompute open/position/active-marks from the active leaf's CURRENT PM selection. */
	function sync(): void {
		const insidePopover =
			!!contentEl && !!document.activeElement && contentEl.contains(document.activeElement);
		if (insidePopover) return; // interacting with the popover itself (e.g. the link input) — leave state as-is
		const view = activeLeafView();
		if (!view || !view.hasFocus() || view.state.selection.empty) {
			open = false;
			linkPromptOpen = false;
			return;
		}
		const { from, to } = view.state.selection;
		const a = view.coordsAtPos(from);
		const b = view.coordsAtPos(to);
		rect = {
			left: Math.min(a.left, b.left),
			top: Math.min(a.top, b.top),
			right: Math.max(a.right, b.right),
			bottom: Math.max(a.bottom, b.bottom)
		};
		const marks: Record<string, boolean> = {};
		for (const m of MARKS) {
			const type = view.state.schema.marks[m.name];
			marks[m.name] = !!type && view.state.doc.rangeHasMark(from, to, type);
		}
		activeMarks = marks;
		open = true;
	}

	// A burst of DOM events (verified: browser "select all" processing fires
	// `selectionchange` several times, transiently EMPTY before landing on the
	// final range) must coalesce to ONE settled check, not one `sync()` per
	// event — reacting to each intermediate state mounts/unmounts
	// `Popover.Content` repeatedly within a few event-loop turns, which is both
	// visibly unstable (Playwright's actionability check sees a moving/detached
	// target) and races bits-ui's own internal effects (observed: Svelte's
	// `derived_inert` warning from a stale read after a too-fast unmount). A
	// microtask is not late enough — those transient events are themselves
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
		window.addEventListener('scroll', deferredSync, true);
		window.addEventListener('resize', deferredSync);
		return () => {
			document.removeEventListener('selectionchange', deferredSync);
			document.removeEventListener('focusout', deferredSync);
			window.removeEventListener('scroll', deferredSync, true);
			window.removeEventListener('resize', deferredSync);
			// A burst-coalescing rAF may still be in flight at teardown; cancel it so
			// `sync()` never runs against the destroyed component.
			if (pending) cancelAnimationFrame(rafHandle);
			pending = false;
		};
	});

	// Any close path that bypasses `sync` (e.g. Escape while the link input holds
	// focus — bits-ui flips `open` itself) must not leave a stale prompt for the
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
	<Popover.Portal>
		{#if open && anchor}
			<Popover.Content
				customAnchor={anchor}
				side="top"
				sideOffset={8}
				trapFocus={false}
				onOpenAutoFocus={(e: Event) => e.preventDefault()}
				onCloseAutoFocus={(e: Event) => e.preventDefault()}
			>
				<!-- `data-testid` lives on THIS div (ours, not bits-ui's own prop-merged
				     wrapper) so its presence never depends on bits-ui's passthrough. -->
				<div bind:this={contentEl} class="qm-format-popover" data-testid="format-popover">
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
								placeholder="https://…"
								data-testid="mark-link-input"
								bind:value={linkValue}
							/>
							<button type="submit" class="qm-mark-btn" data-testid="mark-link-apply">Apply</button>
							<button
								type="button"
								class="qm-mark-btn"
								data-testid="mark-link-cancel"
								onmousedown={keepFocus}
								onclick={cancelLink}>Cancel</button
							>
						</form>
					{:else}
						<div class="qm-format-buttons" role="toolbar" aria-label="Formatting">
							{#each MARKS as m (m.name)}
								<button
									type="button"
									class="qm-mark-btn"
									class:active={activeMarks[m.name]}
									title={m.title}
									data-testid={`mark-${m.name}`}
									onmousedown={keepFocus}
									onclick={() => toggle(m.name)}>{m.label}</button
								>
							{/each}
							<button
								type="button"
								class="qm-mark-btn"
								disabled
								title="Anchor identity marks are decoration-only in the codec — adding one at an arbitrary selection needs a codec seam field.ts does not expose yet (prose/quillmark-issues/0003). Deferred past Phase 4b."
								data-testid="mark-anchor">#</button
							>
						</div>
					{/if}
				</div>
			</Popover.Content>
		{/if}
	</Popover.Portal>
</Popover.Root>

<style>
	.qm-format-popover {
		display: flex;
		background: var(--qm-popover-bg, #fff);
		border: 1px solid var(--qm-border, #d4d4d4);
		border-radius: 6px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
		padding: 0.25rem;
	}
	.qm-format-buttons {
		display: flex;
		gap: 0.15rem;
	}
	.qm-mark-btn {
		border: 1px solid transparent;
		background: transparent;
		border-radius: 4px;
		cursor: pointer;
		font: inherit;
		font-size: 0.78rem;
		line-height: 1;
		padding: 0.35rem 0.55rem;
		color: var(--qm-text, #1a1a1a);
	}
	.qm-mark-btn:hover:not(:disabled) {
		background: var(--qm-popover-hover, #f0f0f0);
	}
	.qm-mark-btn.active {
		background: var(--qm-popover-active-bg, #1a1a1a);
		color: var(--qm-popover-active-fg, #fff);
	}
	.qm-mark-btn:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.qm-link-prompt {
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}
	.qm-link-input {
		font: inherit;
		font-size: 0.78rem;
		padding: 0.3rem 0.45rem;
		border: 1px solid var(--qm-border, #d4d4d4);
		border-radius: 4px;
		min-width: 12rem;
	}
</style>
