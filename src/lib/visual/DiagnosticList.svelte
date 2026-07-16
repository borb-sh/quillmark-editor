<!--
  Inline diagnostic display (VISUAL_EDITOR §Diagnostics), severity-styled via
  CSS vars, NON-GATING — purely additive, never disables the field it sits
  under. Shared by `Field.svelte` (a scalar/prose field) and `Card.svelte` (the
  body leaf, which has no `Field.svelte` wrapper), so a card's body diagnostics
  render the same way a field's do.
-->
<script lang="ts">
	import type { Diagnostic } from '../core/index.js';

	interface Props {
		diagnostics: Diagnostic[] | undefined;
		testid?: string;
	}
	let { diagnostics, testid }: Props = $props();
</script>

{#if diagnostics && diagnostics.length}
	<div class="qm-diag-list" data-testid={testid}>
		{#each diagnostics as d, i (i)}
			<span class="qm-diag-line" data-severity={d.severity}>{d.message}</span>
		{/each}
	</div>
{/if}

<style>
	.qm-diag-list {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}
	.qm-diag-line {
		font-size: 0.72rem;
		color: var(--qm-diag-warning, #b25000);
	}
	.qm-diag-line[data-severity='error'] {
		color: var(--qm-diag-error, #c5221f);
	}
</style>
