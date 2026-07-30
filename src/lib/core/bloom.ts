// The correlation bloom: a soft accent wash that rises over a target and decays to
// nothing. The editor↔preview address is an EVENT, not a state: the preview claims
// to be the rendered output, so it carries no resting ink, and a highlight that
// outlives the hop that caused it is ink the document did not ask for. Both
// directions land here: the preview's field boxes bloom themselves (they are already
// empty rects over the page), an editor leaf blooms a transient child over its
// surface.
//
// OPACITY is the animated property, never the colour. The wash's alpha is a peak
// fixed by `--_qm-accent-wash`, so interpolating 0→1→0 keeps the scale in CSS where
// `color-mix` resolves, instead of in keyframe values a script would have to
// pre-resolve and re-resolve on a theme change.
//
// `elapsed` is what lets a bloom survive the element that carries it. `overlay.ts`
// rebuilds every box on refresh and the playground recompiles 120ms after each
// keystroke burst, so a bloom re-STARTED per rebuild would re-bloom continuously
// while the user writes; a rebuilt node resumes at the offset the old one reached.

/** Marks a transient wash node: the wash is decoration, never a hit target. */
const BLOOM_CLASS = 'qm-bloom';

const WASH = 'var(--_qm-accent-wash)';
/** The dwell used when the derivation is out of reach (an unstyled root, or jsdom,
 *  where `getComputedStyle` reports custom properties as empty). A fallback is the
 *  absence of the scale, not a copy of it. */
const FALLBACK_MS = 1100;

// Rise fast, hold, then leave slowly: a highlighter's decay, not a linear fade. A
// keyframe's easing governs the segment that STARTS at it. Under reduced motion the
// ramps are dropped entirely: the wash holds at full for a beat and cuts, which
// still answers "here" with nothing to track.
const FRAMES: Keyframe[] = [
	{ opacity: 0, offset: 0, easing: 'ease-out' },
	{ opacity: 1, offset: 0.08 },
	{ opacity: 1, offset: 0.3, easing: 'ease-in' },
	{ opacity: 0, offset: 1 }
];
const FRAMES_REDUCED: Keyframe[] = [{ opacity: 1 }, { opacity: 1 }];

/** The resting state a bloom animates from and back to: the wash, held at zero. */
export function primeWash(el: HTMLElement): void {
	Object.assign(el.style, { background: WASH, opacity: '0' });
}

/** What one bloom runs: resolved from the scale, and from the viewer's motion
 *  preference. */
export interface BloomTiming {
	duration: number;
	frames: Keyframe[];
}

/**
 * Resolve the timing off `el`, so the dwell is single-sourced in CSS.
 *
 * ONE property, both motion preferences: `--_qm-bloom-dwell` already shortens under
 * `prefers-reduced-motion` in the derivation, so what is left to `matchMedia` here is
 * the SHAPE: a hold and a cut carry no ramps, which is a frame list rather than a
 * number and the one half CSS cannot hand over.
 *
 * Read ONCE PER BATCH, not per element: `getComputedStyle` forces a style recalc and
 * `animate` re-dirties style, so a read inside a loop flushes once per element (~0.15ms
 * each). The rungs inherit, so every element in a batch resolves the same numbers.
 */
export function bloomTiming(el: HTMLElement): BloomTiming {
	const reduced =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const raw = getComputedStyle(el).getPropertyValue('--_qm-bloom-dwell').trim();
	const n = Number.parseFloat(raw);
	const duration = !Number.isFinite(n) ? FALLBACK_MS : raw.endsWith('ms') ? n : n * 1000;
	return { duration, frames: reduced ? FRAMES_REDUCED : FRAMES };
}

/**
 * Bloom the wash on `el` itself: the caller owns the element and has primed it
 * ({@link primeWash}). Returns the running animation, or `undefined` when there is
 * nothing left to run: `elapsed` past the decay, or an environment without WAAPI.
 * Pass `timing` to share one resolve across a batch.
 */
export function bloom(el: HTMLElement, elapsed = 0, timing?: BloomTiming): Animation | undefined {
	if (typeof el.animate !== 'function') return undefined;
	const { duration, frames } = timing ?? bloomTiming(el);
	if (elapsed >= duration) return undefined;
	const anim = el.animate(frames, { duration });
	if (elapsed > 0) anim.currentTime = elapsed;
	return anim;
}

/**
 * Bloom over `host`'s CONTENT: an inset child, so the wash neither tints the host's
 * own background nor fades the text under it. `host` must be positioned.
 *
 * ONE wash node per host, reused while it lives: two quick landings on the same leaf
 * must not stack two alphas over it. No `elapsed` seam: the surfaces that use this
 * (editor leaves) are not rebuilt under the animation the way the preview's boxes are.
 */
export function bloomInside(host: HTMLElement): void {
	let el = host.querySelector<HTMLElement>(`:scope > .${BLOOM_CLASS}`);
	if (el) {
		// Drop the in-flight run's handlers before cancelling: its `oncancel` would
		// otherwise remove the node the new run is about to animate.
		for (const a of el.getAnimations()) {
			a.onfinish = null;
			a.oncancel = null;
			a.cancel();
		}
	} else {
		el = document.createElement('div');
		el.className = BLOOM_CLASS;
		Object.assign(el.style, {
			position: 'absolute',
			inset: '0',
			pointerEvents: 'none',
			borderRadius: 'inherit'
		});
		primeWash(el);
		host.appendChild(el);
	}
	const node = el;
	const anim = bloom(node);
	if (!anim) {
		node.remove();
		return;
	}
	const drop = (): void => node.remove();
	anim.onfinish = drop;
	anim.oncancel = drop;
}
