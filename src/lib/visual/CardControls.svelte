<!--
  Card controls (VISUAL_EDITOR_UIUX §"Card controls"), composable cards only.
  Right-aligned in the header: a move-up/move-down chevron pair revealed while the
  pointer or the caret is in the card (each disabled at its edge), then an
  always-visible delete. Reorder is BUTTONS, not drag (V1). The card scopes that
  reveal, so its condition lives in the parent's CSS; the pair keeps the narrower
  guarantee here, that a focused chevron is a visible one.
-->
<script lang="ts">
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import X from '@lucide/svelte/icons/x';
	import './controls.css';

	interface Props {
		isFirst: boolean;
		isLast: boolean;
		onMoveUp: () => void;
		onMoveDown: () => void;
		onDelete: () => void;
	}
	let { isFirst, isLast, onMoveUp, onMoveDown, onDelete }: Props = $props();
	import { strings } from './context.js';
	const s = strings();

	/** Control-glyph size: the shared rule for the reorder/delete icons (AESTHETIC §Icons). */
	const GLYPH = 14;
</script>

<div class="qm-card-controls">
	<div class="qm-card-reorder">
		<button
			type="button"
			class="qm-icon-btn"
			title={s().cardMoveUp}
			disabled={isFirst}
			onclick={onMoveUp}><ChevronUp size={GLYPH} /></button
		>
		<button
			type="button"
			class="qm-icon-btn"
			title={s().cardMoveDown}
			disabled={isLast}
			onclick={onMoveDown}><ChevronDown size={GLYPH} /></button
		>
	</div>
	<button type="button" class="qm-icon-btn qm-card-delete" title={s().cardDelete} onclick={onDelete}
		><X size={GLYPH} /></button
	>
</div>

<style>
	.qm-card-controls {
		display: flex;
		align-items: center;
		gap: var(--_qm-space);
	}
	.qm-card-reorder {
		display: flex;
		gap: var(--_qm-space-half);
		opacity: 0;
		transition: opacity var(--_qm-duration-fast) var(--_qm-ease-reverse);
	}
	/* Opacity hides the pair without taking it out of the tab order, so the
	   component holds its own floor: a chevron that has focus is drawn, and its ring
	   with it. The card's reveal already covers this; the rule is here because the
	   hidden state is. */
	.qm-card-reorder:focus-within {
		opacity: 1;
	}
	/* Box and disabled state come from `.qm-icon-btn` (controls.css); only the ink
	 is this component's: the reorder pair recedes to the label tone, delete
	 carries the danger hue (scoped, so both beat the layered base). */
	.qm-icon-btn {
		color: var(--_qm-ink-label);
	}
	.qm-card-delete {
		color: var(--_qm-danger);
	}
</style>
