// The gesture's anchor, which scroll anchoring is not: the platform picks its anchor off
// the layout, and what fills the viewport as a section collapses is that section's own
// content, whose top never moves.

import { flushSync } from 'svelte';

/** The editor owns no scrollport of its own — a host that asked for no pane scrolls the
 *  document instead — so which box a scroll moves is the mounting site's answer, found by
 *  walking for it (VISUAL_EDITOR §"Focus and the preview bridge"). */
function scrollportOf(el: HTMLElement): HTMLElement | undefined {
	for (let p = el.parentElement; p; p = p.parentElement) {
		const overflow = getComputedStyle(p).overflowY;
		if ((overflow === 'auto' || overflow === 'scroll') && p.scrollHeight > p.clientHeight) return p;
	}
	return (document.scrollingElement as HTMLElement | null) ?? undefined;
}

/**
 * Run `change` with `anchor` left on the viewport line it stands on now.
 *
 * A section closing above the pressed control carries that control off the fold, out from
 * under the pointer still resting on it. Holding it still is the whole of the gesture's
 * scroll: the press has already put its target on screen, so there is nowhere to travel.
 *
 * The drift is measured rather than computed, so a scrollport the shorter content has
 * already clamped corrects by what is left to spend. `flushSync` is what makes one
 * measurement enough: the change lands in the DOM inside the call, and the second read is
 * the settled layout rather than a frame of it — so the collapse it measures is instant,
 * an animating track still reading its start value one flush in (`Card.revealLeaf` reads
 * the same flush).
 */
export function holdStill(anchor: HTMLElement | undefined, change: () => void): void {
	const port = anchor && scrollportOf(anchor);
	if (!port) return void change();
	const top = anchor.getBoundingClientRect().top;
	change();
	flushSync();
	port.scrollTop += anchor.getBoundingClientRect().top - top;
}
