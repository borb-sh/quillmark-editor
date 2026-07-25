# Theming

`@quillmark/editor` ships **complex UX over a thin skin** (VISUAL_EDITOR_UIUX
§"Complex UX, minimal UI"): the surfaces carry the behavior — direct
manipulation, the caret bridge, per-field state — against a neutral, overridable
visual baseline a consumer restyles to its brand without fighting baked-in
design.

The whole contract is **ten CSS custom properties**. They are dials, not a
palette: each derives a closed private scale (`--_qm-*`) that every component
reads, so one override rescales or recolors the whole surface. Set them on any
ancestor of a mounted surface — the app, or one pane:

```css
.my-editor {
	--qm-bg: #fff;
	--qm-fg: #10233b;
	--qm-accent: #6d28d9;
	--qm-font: 'Inter', system-ui, sans-serif;
}
```

**One exception, for now.** The selection popover and the enum listbox mount at
`document.body`, outside the editor's subtree, so they inherit the dials from
`<body>` rather than from a wrapper around the editor. Scope the dials to one pane
and those two surfaces keep the defaults while the pane restyles. Set the dials at
`:root` (or on `body`) to theme them too; scoping to a pane is safe once the
portal targets move inside the editor root.

## The dials

| Token             | Default                                | What it sets                                                                       |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------------------- |
| `--qm-bg`         | `#fff`                                 | Base surface. Cards, fields, the painted page, and the popover step off it.        |
| `--qm-fg`         | `#1a1a1a`                              | Base ink. Body text, labels, borders, and shadows step off it.                     |
| `--qm-accent`     | `#2563eb`                              | Focus rings, active marks, the preview's active field box.                         |
| `--qm-danger`     | `#c5221f`                              | Error diagnostics, the required marker, the delete glyph.                          |
| `--qm-warning`    | `#b25000`                              | Warning diagnostics.                                                               |
| `--qm-font`       | `ui-sans-serif, system-ui, sans-serif` | The editor surface's font family.                                                  |
| `--qm-font-size`  | `0.875rem`                             | Body text — the anchor the ramp derives up (title) and down (label/meta) from.     |
| `--qm-font-scale` | `1.125`                                | Ratio between adjacent type rungs. Raise for more size contrast, lower to flatten. |
| `--qm-radius`     | `8px`                                  | Card & popover corner. Interior controls derive a tighter tier (half).             |
| `--qm-space`      | `0.25rem`                              | Spacing base. Gaps and insets are `half`/`1×`/`2×`/`3×`/`4×` multiples of it.      |

## Dark mode is a two-value swap

Surfaces step `bg → fg` and ink steps `fg → bg`, mixed in **oklab** — so
inverting the two poles inverts the whole scale, including borders, the popover's
translucent fill, and the page shadow (which mixes from the ink pole rather than
from black, and so does not become a smudge on a dark surface).

```css
@media (prefers-color-scheme: dark) {
	.my-editor {
		--qm-bg: #14171c;
		--qm-fg: #e8eaed;
	}
}
```

No JS runs: the derivation is emitted as `var()` references, so an ancestor rule
or a media query resolves through the cascade at paint time. There is no `dark`
prop and no mode toggle in the package — the consumer's palette decides.

One surface sits outside the swap. **Native controls** — scrollbars, the date
picker, the caret — follow `color-scheme`, which nothing in the derivation sets, so
a dark editor keeps light native chrome. Declare it yourself alongside the poles;
it is not reachable from the ten dials, and is tracked for the theming rework.

## What is deliberately not public

The derived scale — surface / border / ink rungs, the blur radius, the popover's
translucency ratio, the recede-opacity ladder, the overlay ring widths — is
**internal** (`--_qm-*`, minted in `src/lib/core/theme.ts`). It is not a
contract: a rung can be re-tuned or renamed without notice, and setting one
yourself is unsupported. `QM_THEME` is exported from `@quillmark/editor/core` for
the same reason — `preview/` and `visual/` are separate subpaths that both need
the derivation — and is internal on the same terms: importing it buys you the
current rung names, not a promise about the next release's.

A knob is promotable to a dial the day a real consumer needs it. The surface stays
the minimum that makes a palette swap work, because every dial is one more thing a
reader has to hold — not because the set is frozen.

`npm run check:style` gates all of it: no component may mint a colour, shadow, or
opacity literal; nothing outside the derivation may define a `--_qm-*`; and the
consumed dial set must match this document exactly, in both directions.
