// The one derivation — ten public dials in, a closed private scale out
// (THEMING.md; SURFACES §"Preventing drift": a component reads a token, it does
// not mint a value). Colour joins geometry and type as a derived axis here, so
// all three rungs are minted in ONE place instead of once per detached root.
//
// TRANSPORT: a declaration string, applied as `style={QM_THEME}` on each root
// element. Not a CSS file (a forgotten `import './theme.css'` fails silently),
// not a Svelte action (an action runs at hydration, so an SSR'd first paint
// would resolve no rungs), and not a JS theme object (that trades away the
// cascade). Every emitted value still reads `var(--qm-…, default)`, so the
// public dials resolve against the CASCADE at each root: a consumer's
// `[data-theme="dark"]` ancestor rule flows in unchanged, `prefers-color-scheme`
// needs no JS, and `color-mix` runs at paint time.
//
// `core/` stays vanilla TS — this is string construction, no DOM and no runes.

/** The two poles every colour rung mixes between, and the three status hues. */
const BG = 'var(--qm-bg, #fff)';
const FG = 'var(--qm-fg, #1a1a1a)';
const ACCENT = 'var(--qm-accent, #2563eb)';
const DANGER = 'var(--qm-danger, #c5221f)';
const WARNING = 'var(--qm-warning, #b25000)';

/** `pct` of `b` mixed into `a`, in oklab — sRGB muddies the mid-tones, and the
 *  label/meta/border rungs are exactly mid-tone. */
const mix = (a: string, b: string, pct: number) => `color-mix(in oklab, ${a}, ${b} ${pct}%)`;
/** `pct` of `c` over nothing — a translucent wash that inverts with the palette. */
const alpha = (c: string, pct: number) => `color-mix(in oklab, ${c} ${pct}%, transparent)`;

// Surfaces step bg → fg, ink steps fg → bg. Dark mode is then a two-value swap,
// which is the whole point of the pair. The percentages are calibrated to the
// light-mode literals they replace (2% ≈ #fafafa, 17% ≈ #d4d4d4, 35% ≈ #555).
const COLOR = {
	surface: BG,
	'surface-raised': mix(BG, FG, 2), //  card / gutter
	'surface-hover': mix(BG, FG, 6),
	border: mix(BG, FG, 17),
	'border-strong': mix(BG, FG, 40), //  a hovered dashed edge
	ink: FG, //                          body
	'ink-label': mix(FG, BG, 35), //     field & card labels
	'ink-meta': mix(FG, BG, 45), //      `ui.group` section labels
	'ink-ghost': mix(FG, BG, 60), //     the shown-never-written default
	accent: ACCENT, //                   focus rings, active marks, the active field box
	'accent-soft': alpha(ACCENT, 55), // an idle field box's ring
	danger: DANGER, //                   errors, the required marker, the delete glyph
	warning: WARNING
};

// Ratios, not colours — no palette fixes these, so they are their own rungs.
// Shadows mix from the INK pole rather than black, so they track the palette
// instead of turning into a smudge on a dark surface.
const EFFECT = {
	blur: '8px',
	'shadow-page': `0 1px 4px ${alpha(FG, 20)}`,
	'shadow-popover': `0 4px 16px ${alpha(FG, 14)}`,
	// The popover's translucency: the theme surface mixed toward transparent, so
	// the page reads faintly through the pill (SURFACES §Elevation).
	'surface-popover': alpha(mix(BG, FG, 2), 82),
	// The recede ladder — a hover-revealed control at rest, a dim-but-present
	// affordance, a disabled one. Opacity recedes toward whatever is behind, so
	// these invert correctly given the element's own colour is a rung.
	'opacity-hint': '0.3',
	'opacity-idle': '0.35',
	'opacity-muted': '0.5',
	// The preview overlay's ring widths (PREVIEW §Overlay) — geometry, but too
	// narrow to earn a public dial.
	'ring-width': '1px',
	'ring-width-active': '2px'
};

// Geometry (SURFACES §Rhythm) and type: unchanged rungs, moved here from the
// per-root `<style>` blocks they used to be re-declared in.
const GEOMETRY = {
	radius: 'var(--qm-radius, 8px)',
	'radius-inner': 'calc(var(--_qm-radius) / 2)',
	// A fully-rounded end cap — a shape tier, not a step on the radius ramp, so it
	// does not derive from the dial: a pill stays a pill at any `--qm-radius`.
	'radius-pill': '999px',
	space: 'var(--qm-space, 0.25rem)',
	'space-half': 'calc(var(--_qm-space) / 2)',
	'space-2': 'calc(var(--_qm-space) * 2)',
	'space-3': 'calc(var(--_qm-space) * 3)',
	'space-4': 'calc(var(--_qm-space) * 4)'
};

// `--qm-font-size` anchors the body rung; `--qm-font-scale` is the ratio between
// adjacent rungs — a step up (title) and two down (label, meta). Weight is a
// fixed convention, not a dial.
const TYPE = {
	'text-body': 'var(--qm-font-size, 0.875rem)',
	'text-title': 'calc(var(--_qm-text-body) * var(--qm-font-scale, 1.125))',
	'text-label': 'calc(var(--_qm-text-body) / var(--qm-font-scale, 1.125))',
	'text-meta': 'calc(var(--_qm-text-label) / var(--qm-font-scale, 1.125))',
	'weight-label': '600',
	'weight-soft': '500'
};

/**
 * The private scale as a `style`-attribute string. Set it on every DETACHED root
 * — `VisualEditor`, `FormatPopover` (it portals to `document.body`), `Preview`,
 * and `SourceView` — each of which is a cascade island the others' rungs cannot
 * reach. `check:theme` asserts this module is the only place `--_qm-*` is
 * defined.
 */
export const QM_THEME: string = Object.entries({ ...COLOR, ...EFFECT, ...GEOMETRY, ...TYPE })
	.map(([name, value]) => `--_qm-${name}: ${value};`)
	.join(' ');
