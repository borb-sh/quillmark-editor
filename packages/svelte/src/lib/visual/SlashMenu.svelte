<!--
 The slash menu. The leaf's own surface, not the
 shell's: the trigger belongs to one caret in one leaf, so it is mounted by
 `ProseField` beside the view it reads from, unlike the ONE shell-owned format
 popover that follows whichever leaf is active.

 The MODEL is the codec's (`codec/slash.ts`: the trigger run, the query, the
 highlighted index, and what each pick does). This component draws it and nothing
 else. The keys are the leaf's keymap for the same reason: the caret stays in the
 contenteditable while the menu is open, so a focus-taking listbox would move the
 selection the insert is measured against. What is left here is mostly the POINTER's
 half: buttons that pick, and that swallow their own mousedown so the caret stays put.

 The highlight has ONE lane: `data-highlighted` marks whichever item the codec's
 index names, and a pointer entering an item MOVES that index rather than painting a
 second highlight the keyboard cannot reach (controls.css, the shared menu recipe).
 The keyboard's one claim here is the SCROLL: the arrows move an index, and only the
 chrome knows the port that index has to stay inside.
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

	let surface = $state<HTMLElement | undefined>();

	/** Keep the keyboard's cursor in the port: the arrows move an INDEX rather than a
	 *  focus, so a row the list scrolled past has nothing bringing it back. `nearest`
	 *  scrolls the least that works, and no ancestor the row is already visible in. */
	$effect(() => {
		void menu?.index;
		surface?.querySelector('[data-highlighted]')?.scrollIntoView({ block: 'nearest' });
	});

	/** Swallow the item's own mousedown: without it the browser focuses the item and
	 *  blurs the leaf, taking the trigger run's caret with it. */
	function keepFocus(e: MouseEvent): void {
		e.preventDefault();
	}
</script>

<Popover.Root bind:open>
	<Popover.Portal to={portalTarget}>
		<!-- Hung off the TRIGGER and flush against it: the anchor is the `/` itself
		     (`codec/slash.ts`), so the surface's top left corner sits at the line's bottom
		     edge under the character that opened the menu, and stays there as the query is
		     typed. Zero offset, because a gap reads as a surface floating near the caret
		     rather than one growing out of it. -->
		<Popover.Content
			customAnchor={menu?.anchor ?? null}
			side="bottom"
			align="start"
			trapFocus={false}
			sideOffset={0}
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
						bind:this={surface}
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
	   the surface across the card, a scroll for a filtered list that stays long, and the
	   FACE. Monospace, where the sibling menus are not: they offer VALUES of the document
	   and read as the prose around them, where these are commands, and the surface
	   already spells a literal in that face (the `code` mark, `codec/prose.css`). */
	.qm-slash-menu {
		min-width: 12rem;
		max-height: 16rem;
		overflow-y: auto;
		font-family: var(--_qm-font-mono);
	}
	/* An item is a row of text, not a glyph: the whole row is the target, and the label
	   is the accessible name with nothing beside it. A button is a button, so the UA's
	   own box is taken back; what is left is the shared item recipe. The FILL is not
	   taken back here: a scoped block is unlayered, so a reset would outrank the recipe's
	   highlight; the resting transparent is the recipe's own (controls.css). */
	.qm-slash-item {
		display: block;
		width: 100%;
		border: none;
		font: inherit;
		color: inherit;
		text-align: left;
		white-space: nowrap;
	}
</style>
