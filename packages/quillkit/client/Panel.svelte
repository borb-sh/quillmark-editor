<!--
  A panel over the workspace: what studio says at length, said somewhere that is not the
  screen. Studio spends the whole viewport on the two mounts, so anything wanting a
  paragraph either takes height from them permanently or takes none at all and is opened;
  this is the second (STUDIO §"Opened, not stood on").

  Native `<dialog>`, so the modal behaviours are the platform's: the top layer, the focus
  trap, the escape key, and the inertness of everything behind it. What is written here is
  the scrim's tone and the plate's box, since the preset carries no dialog — its shell is
  the pinned bands and the split, and a panel stands over those rather than among them.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** What the panel is: its heading, and what announces it. */
		title: string;
		open: boolean;
		/** Called for every way it closes, the escape key and the scrim included, so the
		 *  caller's flag follows the element rather than racing it. */
		onClose: () => void;
		children: Snippet;
	}

	let { title, open, onClose, children }: Props = $props();

	let el = $state.raw<HTMLDialogElement | undefined>();

	// The element is the state and the prop follows it: `showModal` is what puts a dialog
	// in the top layer, and no attribute does it.
	$effect(() => {
		if (!el) return;
		if (open && !el.open) el.showModal();
		else if (!open && el.open) el.close();
	});
</script>

<!-- The dialog fills the viewport and centres the plate, so a click that lands on the
     dialog itself landed outside the plate: one target test, and no element in the
     markup whose only job is to catch it. -->
<dialog
	bind:this={el}
	class="panel"
	aria-label={title}
	onclose={onClose}
	onclick={(e) => e.target === el && onClose()}
>
	<div class="qm-panel plate">
		<header class="head">
			<h2 class="qm-label">{title}</h2>
			<button class="qm-control" type="button" data-testid="panel-close" onclick={onClose}
				>Close</button
			>
		</header>
		{@render children()}
	</div>
</dialog>

<style>
	/* The dialog is the room, not the plate: it takes the viewport so the scrim is
	   clickable everywhere, and the plate inside it is what has a size. The element's own
	   box is stripped of the shape a dialog comes with. */
	.panel {
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: 100%;
		max-width: 100%;
		height: 100%;
		max-height: 100%;
		padding: var(--qmh-space-4);
		border: none;
		background: none;
		overflow: hidden;
	}

	.panel::backdrop {
		/* mint: a scrim is a tone between two planes, and the host scale carries no
		   opacity rung — the recede ladder is the package's own. */
		background: color-mix(in srgb, var(--qmh-page) 80%, transparent);
	}

	/* The plate holds to a measure and to the room it is in, and gives its overflow to
	   whatever the caller put inside: a panel scrolling as one body moves its heading off
	   the top, which is the line saying what is being read. */
	.plate {
		display: flex;
		flex-direction: column;
		gap: var(--qmh-space-3);
		width: 100%;
		max-width: var(--st-panel);
		max-height: 100%;
		min-height: 0;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--qmh-space-4);
	}
</style>
