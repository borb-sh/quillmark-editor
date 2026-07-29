<!--
  The schema `description` as a themed floating surface — the third and last
  (SURFACES §Elevation), after the enum listbox and {@link FormatPopover}, and it
  portals into the nearest `[data-qm-root]` like both of them so a consumer's dials
  still reach it.

  It replaces the native `title` tooltip, which reached no dial, waited ~1s, could
  not be dismissed, and — the part that made it a hole rather than a blemish —
  DOES NOT EXIST ON TOUCH. Guidance the reference quill puts on nearly every field
  was, on a tablet, reachable only through a screen reader.

  Floating rather than inline under the label: the reference quill's descriptions run
  to a median of ~110 characters and past 250 at the tail — permanently in flow that
  is several wrapped lines under every field, which is the density the card is built
  to avoid. Measured, not assumed; a quill whose descriptions are all one short line
  would be better served inline.

  THE POPOVER IS CHROME, NOT THE ANNOUNCEMENT. Its content is `aria-hidden`: the
  description reaches assistive tech through the always-present parked node
  {@link FieldLabel} renders and the `aria-describedby` the control carries, which
  holds whether the surface is open or not. So no reader depends on a hover.

  Three ways in, one per input modality — hover (pointer), focus (keyboard), tap
  (touch) — wired here rather than taken from `Tooltip`, whose trigger returns early
  on `pointerType === 'touch'` and closes on click: the exact gap being fixed.
-->
<script lang="ts">
	import { Popover } from 'bits-ui';
	import Info from '@lucide/svelte/icons/info';
	import './controls.css';

	interface Props {
		description: string;
		/** The field's label — the trigger's own name, so 30 info buttons on a card
		 * do not all announce alike. */
		label: string;
		/** The parked description node; the trigger points at it too, so a reader
		 * that lands HERE announces the guidance rather than only the field's own. */
		describedBy?: string;
		testid?: string;
	}
	let { description, label, describedBy, testid }: Props = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | undefined>(undefined);
	/** The root to portal INTO — `document.body` would escape the consumer's dials
	 *  along with the editor's subtree. `undefined` falls back to bits-ui's default. */
	const portalTarget = $derived(triggerEl?.closest<HTMLElement>('[data-qm-root]') ?? undefined);
</script>

<!-- The trigger is OURS, not `Popover.Trigger`, and the surface anchors to it —
     the same shape {@link FormatPopover} uses. The primitive's trigger owns a click
     TOGGLE, which fights every one of the three openings below: a mouse click after
     a hover-open would close, and on touch the focus that precedes the click opens
     it just in time for the click to close it again. -->
<button
	bind:this={triggerEl}
	type="button"
	class="qm-field-hint qm-icon-btn qm-focus-ring"
	aria-label="{label} guidance"
	aria-expanded={open}
	aria-describedby={describedBy}
	data-testid={testid}
	onpointerenter={(e) => {
		if (e.pointerType !== 'touch') open = true;
	}}
	onpointerleave={(e) => {
		if (e.pointerType !== 'touch') open = false;
	}}
	onpointerup={(e) => {
		// Touch only, and a TOGGLE — the one modality with no hover to leave and no
		// blur on the way out. A mouse press falls through to hover, which already
		// has it open and will close it on the way off.
		if (e.pointerType === 'touch') open = !open;
	}}
	onfocus={(e) => {
		// Keyboard arrival only. A pointer press focuses the button too, and opening
		// on that would re-open what the tap just toggled shut; `:focus-visible` is
		// the UA's own answer to which arrival this was.
		if (e.currentTarget.matches(':focus-visible')) open = true;
	}}
	onblur={() => (open = false)}
	onkeydown={(e) => {
		if (e.key === 'Escape' && open) {
			// Dismissable, which the `title` tooltip never was. Stopped here so the
			// key does not travel on to a card- or editor-level Escape.
			e.stopPropagation();
			open = false;
		}
	}}><Info size={13} aria-hidden="true" /></button
>

<Popover.Root bind:open>
	<Popover.Portal to={portalTarget}>
		{#if open && triggerEl}
			<Popover.Content
				customAnchor={triggerEl}
				side="top"
				align="start"
				sideOffset={6}
				trapFocus={false}
				onOpenAutoFocus={(e: Event) => e.preventDefault()}
				onCloseAutoFocus={(e: Event) => e.preventDefault()}
			>
				<!-- `data-testid` lives on THIS div (ours, not bits-ui's own prop-merged
				     wrapper) so its presence never depends on bits-ui's passthrough.
				     `data-qm-root` because a portalled subtree is detached for the
				     derivation's purposes, and the marker is what applies it. -->
				<div
					class="qm-hint-popover"
					data-qm-root
					aria-hidden="true"
					data-testid={testid ? `${testid}-popover` : undefined}
				>
					{description}
				</div>
			</Popover.Content>
		{/if}
	</Popover.Portal>
</Popover.Root>

<style>
	/* Chrome, type, tap floor, hover fill and ring are the glyph-button family's
	   (`.qm-icon-btn` + `.qm-focus-ring`, controls.css) — this trigger is one more
	   glyph button and assembles none of that itself. Three facts are its own. */
	.qm-field-hint {
		/* The marker recedes to the label's ghost tone; the surface carries the text. */
		color: var(--_qm-ink-ghost);
		/* Not the family's `pointer`: the glyph raises guidance, it does not act. */
		cursor: help;
		/* Off the row's rhythm. The tap floor is a target, not a line box, and it
		   would otherwise set the height of every label row in the card — the array
		   header, which stands a real button beside its label, is the one row that
		   genuinely is that tall. */
		margin-block: calc(var(--_qm-tap-min) / -2);
	}
	.qm-field-hint:hover,
	.qm-field-hint:focus-visible {
		color: var(--_qm-ink-meta);
	}
	/* Same recipe as the other two floating surfaces (SURFACES §Elevation): the
	   translucent theme surface, a backdrop blur, one hairline, one shadow. What this
	   one adds is a MEASURE — guidance is prose, and prose past ~40 characters a line
	   stops being scannable. */
	.qm-hint-popover {
		max-width: 22rem;
		padding: var(--_qm-space) var(--_qm-space-2);
		background: var(--_qm-surface-popover);
		backdrop-filter: blur(var(--_qm-blur));
		-webkit-backdrop-filter: blur(var(--_qm-blur));
		border: var(--_qm-border-width) solid var(--_qm-border);
		border-radius: var(--_qm-radius);
		box-shadow: var(--_qm-shadow-popover);
		font-size: var(--_qm-text-meta);
		line-height: var(--_qm-leading-body);
		color: var(--_qm-ink-meta);
		animation: qm-hint-in var(--_qm-duration-fast) ease-out;
	}
	/* Scale-in on mount; the `{#if open}` guard mounts fresh each raise, so the
	   keyframe runs once per appearance. Animates the inner pill only — never the
	   outer floating-ui wrapper, whose transform positions it. */
	@keyframes qm-hint-in {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.qm-hint-popover {
			animation: none;
		}
	}
</style>
