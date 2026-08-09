<!--
 The ephemeral tips card. Renders the
 `$ext.editor.tips` channel one tip at a time: dots reach any tip in the set, and the
 foot's one button advances until the last, where it becomes the dismiss. Dismissal
 CLEARS the channel in the Document, so the card is gone and does not reappear.

 The cursor is LOCAL state, not the channel. Advancing writes nothing: a per-tip
 write would round-trip the boundary, re-derive the card tree, and dirty the
 document (firing a consumer's autosave) on what is a read gesture. Exactly one
 write happens, at dismissal, and this component unmounts with it, so the cursor
 needs no reset.
-->
<script lang="ts">
	import { wording } from './strings.js';

	// The surface's words, ambient from the editor root; the package's English
	// off-tree, so this component renders standalone too.
	const t = wording();
	import Icon from './icons/Icon.svelte';
	import { renderTip } from './tips.js';
	import type { EditorErrorHandler } from '../core/errors.js';
	import './controls.css';

	interface Props {
		/** The narrowed channel (`tipsChannel`); never empty; the parent gates on length. */
		tips: string[];
		/** Clear `$ext.editor.tips`: the patch-write that preserves the `title` sibling. */
		onDismiss: () => void;
		/** A tip whose markdown did not render; it shows literally either way. */
		onError?: EditorErrorHandler;
	}
	let { tips, onDismiss, onError }: Props = $props();

	/** Control-glyph size: the shared rule, as CardControls. */
	const GLYPH = 14;

	let cursor = $state(0);
	// Clamped: the channel is consumer-authored and can be re-seeded shorter while
	// the card is open, which would otherwise index past the end.
	const index = $derived(Math.min(cursor, tips.length - 1));
	const isLast = $derived(index >= tips.length - 1);

	// The tip STRING is derived before the effect reads it, and that is load-bearing.
	// Reading `tips[index]` inside the effect makes the parent's `model` derive the
	// dependency (a fresh object every `revision` bump) so the effect would re-run
	// on every unrelated commit, re-crossing the WASM boundary and rebuilding this
	// `aria-live` region per keystroke. A derived string short-circuits on `===`.
	const tip = $derived(tips[index] ?? '');

	// The tip is DOM, not text: `renderTip` returns a fragment the codec's own
	// `toDOM` built, so it is written in rather than interpolated.
	let bodyEl: HTMLDivElement | undefined = $state();
	$effect(() => {
		const el = bodyEl;
		if (el) el.replaceChildren(renderTip(tip, onError));
	});

	function advance(): void {
		if (isLast) onDismiss();
		else cursor = index + 1;
	}
</script>

<aside class="qm-tips" aria-label={t.strings.tipsLabel}>
	<!-- Advancing swaps the text under a button that keeps focus, so the region
	     announces rather than the change passing silently. -->
	<div class="qm-tips-body" aria-live="polite" bind:this={bodyEl}></div>
	<div class="qm-tips-foot">
		<!-- One tip is its own whole set, so a lone dot reports nothing the card does
		     not already show. -->
		{#if tips.length > 1}
			<div class="qm-tips-dots">
				{#each tips as _, i (i)}
					<button
						type="button"
						class="qm-tips-dot"
						aria-label={t.strings.tipsDot(i + 1, tips.length)}
						aria-current={i === index}
						onclick={() => (cursor = i)}
					></button>
				{/each}
			</div>
		{/if}
		<!-- ONE button, and its action is where the cursor stands: the set is walked,
		     and its end is the exit. -->
		<button type="button" class="qm-icon-btn qm-tips-action" onclick={advance}>
			{#if isLast}
				{t.strings.tipsDismiss} <Icon name="x" size={GLYPH} />
			{:else}
				{t.strings.tipsNext} <Icon name="chevron-right" size={GLYPH} />
			{/if}
		</button>
	</div>
</aside>

<style>
	/* ATTACHED to `main`, not a block beside it: a square top pulled up by the radius,
	 so its background fills the notches `main`'s rounded bottom corners cut and `main`
	 paints over the rest. The seam is `main`'s own bottom hairline, and the two read as
	 one block, which is what document-level guidance is: the main card's, not a card of
	 its own. Still in-flow, one hairline, no lift, no fill beyond the card recipe. It
	 reads as guidance rather than as a field by TONE and TYPE: the label rung in the
	 muted label colour; not by a badge or an accent. It mints no token of its own;
	 every value here is an existing dial.

	 The top inset takes the tuck back, so the space above the tip is the space below
	 the foot.

	 Leading is the reading rung, not the tight one the label SIZE would suggest: a
	 tip is a passage that wraps, and the two axes are independent. */
	.qm-tips {
		margin-top: calc(var(--_qm-radius) * -1);
		border: var(--_qm-border-width) solid var(--_qm-border);
		border-radius: 0 0 var(--_qm-radius) var(--_qm-radius);
		padding: calc(var(--_qm-space-3) + var(--_qm-radius)) var(--_qm-space-3) var(--_qm-space-3);
		background: var(--_qm-surface-raised);
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
		font-size: var(--_qm-text-label);
		line-height: var(--_qm-leading-body);
		color: var(--_qm-ink-label);
	}
	/* The rendered tip is injected DOM (the codec's `toDOM` output), so its element
	 styles are `:global`: the compiler never sees these tags in the markup. Three
	 rules restated from `core/codec/prose.css`, which is where they are argued and
	 which cannot reach here: its selectors are scoped to `.ProseMirror` and a tip is
	 not a view. The one deliberate divergence is the link, which takes no underline:
	 a tip is not editable, so a hidden `href` costs its reader nothing. */
	.qm-tips-body :global(p) {
		margin: 0;
	}
	.qm-tips-body :global(code) {
		font-family: var(--_qm-font-mono);
	}
	.qm-tips-body :global(a) {
		color: inherit;
	}
	.qm-tips-foot {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: var(--_qm-space-2);
	}
	.qm-tips-dots {
		display: flex;
		align-items: center;
		margin-right: auto;
	}
	/* Random access to the set, and the PITCH is the tap floor: 2.5.8's spacing
	 exception measures centre distance, which is the number the floor already fixes,
	 so a tighter row of dots buys nothing it does not immediately owe back. Target and
	 mark are therefore not one rectangle (the floor is the button, the dot is drawn
	 inside it), which is also why the hover reads on the mark rather than filling the
	 box a `.qm-icon-btn` would. */
	.qm-tips-dot {
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		min-width: var(--_qm-tap-min);
		min-height: var(--_qm-tap-min);
		border: none;
		background: transparent;
		cursor: pointer;
	}
	/* Three steps of ONE ink on the recede ladder (rest, hover, current), never a
	 second hue and never a size: a dot that grew would move the row it sits in. */
	.qm-tips-dot::before {
		content: '';
		width: 5px;
		height: 5px;
		border-radius: var(--_qm-radius-pill);
		background: currentColor;
		opacity: var(--_qm-opacity-idle);
		transition: opacity var(--_qm-duration-fast) var(--_qm-ease-reverse);
	}
	.qm-tips-dot:hover::before {
		opacity: var(--_qm-opacity-muted);
	}
	.qm-tips-dot[aria-current='true']::before {
		opacity: 1;
	}
	/* Box and disabled state come from `.qm-icon-btn` (controls.css); the foot's
	   button carries a label and so widens its inset and takes the meta type rung. */
	.qm-tips-action {
		padding: var(--_qm-space-half) var(--_qm-space-2);
		font-size: var(--_qm-text-label);
		color: var(--_qm-ink-label);
	}
</style>
