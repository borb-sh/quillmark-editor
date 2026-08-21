<!--
  Card controls, composable cards only.
  Right-aligned in the header: a move-up/move-down chevron pair revealed while the
  pointer or the caret is in the card (each disabled at its edge), then delete.
  Reorder is buttons, not drag (V1). All three are chips (controls.css): all rest on the
  label tone, fill arrives on hover, and delete takes danger there. The card scopes
  that reveal, so its condition lives in the parent's CSS; the pair keeps the narrower
  guarantee here, that a focused chevron is a visible one.
-->
<script lang="ts">
	import { wording } from './strings.js';

	// The surface's words, ambient from the editor root; the package's English
	// off-tree, so this component renders standalone too.
	const t = wording();
	import Icon from './icons/Icon.svelte';
	import './controls.css';

	interface Props {
		isFirst: boolean;
		isLast: boolean;
		onMoveUp: () => void;
		onMoveDown: () => void;
		onDelete: () => void;
	}
	let { isFirst, isLast, onMoveUp, onMoveDown, onDelete }: Props = $props();
</script>

<div class="qm-card-controls">
	<div class="qm-card-reorder">
		<button
			type="button"
			class="qm-chip qm-focus-ring"
			title={t.strings.cardMoveUp}
			disabled={isFirst}
			onclick={onMoveUp}><Icon name="chevron-up" /></button
		>
		<button
			type="button"
			class="qm-chip qm-focus-ring"
			title={t.strings.cardMoveDown}
			disabled={isLast}
			onclick={onMoveDown}><Icon name="chevron-down" /></button
		>
	</div>
	<button
		type="button"
		class="qm-chip qm-card-delete qm-focus-ring"
		title={t.strings.cardDelete}
		onclick={onDelete}><Icon name="trash-2" /></button
	>
</div>

<style>
	.qm-card-controls {
		display: flex;
		align-items: center;
		gap: var(--_qm-space-half);
	}
	.qm-card-reorder {
		display: flex;
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
	/* Squares: the chip's inline pad is for a label. Width and height are one rung
	 so the hover fill is a square and the glyph sits in the middle. */
	.qm-card-controls button {
		width: var(--_qm-tap-min);
		height: var(--_qm-tap-min);
		padding: 0;
	}
	/* Hover fill comes from `.qm-chip` (controls.css); the ink is this component's. All
	 three rest on the label tone, so the cluster reads as one row of controls and the
	 hue is what the pointer buys. Danger is a state and not a resting colour: mixed
	 toward the surface it lands at 1.8:1 against it, under WCAG 1.4.11's 3:1 floor for
	 the visual that identifies a control, and this one's visual is the glyph alone. */
	.qm-card-delete:hover,
	.qm-card-delete:focus-visible {
		color: var(--_qm-danger);
	}
</style>
