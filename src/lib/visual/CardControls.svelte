<!--
  Card controls (VISUAL_EDITOR_UIUX §"Card controls"), composable cards only.
  Right-aligned in the header: a hover-revealed move-up/move-down chevron pair
  (pinned while the card is active, each disabled at its edge), then an
  always-visible delete. Reorder is BUTTONS, not drag (V1). The hover/active
  reveal of `.qm-card-reorder` is owned by the parent card's CSS.
-->
<script lang="ts">
	interface Props {
		isFirst: boolean;
		isLast: boolean;
		onMoveUp: () => void;
		onMoveDown: () => void;
		onDelete: () => void;
		testidPrefix?: string;
	}
	let { isFirst, isLast, onMoveUp, onMoveDown, onDelete, testidPrefix }: Props = $props();
</script>

<div class="qm-card-controls">
	<div class="qm-card-reorder">
		<button
			type="button"
			class="qm-ctrl"
			title="Move up"
			disabled={isFirst}
			data-testid={testidPrefix ? `${testidPrefix}-up` : undefined}
			onclick={onMoveUp}>▲</button
		>
		<button
			type="button"
			class="qm-ctrl"
			title="Move down"
			disabled={isLast}
			data-testid={testidPrefix ? `${testidPrefix}-down` : undefined}
			onclick={onMoveDown}>▼</button
		>
	</div>
	<button
		type="button"
		class="qm-ctrl qm-card-delete"
		title="Delete card"
		data-testid={testidPrefix ? `${testidPrefix}-delete` : undefined}
		onclick={onDelete}>✕</button
	>
</div>

<style>
	.qm-card-controls {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}
	.qm-card-reorder {
		display: flex;
		gap: 0.15rem;
		opacity: 0;
		transition: opacity 0.12s ease;
	}
	.qm-ctrl {
		border: 1px solid var(--qm-border, #d4d4d4);
		background: var(--qm-field-bg, #fff);
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.7rem;
		line-height: 1;
		padding: 0.18rem 0.32rem;
		color: #444;
	}
	.qm-ctrl:disabled {
		opacity: 0.3;
		cursor: default;
	}
	.qm-card-delete {
		color: #b23838;
	}
</style>
