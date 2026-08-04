<!--
 A table island's line menu (VISUAL_EDITOR_UIUX §"Table island"). The island raises
 it from a row or column handle; this draws it and hands the pick straight back.

 The channel carries VERBS rather than an address (`codec/table-view.ts`
 §`IslandMenuState`): a row index inside one island is not a coordinate the leaf's
 surface speaks, and the menu belongs to the island that raised it. So this
 component knows the label, the items, and the rect, and nothing about tables.

 A real `DropdownMenu`, not the popover the slash menu draws: the caret is NOT in
 text here (a handle was pressed), so the menu is the thing to navigate. The
 primitive brings the roving focus, the typeahead, Escape and outside-press
 dismissal, and the `menu`/`menuitem` roles that make those honest. Its trigger is
 the island's own vanilla button, which is why the anchor is a rect rather than a
 `DropdownMenu.Trigger`.
-->
<script lang="ts">
	import { DropdownMenu } from 'bits-ui';
	import Check from '@lucide/svelte/icons/check';
	import type { IslandMenuState } from '../core/codec/index.js';
	import './controls.css';

	interface Props {
		/** The raised menu, or `undefined` when none is: the codec's report channel. */
		menu: IslandMenuState | undefined;
		/** The root to portal into, so the menu inherits the consumer's dials. */
		root: () => HTMLElement | undefined;
	}
	let { menu, root }: Props = $props();

	/** Mark size: the shared control-glyph rule (AESTHETIC §Icons). */
	const GLYPH = 14;

	// The island owns whether a menu is live; the primitive owns its own dismissals
	// (Escape, an outside press), so a close it decides is reported back rather than
	// left to disagree with the handle's `aria-expanded`.
	let open = $state(false);
	$effect(() => {
		open = !!menu;
	});

	/** A floating-ui virtual anchor over the handle's rect: a NEW object per rect, so
	 * bits-ui sees the change and repositions (a mutated one would not). */
	const anchor = $derived.by(() => {
		const r = menu?.rect;
		if (!r) return null;
		return {
			getBoundingClientRect: () => new DOMRect(r.left, r.top, r.right - r.left, r.bottom - r.top)
		};
	});
</script>

<DropdownMenu.Root
	bind:open
	onOpenChange={(next: boolean) => {
		if (!next) menu?.close();
	}}
>
	<DropdownMenu.Portal to={root()}>
		<DropdownMenu.Content customAnchor={anchor} side="bottom" align="start" sideOffset={4}>
			<!-- Portalled out of the island but INTO the editor's root, and carrying the
			     marker itself: floating is still a detached subtree to the derivation, like
			     the format popover and the enum listbox. -->
			<div class="qm-table-menu qm-menu-surface" data-qm-root aria-label={menu?.label}>
				{#each menu?.items ?? [] as item (item.id)}
					<DropdownMenu.Item
						class="qm-menu-item qm-table-menu-item"
						onSelect={() => menu?.run(item.id)}
					>
						<span class="qm-table-menu-mark">
							{#if item.checked}<Check size={GLYPH} />{/if}
						</span>
						{item.label}
					</DropdownMenu.Item>
				{/each}
			</div>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
	/* The surface, its inset, its item pad and the rung a highlight fills with are all
	   `.qm-menu-surface` / `.qm-menu-item` (controls.css): the same recipe the enum
	   listbox, the card-kind menu and the slash menu draw. What is here is this menu's
	   own: a measure, and the column that holds the alignment mark. */
	.qm-table-menu {
		min-width: 12rem;
	}
	/* Every row reserves the mark's width whether it carries one or not, so the labels
	   line up and a checked item does not shift the row it is in. The alignment set is
	   the only exclusive choice in the menu, and this column is how it reads as one.

	   Reached through `:global` under this component's own surface: the class goes to
	   the primitive as a STRING, which never picks up the scoping hash (the format
	   popover's `child` snippet is the other way out of the same problem). */
	.qm-table-menu :global(.qm-table-menu-item) {
		display: flex;
		align-items: center;
		gap: var(--_qm-space);
		white-space: nowrap;
	}
	.qm-table-menu :global(.qm-table-menu-mark) {
		display: inline-flex;
		width: 0.875rem;
	}
</style>
