<!--
 A `boolean` field → a styled switch on bits-ui. No boolean field exists in the
 reference quill, so this control is implemented to the schema contract and is
 UNTESTED against a real leaf.

 Styled rather than a native checkbox: the native box's face is UA-owned shadow
 DOM, so no dial reaches it. The a11y comes with the primitive:
 Switch.Root renders `role="switch"` with its checked state and keyboard handling.
-->
<script lang="ts">
	import { Switch } from 'bits-ui';
	import { syncedLocal } from './synced.svelte.js';
	import './controls.css';

	interface Props {
		value: boolean | undefined;
		fallback?: boolean;
		/** Accessible name for a switch NOTHING else names: an object property, whose
		 * name is the field label plus the property's. A field's own switch takes `id`
		 * instead and is named by the `<label for>` beside it. */
		label?: string;
		/** `<label for>` target. `Switch.Root` renders a `<button>`, which IS labelable,
		 * so the click a label forwards toggles the switch: correct for this control,
		 * and single-fire: the label is a sibling, not a wrapper, so there is no second
		 * click bubbling back up to be re-dispatched. */
		id?: string;
		/** The parked `description` (FieldLabel): announced after the name. */
		describedBy?: string;
		onCommit: (v: boolean) => void;
	}
	let { value, fallback, label, id, describedBy, onCommit }: Props = $props();

	// Local toggle state synced to `value`; own-toggles stay local, only an external
	// change reconciles back in (see `syncedLocal`). The primitive is driven
	// CONTROLLED (`checked` + `onCheckedChange`, never `bind:`) so reconciliation
	// stays the package's: a two-way bind hands the primitive a lane around it,
	// which repeats the reconciliation hazard in miniature.
	const local = syncedLocal(() => value ?? fallback ?? false);
</script>

<span class="qm-switch-wrap">
	<Switch.Root
		class="qm-switch qm-focus-ring"
		checked={local.value}
		{id}
		aria-label={id ? undefined : label}
		aria-describedby={describedBy}
		onCheckedChange={(v) => {
			local.value = v;
			onCommit(v);
		}}
	>
		<Switch.Thumb class="qm-switch-thumb" />
	</Switch.Root>
</span>

<style>
	/* A primitive renders its OWN element, which a scoped selector cannot reach:
	 styled through the wrapper with `:global`. */
	.qm-switch-wrap :global(.qm-switch) {
		display: inline-flex;
		align-items: center;
		width: 1.75rem;
		height: 1rem;
		padding: var(--_qm-space-half);
		border: var(--_qm-border-width) solid var(--_qm-border);
		border-radius: var(--_qm-radius-pill);
		background: var(--_qm-surface-hover);
		cursor: pointer;
		transition: background var(--_qm-duration-fast) ease;
	}
	.qm-switch-wrap :global(.qm-switch[data-state='checked']) {
		background: var(--_qm-accent);
		border-color: var(--_qm-accent);
	}
	/* The focus ring rides `.qm-focus-ring` on the switch (controls.css). */
	/* The thumb reads on tone alone: the base surface over the track's `hover` rung
	 unchecked, and over `--_qm-accent` checked. No edge of its own: a hairline around
	 a 12px pill is a second box inside the track's (SURFACES §Elevation). */
	.qm-switch-wrap :global(.qm-switch-thumb) {
		width: 0.75rem;
		height: 0.75rem;
		border-radius: var(--_qm-radius-pill);
		background: var(--_qm-surface);
		transition: translate var(--_qm-duration-fast) ease;
	}
	.qm-switch-wrap :global(.qm-switch-thumb[data-state='checked']) {
		translate: 0.75rem;
	}
</style>
