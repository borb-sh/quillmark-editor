<!--
  A field's label plus its guidance chrome (issue #75). Two non-gating label
  decorations:
    • a persistent required `*` (issue #75a) when the field has no `default:` — the
      "Unendorsed"/must_fill set (DOCUMENT_MODEL: no separate `required` axis). Its
      accessible name is "required", so a screen reader announces the word, not the glyph;
    • the `description` (issue #75b) as an info marker: a `title` tooltip on hover, the
      text also on `aria-label` (role="img") so a screen reader announces it.
  Shared by {@link Field} (scalars, object, prose) and {@link ArrayField} so every
  control's label decorates the same way.
-->
<script lang="ts">
	import Info from '@lucide/svelte/icons/info';

	interface Props {
		label: string;
		/** No-default field → a persistent required `*` (issue #75a). */
		required?: boolean;
		/** Schema `description`, or undefined — the affordance renders only when set. */
		description?: string;
		testid?: string;
	}
	let { label, required, description, testid }: Props = $props();
</script>

<span class="qm-field-label">
	<span>{label}</span>
	{#if required}
		<span
			class="qm-field-required"
			aria-label="required"
			data-testid={testid ? `required-${testid}` : undefined}>*</span
		>
	{/if}
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
		color: var(--_qm-ink-label);
	}
	/* Required marker: a quiet accent glyph, not an alarm — required-ness is guidance,
	   the document still edits and renders unmet. */
	.qm-field-required {
		display: inline-flex;
		align-items: center;
		color: var(--_qm-danger);
		line-height: 1;
	}
	/* The info marker recedes to the label's muted tone; the tooltip carries the text. */
	.qm-field-hint {
		display: inline-flex;
		align-items: center;
		color: var(--_qm-ink-ghost);
		cursor: help;
	}
</style>
