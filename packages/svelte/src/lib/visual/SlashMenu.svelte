<!--
 The slash menu (VISUAL_EDITOR_UIUX §"Slash menu"). The leaf's own surface, not the
 shell's: the trigger belongs to one caret in one leaf, so it is mounted by
 `ProseField` beside the view it reads from, unlike the ONE shell-owned format
 popover that follows whichever leaf is active.

 The MODEL is the codec's (`codec/slash.ts`: the trigger run, the query, the
 highlighted index, and what each pick does). This component draws it and nothing
 else. The keys are the leaf's keymap for the same reason: the caret stays in the
 contenteditable while the menu is open, so a focus-taking listbox would move the
 selection the insert is measured against. What is left here is the POINTER's half:
 buttons that pick, and that swallow their own mousedown so the caret stays put.

 The highlight has ONE lane: `data-highlighted` marks whichever item the codec's
 index names, and a pointer entering an item MOVES that index rather than painting a
 second highlight the keyboard cannot reach (controls.css, the shared menu recipe).
-->
<script lang="ts">
	import { Popover } from 'bits-ui';
	import type { FieldController, SlashState } from '../core/codec/index.js';
	import './controls.css';

	interface Props {
		/** The live menu, or `undefined` when closed: the codec's report channel. Named
		 *  `menu` rather than `state`, which is the rune's word in this file. */
		menu: SlashState | undefined;
		/** The leaf the trigger is in; `slashFocus` / `slashPick` drive it. */
		leaf: () => FieldController | undefined;
		/** The menu's accessible name. */
		label: string;
	}
	let { menu, leaf, label }: Props = $props();

	/** Raised whenever the codec reports offers. Mirrored into local state rather than
	 * derived, because the primitive OWNS this prop: its own dismissal layer (an
	 * outside press) writes it, and a derived it cannot write to is an error rather
	 * than a dismissal. The next report re-syncs, so the codec stays the authority on
	 * whether a run is live. */
	let open = $state(false);
	$effect(() => {
		open = !!menu && menu.items.length > 0;
	});

	/** The root to portal INTO, resolved from the leaf's own DOM so the menu lands
	 * inside whichever `[data-qm-root]` raised it and inherits the consumer's dials;
	 * `undefined` falls back to bits-ui's `document.body`. */
	const portalTarget = $derived(leaf()?.el.closest<HTMLElement>('[data-qm-root]') ?? undefined);

	/** Swallow the item's own mousedown: without it the browser focuses the item and
	 *  blurs the leaf, taking the trigger run's caret with it. */
	function keepFocus(e: MouseEvent): void {
		e.preventDefault();
	}
</script>

<Popover.Root bind:open>
	<Popover.Portal to={portalTarget}>
		<Popover.Content
			customAnchor={menu?.anchor ?? null}
			side="bottom"
			align="start"
			trapFocus={false}
			sideOffset={6}
			onOpenAutoFocus={(e: Event) => e.preventDefault()}
			onCloseAutoFocus={(e: Event) => e.preventDefault()}
		>
			{#snippet child({ props, wrapperProps, open: raised })}
				<div {...wrapperProps}>
					<!-- `role="group"`, not `listbox`: the caret never leaves the leaf, so no
					     item is ever the focused option an `option` promises, and the buttons
					     carry no roving tabindex. A labelled group of real buttons is the honest
					     description, and it is the shape the format popover already takes.
					     `inert` is the dismissal's other half: a surface on its way out is not
					     a thing to click, tab into, or read. -->
					<div
						{...props}
						class="qm-slash-menu qm-menu-surface"
						data-qm-root
						role="group"
						aria-label={label}
						inert={!raised}
					>
						{#each menu?.items ?? [] as item, i (item.id)}
							<button
								type="button"
								class="qm-menu-item qm-slash-item"
								data-highlighted={i === menu?.index ? '' : undefined}
								onmousedown={keepFocus}
								onclick={() => leaf()?.slashPick(item.id)}
								onpointerenter={() => leaf()?.slashFocus(item.id)}
							>
								{item.label}
							</button>
						{/each}
					</div>
				</div>
			{/snippet}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

<style>
	/* The surface, its inset, its item pad and the rung a highlight fills with are all
	   `.qm-menu-surface` / `.qm-menu-item` (controls.css): the same recipe the enum
	   listbox and the card stack's kind menu draw, because all three are lists picked
	   from. What is here is this menu's own: a measure, so a long label does not stretch
	   the surface across the card, and a scroll for a filtered list that stays long. */
	.qm-slash-menu {
		min-width: 12rem;
		max-height: 16rem;
		overflow-y: auto;
	}
	/* An item is a row of text, not a glyph: the whole row is the target, and the label
	   is the accessible name with nothing beside it. A button is a button, so the UA's
	   own box is taken back; what is left is the shared item recipe. */
	.qm-slash-item {
		display: block;
		width: 100%;
		border: none;
		background: none;
		font: inherit;
		color: inherit;
		text-align: left;
		white-space: nowrap;
	}
</style>
