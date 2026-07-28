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

Nothing to import: the package pulls its own stylesheet, which applies the
derivation to every surface it mounts.

## The dials

| Token            | Default                                | What it sets                                                                                             |
| ---------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `--qm-bg`        | `#fff`                                 | Base surface. Cards, fields, the painted page, and the popover step off it.                              |
| `--qm-fg`        | `#1a1a1a`                              | Base ink. Body text, labels, borders, and shadows step off it.                                           |
| `--qm-accent`    | `#2563eb`                              | Focus rings, active marks, the preview's active field box.                                               |
| `--qm-danger`    | `#c5221f`                              | Error diagnostics, the required marker, the delete glyph.                                                |
| `--qm-warning`   | `#b25000`                              | Warning diagnostics.                                                                                     |
| `--qm-font`      | `ui-sans-serif, system-ui, sans-serif` | The editor surface's font family.                                                                        |
| `--qm-font-mono` | `ui-monospace, monospace`              | The monospace face — the source mirror, the JSON array control, the tips card.                           |
| `--qm-font-size` | `0.875rem`                             | Body text — every control's size, and the anchor the ramp derives up (title) and down (label/meta) from. |
| `--qm-radius`    | `8px`                                  | Card & popover corner. Interior controls derive a tighter tier (half).                                   |
| `--qm-space`     | `0.25rem`                              | Spacing base. Gaps and insets are `half`/`1×`/`2×`/`3×`/`4×` multiples of it.                            |

Give a length dial a length. `--qm-space: 4` is a valid custom property and an
invalid length, so it poisons every `calc()` that reads it and collapses the
surface's padding to zero. CSS property registration would catch that, but a
registered property's initial value must be computationally independent and these
default in `rem` — so nothing catches it but you.

## What is behind the column is yours

The package draws cards, not the column they sit in. Four properties are the
mounting site's: the gutter between your pane edge and the cards, the scroll
container, the **page tone behind the column**, and the scroll tail that lets the
last card reach the middle of your viewport. Nothing needs setting for the surface
to look right — putting plain `--qm-bg` directly behind the column is a supported
case, and the one the playground demonstrates.

That is why no card's fill is a bet on your backdrop: every card sits one rung off
the base surface and every control one rung inside its card, so a control reads
against its card whatever you put behind it. A page tone of your own reads as a
third plane under the stack.

## Dark mode is a two-value swap

Surfaces step `bg → fg` and ink steps `fg → bg`, mixed in **oklab** — so
inverting the two poles inverts the whole scale, including borders, the popover's
translucent fill, and the page shadow (which mixes from the ink pole rather than
from black, and so does not become a smudge on a dark surface).

The package ships a dark default under `prefers-color-scheme: dark`, and native
chrome — scrollbars, the date picker, the caret — follows it. Setting the poles
yourself wins over that default in both schemes, so a fixed palette stays fixed:

```css
@media (prefers-color-scheme: dark) {
	.my-editor {
		--qm-bg: #14171c;
		--qm-fg: #e8eaed;
	}
}
```

A palette **pinned against** the OS preference is the one case needing a second
line: the surfaces follow your dials, but native chrome still follows the user, so
pin it with them — `[data-qm-root] { color-scheme: dark }`.

No JS runs: the derivation is emitted as `var()` references, so an ancestor rule
or a media query resolves through the cascade at paint time. There is no `dark`
prop and no mode toggle in the package — the consumer's palette decides.

## What is deliberately not public

The derived scale — surface / border / ink rungs, the blur radius, the popover's
translucency ratio, the recede-opacity ladder, the overlay ring widths — is
**internal** (`--_qm-*`, minted in `core/`). It is not a contract: a rung can be
re-tuned or renamed without notice.

The rungs are declared **on** each root element, so setting one from an ancestor
does nothing — an element's own declaration beats an inherited value at any
specificity. A rule targeting the root reaches them
(`.my-app [data-qm-root] { --_qm-border: … }`) and is unsupported on the same
terms. Reaching the scale takes deliberate aim, which is the intent.

A knob is promotable to a dial the day a real consumer needs it. The surface stays
the minimum that makes a palette swap work, because every dial is one more thing a
reader has to hold — not because the set is frozen.

## Requirements

`@layer` and `color-mix()` — Baseline since 2022 and 2023 respectively.

`npm run check:style` gates all of it: no component may mint a colour, shadow, or
opacity literal; nothing outside the derivation may define a `--_qm-*`; and the
consumed dial set must match this document exactly, in both directions.
