// The card stack's reorder trip: a slot's position ↔ position in a
// keyed list, the one row of the mechanism table no CSS rule can serve, because the
// two frames belong to different elements. Svelte's `animate:` supplies the halves CSS
// cannot see (the rects either side of the reconciliation) and WAAPI paints the trip,
// the same seam `core/bloom.ts` takes to keep a duration in the derivation while a
// script runs the animation.

import type { AnimationConfig } from 'svelte/animate';

/** Marks this module's runs, so a second reorder cancels the first rather than layering
 *  a second transform over it. */
const RUN_ID = 'qm-reorder';

/** A duration rung off `style`, in ms; `undefined` where the derivation is out of reach
 *  (an unstyled root, or jsdom, where `getComputedStyle` reports custom properties as
 *  empty). No rung, no motion: a fallback here would be the scale restated in the one
 *  place `check:style` cannot read. */
function rungMs(style: CSSStyleDeclaration, rung: string): number | undefined {
	const raw = style.getPropertyValue(rung).trim();
	const n = Number.parseFloat(raw);
	if (!Number.isFinite(n)) return undefined;
	return raw.endsWith('ms') ? n : n * 1000;
}

/**
 * Slide a keyed slot from where it was to where it now is.
 *
 * `armed` is why this is the reorder and not every reconcile: `animate:` fires wherever
 * a slot's rect moved, and a card growing under the caret moves every slot below it,
 * which is a layout change with no trip in it and one that would draw those slots over
 * the content that displaced them for the length of the run. So the reorder command
 * arms the gesture and the frame it lands in disarms it, which is the admission test
 * read off the endpoints: two positions in the list, not two positions on the page.
 *
 * Both endpoints are rest states, so the curve is `--_qm-ease-reverse` (a second click
 * lands mid-slide) and the rung is `slow` (the trip moves the stack around it).
 */
export function reorder(
	node: HTMLElement,
	{ from, to }: { from: DOMRect; to: DOMRect },
	armed: () => boolean
): AnimationConfig {
	// The returned config is empty by design, in both exits and the run below: Svelte
	// samples a config's keyframes through a JS easing function, and this curve is a
	// rung the derivation mints and `check:style` holds.
	if (!armed() || typeof node.animate !== 'function') return {};
	const style = getComputedStyle(node);
	const duration = rungMs(style, '--_qm-duration-slow');
	const easing = style.getPropertyValue('--_qm-ease-reverse').trim();
	if (duration === undefined || !easing) return {};
	for (const running of node.getAnimations()) if (running.id === RUN_ID) running.cancel();
	node.animate(
		[
			{ transform: `translate(${from.left - to.left}px, ${from.top - to.top}px)` },
			{ transform: 'none' }
		],
		{ duration, easing, id: RUN_ID }
	);
	return {};
}
