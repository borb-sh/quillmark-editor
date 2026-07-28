// The correlation bloom: a soft accent wash that rises over a target and decays to
// nothing. The editor↔preview address is an EVENT, not a state — the preview claims
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

/** Marks a transient wash node — the wash is decoration, never a hit target. */
export const BLOOM_CLASS = 'qm-bloom';

const WASH = 'var(--_qm-accent-wash)';

// Rise fast, hold, then leave slowly: a highlighter's decay, not a linear fade. A
// keyframe's easing governs the segment that STARTS at it. Under reduced motion the
// ramps are dropped entirely — the wash holds at full for a beat and cuts, which
// still answers "here" with nothing to track.
const FRAMES: Keyframe[] = [
	{ opacity: 0, offset: 0, easing: 'ease-out' },
	{ opacity: 1, offset: 0.08 },
	{ opacity: 1, offset: 0.3, easing: 'ease-in' },
	{ opacity: 0, offset: 1 }
];
const FRAMES_REDUCED: Keyframe[] = [{ opacity: 1 }, { opacity: 1 }];

/** A duration rung as a number, read off `el` so the CSS scale is the single source.
 *  Falls back when the derivation is absent — an unstyled root, or jsdom, where
 *  `getComputedStyle` reports custom properties as empty. */
function durationOf(el: HTMLElement, rung: string, fallback: number): number {
	const raw = getComputedStyle(el).getPropertyValue(rung).trim();
	const n = Number.parseFloat(raw);
	if (!Number.isFinite(n)) return fallback;
	return raw.endsWith('ms') ? n : n * 1000;
}

function prefersReducedMotion(): boolean {
	return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Bloom the wash on `el` itself — the caller owns the element, its background, and
 * its resting `opacity: 0`. Returns the running animation, or `undefined` when there
 * is nothing left to run: `elapsed` past the decay, or an environment without WAAPI.
 */
export function bloom(el: HTMLElement, elapsed = 0): Animation | undefined {
	if (typeof el.animate !== 'function') return undefined;
	const reduced = prefersReducedMotion();
	const duration = reduced
		? durationOf(el, '--_qm-duration-slow', 200)
		: durationOf(el, '--_qm-duration-linger', 1100);
	if (elapsed >= duration) return undefined;
	const anim = el.animate(reduced ? FRAMES_REDUCED : FRAMES, { duration });
	if (elapsed > 0) anim.currentTime = elapsed;
	return anim;
}

/**
 * Bloom over `host`'s CONTENT — a transient inset child that removes itself, so the
 * wash never touches the host's own background and never fades the text under it.
 * `host` must be positioned. No `elapsed` seam: the surfaces that use this (editor
 * leaves) are not rebuilt under the animation the way the preview's boxes are.
 */
export function bloomInside(host: HTMLElement): void {
	const el = document.createElement('div');
	el.className = BLOOM_CLASS;
	Object.assign(el.style, {
		position: 'absolute',
		inset: '0',
		pointerEvents: 'none',
		borderRadius: 'inherit',
		background: WASH,
		opacity: '0'
	});
	host.appendChild(el);
	const anim = bloom(el);
	if (!anim) {
		el.remove();
		return;
	}
	const drop = (): void => el.remove();
	anim.onfinish = drop;
	anim.oncancel = drop;
}
