<!--
  A `boolean` field → a styled switch on bits-ui. (No boolean field exists in the
  reference quill, so this control is implemented to the schema contract but is
  UNTESTED against a real leaf — noted in the phase report.)

  Styled rather than a native checkbox because the native box is the worst parity
  offender: its face is UA-owned shadow DOM, so no dial reaches it and a themed
  surface would keep one un-themeable hole (issue #79 §3). The a11y comes with the
  primitive — Switch.Root renders `role="switch"` with its checked state and
  keyboard handling already wired.
-->
<script lang="ts">
	import { Switch } from 'bits-ui';
	import { syncedLocal } from './synced.svelte.js';

	interface Props {
		value: boolean | undefined;
		fallback?: boolean;
		/** Accessible name — the visual label is a bare span the switch can't reference. */
		label?: string;
		onCommit: (v: boolean) => void;
		testid?: string;
	}
	let { value, fallback, label, onCommit, testid }: Props = $props();

	// Local toggle state synced to `value`; own-toggles stay local, only an external
	// change reconciles back in (see `syncedLocal`). The primitive is driven
	// CONTROLLED (`checked` + `onCheckedChange`, never `bind:`) so reconciliation
	// stays the package's — a two-way bind hands the primitive a lane around it,
	// which is the #48 hazard in miniature.
	const local = syncedLocal(() => value ?? fallback ?? false);
</script>

<span class="qm-switch-wrap">
	<Switch.Root
		class="qm-switch"
		checked={local.value}
		aria-label={label}
		data-testid={testid}
		onCheckedChange={(v) => {
			local.value = v;
			onCommit(v);
		}}
	>
		<Switch.Thumb class="qm-switch-thumb" />
	</Switch.Root>
</span>

<style>
	/* A primitive renders its OWN element, which a scoped selector cannot reach —
	   styled through the wrapper with `:global`, the shape SourceView already uses
	   for CodeMirror's chrome. */
	.qm-switch-wrap :global(.qm-switch) {
		display: inline-flex;
		align-items: center;
		width: 1.75rem;
		height: 1rem;
		padding: var(--_qm-space-half);
		border: 1px solid var(--_qm-border);
		border-radius: var(--_qm-radius-pill);
		background: var(--_qm-surface-hover);
		cursor: pointer;
		transition: background 120ms ease;
	}
	.qm-switch-wrap :global(.qm-switch[data-state='checked']) {
		background: var(--_qm-accent);
		border-color: var(--_qm-accent);
	}
	/* Themed focus ring in place of the raw UA outline (SURFACES §Focus). */
	.qm-switch-wrap :global(.qm-switch:focus-visible) {
		outline: 2px solid var(--_qm-accent);
		outline-offset: 1px;
	}
	.qm-switch-wrap :global(.qm-switch-thumb) {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: var(--_qm-radius-pill);
		background: var(--_qm-surface);
		box-shadow: var(--_qm-shadow-popover);
		transition: translate 120ms ease;
	}
	.qm-switch-wrap :global(.qm-switch-thumb[data-state='checked']) {
		translate: 0.75rem;
	}
</style>
