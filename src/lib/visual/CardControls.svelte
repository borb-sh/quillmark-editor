<!--
  Card controls (VISUAL_EDITOR_UIUX §"Card controls"), composable cards only.
  Right-aligned in the header: a hover-revealed move-up/move-down chevron pair
  (pinned while the card is active, each disabled at its edge), then an
  always-visible delete. Reorder is BUTTONS, not drag (V1). The hover/active
  reveal of `.qm-card-reorder` is owned by the parent card's CSS.
-->
<script lang="ts">
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import X from '@lucide/svelte/icons/x';
	import './controls.css'; // `.qm-icon-btn` — the shared glyph-button recipe

	interface Props {
		isFirst: boolean;
		isLast: boolean;
		onMoveUp: () => void;
		onMoveDown: () => void;
		onDelete: () => void;
		testidPrefix?: string;
	}
	let { isFirst, isLast, onMoveUp, onMoveDown, onDelete, testidPrefix }: Props = $props();

	/** Control-glyph size — the shared rule for the reorder/delete icons (AESTHETIC §Icons). */
	const GLYPH = 14;
</script>

<div class="qm-card-controls">
	<div class="qm-card-reorder">
		<button
			type="button"
			class="qm-icon-btn"
			title="Move up"
			disabled={isFirst}
			data-testid={testidPrefix ? `${testidPrefix}-up` : undefined}
			onclick={onMoveUp}><ChevronUp size={GLYPH} /></button
		>
		<button
			type="button"
			class="qm-icon-btn"
			title="Move down"
			disabled={isLast}
			data-testid={testidPrefix ? `${testidPrefix}-down` : undefined}
			onclick={onMoveDown}><ChevronDown size={GLYPH} /></button
		>
	</div>
	<button
		type="button"
		class="qm-icon-btn qm-card-delete"
		title="Delete card"
		data-testid={testidPrefix ? `${testidPrefix}-delete` : undefined}
		onclick={onDelete}><X size={GLYPH} /></button
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
		transition: opacity 0.12s ease;
	}
	/* Box and disabled state come from `.qm-icon-btn` (controls.css); only the ink
	   is this component's — the reorder pair recedes to the label tone, delete
	   carries the danger hue (scoped, so both beat the layered base). */
	.qm-icon-btn {
		color: var(--_qm-ink-label);
	}
	.qm-card-delete {
		color: var(--_qm-danger);
	}
</style>
