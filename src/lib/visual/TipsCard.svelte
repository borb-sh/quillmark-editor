<!--
  The ephemeral tips card (issue #71, VISUAL_EDITOR_UIUX §"Tips card"). Renders the
  `$ext.editor.tips` channel one tip at a time with an advance and a dismiss; both
  exits call `onDismiss`, which CLEARS the channel in the Document, so the card is
  gone and does not reappear.

  The cursor is LOCAL state, not the channel. Advancing writes nothing: a per-tip
  write would round-trip the boundary, re-derive the card tree, and dirty the
  document (firing a consumer's autosave) on what is a read gesture. Exactly one
  write happens, at dismissal — and this component unmounts with it, so the cursor
  needs no reset.
-->
<script lang="ts">
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import X from '@lucide/svelte/icons/x';
	import { renderTip } from './tips.js';

	interface Props {
		/** The narrowed channel (`tipsChannel`) — never empty; the parent gates on length. */
		tips: string[];
		/** Clear `$ext.editor.tips` — the merge-write that preserves the `title` sibling. */
		onDismiss: () => void;
		testid?: string;
	}
	let { tips, onDismiss, testid }: Props = $props();

	/** Control-glyph size — the shared rule (AESTHETIC §Icons), as CardControls. */
	const GLYPH = 14;

	let cursor = $state(0);
	// Clamped, not trusted: the channel is consumer-authored and can be re-seeded
	// shorter while the card is open, which would otherwise index past the end.
	const index = $derived(Math.min(cursor, tips.length - 1));
	const isLast = $derived(index >= tips.length - 1);

	// The tip is DOM, not text — `renderTip` returns a fragment the codec's own
	// `toDOM` built, so it is written in rather than interpolated.
	let bodyEl: HTMLDivElement | undefined = $state();
	$effect(() => {
		const el = bodyEl;
		const markdown = tips[index] ?? '';
		if (el) el.replaceChildren(renderTip(markdown));
	});

	function advance(): void {
		if (isLast) onDismiss();
		else cursor = index + 1;
	}
</script>

<aside class="qm-tips" aria-label="Editor tips" data-testid={testid ?? 'tips-card'}>
	<!-- Advancing swaps the text under a button that keeps focus, so the region
	     announces rather than the change passing silently. -->
	<div class="qm-tips-body" aria-live="polite" data-testid="tips-body" bind:this={bodyEl}></div>
	<div class="qm-tips-foot">
		{#if tips.length > 1}
			<span class="qm-tips-count" data-testid="tips-count">{index + 1} of {tips.length}</span>
		{/if}
		<button type="button" class="qm-tips-next" data-testid="tips-next" onclick={advance}>
			{isLast ? 'Got it' : 'Next'}
			{#if !isLast}<ChevronRight size={GLYPH} />{/if}
		</button>
		<button
			type="button"
			class="qm-tips-dismiss"
			title="Dismiss tips"
			data-testid="tips-dismiss"
			onclick={onDismiss}><X size={GLYPH} /></button
		>
	</div>
</aside>

<style>
	/* In-flow, like every other block in the column (SURFACES §Elevation): one
	   hairline, no shadow, no fill beyond the card recipe. It reads as guidance
	   rather than as a field by TONE and TYPE — the label rung in the muted label
	   colour — not by a badge or an accent (AESTHETIC §"Secondary text recedes").
	   It mints no token of its own; every value here is an existing dial. */
	.qm-tips {
		border: 1px solid var(--qm-border, #e2e2e2);
		border-radius: var(--_qm-radius);
		padding: var(--_qm-space-3) var(--_qm-space-4);
		background: var(--qm-card-bg, #fafafa);
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
		font-size: var(--_qm-text-label);
		color: var(--qm-label, #555);
	}
	/* The rendered tip is injected DOM (the codec's `toDOM` output), so its element
	   styles are `:global` — the compiler never sees these tags in the markup. */
	.qm-tips-body :global(p) {
		margin: 0;
	}
	.qm-tips-body :global(code) {
		font-family: ui-monospace, monospace;
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
	.qm-tips-count {
		margin-right: auto;
		font-size: var(--_qm-text-meta);
		color: var(--qm-ghost, #9a9a9a);
	}
	.qm-tips-next,
	.qm-tips-dismiss {
		display: inline-flex;
		align-items: center;
		gap: var(--_qm-space-half);
		border: 1px solid var(--qm-border, #d4d4d4);
		background: var(--qm-field-bg, #fff);
		border-radius: var(--_qm-radius-inner);
		cursor: pointer;
		line-height: 1;
		padding: var(--_qm-space-half) var(--_qm-space-2);
		font-size: var(--_qm-text-meta);
		color: #444;
	}
</style>
