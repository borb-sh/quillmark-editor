<!--
  A field's label plus its optional description affordance (issue #75b). The
  description is the schema field's `description` text, surfaced as an info marker
  beside the label — a native `title` tooltip (the same convention the card / array
  controls use) with the text also on `aria-label` so a screen reader announces it.
  Chrome only: it never gates and carries no required marker (issue #75a is a
  separate stance decision). Shared by {@link Field} (scalars, object, prose) and
  {@link ArrayField} so every control's label surfaces its description the same way.
-->
<script lang="ts">
	import Info from '@lucide/svelte/icons/info';

	interface Props {
		label: string;
		/** Schema `description`, or undefined — the affordance renders only when set. */
		description?: string;
		testid?: string;
	}
	let { label, description, testid }: Props = $props();
</script>

<span class="qm-field-label">
	{label}
	{#if description}
		<span
			class="qm-field-hint"
			title={description}
			aria-label={description}
			role="img"
			data-testid={testid ? `hint-${testid}` : undefined}><Info size={13} /></span
		>
	{/if}
</span>

<style>
	.qm-field-label {
		display: inline-flex;
		align-items: center;
		gap: var(--_qm-space-half);
		font-size: var(--_qm-text-label);
		font-weight: var(--_qm-weight-label);
		color: var(--qm-label, #555);
	}
	/* The info marker recedes to the label's muted tone; the tooltip carries the text. */
	.qm-field-hint {
		display: inline-flex;
		align-items: center;
		color: var(--qm-ghost, #9a9a9a);
		cursor: help;
	}
</style>
