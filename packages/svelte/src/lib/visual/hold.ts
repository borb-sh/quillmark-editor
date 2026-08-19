// The gesture's anchor, which scroll anchoring is not: the platform picks its anchor off
// the layout, and what fills the viewport when a section collapses is that section's own
// content, whose top never moves. Measured in Chromium over the accordion's own
// mechanism: `overflow-anchor` on and off leave the pressed header in the same place,
// off the top of the fold.

import { flushSync } from 'svelte';

/** The box a scroll here would move: the nearest ancestor with overflow to spend, else
 *  the document. Which one that is belongs to the mounting site rather than to this
 *  surface — the editor owns no scrollport of its own, and scrolls the document where the
 *  host asked for no pane (VISUAL_EDITOR §"Focus and the preview bridge"). */
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
 * A disclosure closing one section as it opens another moves every box under the one it
 * closed, and the control the press landed on is one of them: a long section above a
 * short one carries its header off the top of the fold, out from under the pointer still
 * resting on it. The correction is the whole of the gesture's scroll — the surface holds
 * still rather than travelling, the press having already put its target on screen.
 *
 * The drift is measured rather than computed, so a scrollport the shorter content has
 * already clamped corrects by what is left to spend. `flushSync` is what makes one
 * measurement enough: the change lands in the DOM inside the call and the second read is
 * the settled layout rather than a frame of it. So the collapse it measures is instant,
 * an animating track still reading its start value one flush in — the same flush a
 * reveal's landing measures in (`Card.revealLeaf`).
 */
export function holdStill(anchor: HTMLElement | undefined, change: () => void): void {
	const port = anchor && scrollportOf(anchor);
	if (!port) return void change();
	const top = anchor.getBoundingClientRect().top;
	change();
	flushSync();
	port.scrollTop += anchor.getBoundingClientRect().top - top;
}
