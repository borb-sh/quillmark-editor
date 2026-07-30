<!--
 The schema `description` as a themed floating surface: the second that is READ
 rather than picked from, so it shares {@link FormatPopover}'s translucent recipe
 (SURFACES §Elevation) and portals into the nearest `[data-qm-root]` like every
 other floating surface, so a consumer's dials still reach it.

 It replaces the native `title` tooltip, which reached no dial, waited ~1s, could
 not be dismissed, and (the part that made it a hole rather than a blemish)
 DOES NOT EXIST ON TOUCH. Guidance the reference quill puts on nearly every field
 was, on a tablet, reachable only through a screen reader.

 Floating rather than inline under the label: the reference quill's descriptions run
 to a median of ~110 characters and past 250 at the tail: permanently in flow that
 is several wrapped lines under every field, which is the density the card is built
 to avoid. Measured, not assumed; a quill whose descriptions are all one short line
 would be better served inline.

 THE POPOVER IS CHROME, NOT THE ANNOUNCEMENT. Its content is `aria-hidden`: the
 description reaches assistive tech through the always-present parked node
 {@link FieldLabel} renders and the `aria-describedby` the control carries, which
 holds whether the surface is open or not. So no reader depends on a hover.

 Three ways in, one per input modality: hover (pointer), focus (keyboard), tap
 (touch); wired here rather than taken from `Tooltip`, whose trigger returns early
 on `pointerType === 'touch'` and closes on click (the exact gap being fixed).
-->
<script lang="ts">
	import { Popover } from 'bits-ui';
	import Info from '@lucide/svelte/icons/info';
	import './controls.css';

	interface Props {
		description: string;
		/** The field's label: the trigger's own name, so 30 info buttons on a card
		 * do not all announce alike. */
		label: string;
		/** The parked description node; the trigger points at it too, so a reader
		 * that lands HERE announces the guidance rather than only the field's own. */
		describedBy?: string;
	}
	let { description, label, describedBy }: Props = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | undefined>(undefined);
	/** The root to portal INTO: `document.body` would escape the consumer's dials
	 * along with the editor's subtree. `undefined` falls back to bits-ui's default. */
	const portalTarget = $derived(triggerEl?.closest<HTMLElement>('[data-qm-root]') ?? undefined);
</script>

<!-- The trigger is OURS, not `Popover.Trigger`, and the surface anchors to it:
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
	onpointerenter={(e) => {
		if (e.pointerType !== 'touch') open = true;
	}}
	onpointerleave={(e) => {
		if (e.pointerType !== 'touch') open = false;
	}}
	onpointerup={(e) => {
		// Touch only, and a TOGGLE: the one modality with no hover to leave and no
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
		<Popover.Content
			customAnchor={triggerEl ?? null}
			side="top"
			align="start"
			sideOffset={6}
			trapFocus={false}
			onOpenAutoFocus={(e: Event) => e.preventDefault()}
			onCloseAutoFocus={(e: Event) => e.preventDefault()}
		>
			<!-- The `child` snippet, the same shape {@link FormatPopover} takes and for
			 the same reason: the surface is the primitive's own content node, so the
			 dismissal animation is one the primitive waits on before unmounting
			 (SURFACES §Motion). `data-qm-root` because a portalled subtree is
			 detached for the derivation's purposes, and the marker is what applies
			 it; `wrapperProps` is floating-ui's positioning box, spread and never
			 styled. -->
			{#snippet child({ props, wrapperProps })}
				<div {...wrapperProps}>
					<div
						{...props}
						class="qm-hint-popover qm-popover-surface"
						data-qm-root
						aria-hidden="true"
					>
						{description}
					</div>
				</div>
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

<style>
	/* Chrome, type and ring are the glyph-button family's (`.qm-icon-btn` +
	 `.qm-focus-ring`, controls.css): this trigger is one more glyph button and
	 assembles none of that itself. What it does NOT take is the family's tap floor
	 and the fill that floor sizes, because this is the one glyph button that sits in
	 a LINE OF TEXT rather than in a row of its own: the floor is half again the label
	 rung's line box, so a target-sized paint box overhangs the line at each end by
	 most of the field's label-to-control gap: the hover fill landing on the input's
	 top border, the focus ring crossing it.

	 So the box is the GLYPH and the target is the `::after` below. A target is a
	 region of the screen, not a paint box, and separating them is what lets both be
	 correct at once: the row keeps the line box's height and the press keeps the
	 floor. Every other glyph button has a row to itself and keeps the floor as its
	 box.

	 It takes no fill either: the ink step below says hover, and the surface itself
	 opens on it. */
	.qm-field-hint {
		/* The marker recedes to the label's ghost tone; the surface carries the text. */
		color: var(--_qm-ink-ghost);
		/* Not the family's `pointer`: the glyph raises guidance, it does not act. */
		cursor: help;
		position: relative;
		min-width: 0;
		min-height: 0;
		padding: 0;
		background: none;
	}
	/* The tap floor, out of flow and centred on the glyph: WCAG 2.5.8 measures the
	 target, and this is it. Unpainted, so it enlarges the press and not the mark, and
	 out of the accessibility tree by construction: a pseudo-element has no node. */
	.qm-field-hint::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		width: var(--_qm-tap-min);
		height: var(--_qm-tap-min);
		transform: translate(-50%, -50%);
	}
	.qm-field-hint:hover,
	.qm-field-hint:focus-visible {
		color: var(--_qm-ink-meta);
	}
	/* The lift, the translucency, the blur and the scale-in come from
	 `.qm-popover-surface` (controls.css). This surface's own is a MEASURE: guidance
	 is prose, and prose past ~40 characters a line stops being scannable; plus the
	 inset and the meta type rung that keep it a note about a field rather than a
	 second field. */
	.qm-hint-popover {
		max-width: 22rem;
		padding: var(--_qm-space) var(--_qm-space-2);
		font-size: var(--_qm-text-meta);
		line-height: var(--_qm-leading-body);
		color: var(--_qm-ink-meta);
	}
</style>
