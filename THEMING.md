# Theming

`@quillmark/editor` ships **complex UX over a thin skin** (VISUAL_EDITOR_UIUX §"Complex UX, minimal UI"): the surfaces carry the behavior (direct manipulation, the caret bridge, per-field state) against a neutral, overridable visual baseline a consumer restyles to its brand without fighting baked-in design.

The whole contract is **ten CSS custom properties**. They are dials, not a palette: each derives a closed private scale (`--_qm-*`) that every component reads, so one override rescales or recolors the whole surface. Set them on any ancestor of a mounted surface (the app, or one pane):

```css
.my-editor {
	--qm-bg: #fff;
	--qm-fg: #10233b;
	--qm-accent: #6d28d9;
	--qm-font: 'Inter', system-ui, sans-serif;
}
```

Nothing to import: the package pulls its own stylesheet, which applies the derivation to every surface it mounts.

## The dials

| Token            | Default                                | What it sets                                                                                            |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `--qm-bg`        | `#fff` / `#14171c`                     | Base surface. Cards, fields, the painted page, and the popover step off it.                             |
| `--qm-fg`        | `#1a1a1a` / `#e8eaed`                  | Base ink. Body text, labels, and borders step off it.                                                   |
| `--qm-accent`    | `#2563eb`                              | Focus rings, active marks, the preview's active field box.                                              |
| `--qm-danger`    | `#c5221f`                              | Error diagnostics, the required marker, the delete glyph.                                               |
| `--qm-warning`   | `#b25000`                              | Warning diagnostics.                                                                                    |
| `--qm-font`      | `ui-sans-serif, system-ui, sans-serif` | The editor surface's font family. Controls and buttons take it too, in place of the UA face.            |
| `--qm-font-mono` | `ui-monospace, monospace`              | The monospace face: the source mirror, the JSON array control, the tips card.                           |
| `--qm-font-size` | `0.875rem`                             | Body text: every control's size, and the anchor the ramp derives up (title) and down (label/meta) from. |
| `--qm-radius`    | `8px`                                  | Card & popover corner. Interior controls derive a tighter tier (half).                                  |
| `--qm-space`     | `0.25rem`                              | Spacing base. Gaps and insets are `half`/`1×`/`2×`/`3×`/`4×` multiples of it.                           |

Give a length dial a length. `--qm-space: 4` is a valid custom property and an invalid length. The three length dials are **contained**: each lands in one private rung, and that rung is registered (`@property`, `<length>`), so an invalid value is invalid at computed-value time there and falls back to the rung's own floor instead of reaching every `calc()` downstream. You get the documented default rather than a surface with no padding. The registration is on the private rung, not the dial — a registered property's initial value must be computationally independent, which the `rem` defaults above are not — so the defaults in the table are exactly what they say.

Containment is silent, which is its own problem: a dial you turned and a surface that did not move looks like a selector that missed. So in a **dev build** each surface reads its own length dials once at mount and reports one through `onError` (falling to the console) naming the dial and the value it read.

## What is behind the column is yours

The package draws cards, not the column they sit in. Four properties are the mounting site's: the gutter between your pane edge and the cards, the scroll container, the **page tone behind the column**, and the scroll tail that lets the last card reach the middle of your viewport. Nothing needs setting for the surface to look right; putting plain `--qm-bg` directly behind the column is a supported case, and the one the playground demonstrates.

That is why no card's fill is a bet on your backdrop: every card sits one rung off the base surface and every control one rung inside its card, so a control reads against its card whatever you put behind it. A page tone of your own reads as a third plane under the stack.

## The surface follows your colour scheme

Surfaces step `bg → fg` and ink steps `fg → bg`, mixed in **oklab**, so inverting the two poles inverts the whole scale, including borders and the popover's translucent fill. Elevation inverts with them, because it is produced with surfaces and lines (a tone rung and a hairline) and never with a shadow: an offset states a light source the poles do not carry, so one declaration would read as lit from above under a light palette and as a glow under its inverse.

Which way the poles default is **your `color-scheme`**, not the operating system's. Declare the scheme your app is in and the surface lands on it, along with native chrome, which reads the same property:

```css
html {
	color-scheme: light dark; /* follow the OS */
}

/* A class-driven theme declares the scheme alongside the class. */
html.dark {
	color-scheme: dark;
}
```

Declare nothing and you get light, which is what an undeclared page renders as anyway. A dark app that skips this line gets a light editor in a dark page, and light scrollbars, date pickers and carets throughout, which is the same line's doing and not ours to fix from inside a mounted surface.

Setting the poles yourself wins over the default in both schemes, so a fixed palette stays fixed:

```css
.my-editor {
	--qm-bg: #14171c;
	--qm-fg: #e8eaed;
}
```

A palette **pinned against** your own scheme is the one case needing a second line: the surfaces follow your dials, but native chrome follows `color-scheme`, so pin it with them: `.my-editor { color-scheme: dark }`. Skip that line and a typed value's own text still matches its card (`color` reads the same dial the card does, not `color-scheme`), but what the browser paints from `color-scheme` does not: the selection highlight, the scrollbar and the spinner stay on whichever scheme the host happens to inherit.

No JS runs and no media query: the derivation is emitted as `var()` references over `light-dark()`, so an ancestor's dials and the inherited scheme both resolve through the cascade at paint time. There is no `dark` prop and no mode toggle in the package; the consumer's palette decides.

## Cascade layers

The package's own rules sit in `qm.scale` (the derivation) and `qm.chrome` (the surfaces), sub-layers of **`qm`**. Unlayered CSS of yours beats both, whatever order the bundler emits — that is the cascade's rule, not ours, and it is the case that needs nothing.

**If your CSS is layered, name `qm` in your own layer statement, first:**

```css
@layer qm, reset, base, app; /* your layers after ours: your rules win */
```

Without that line the outcome is whichever `@layer` statement the bundler emitted first, and it goes against you in the common case: declaring `@layer reset, app;` in your entry registers your layers _before_ `qm` exists, which puts `qm.chrome` last and lets it beat your `app` rules at any specificity. Naming `qm` up front fixes the order, and it is enough on its own — layer names are global, so nothing needs importing to establish one.

## The class names you may target

Restyling past the dials means targeting the DOM, so this is the part that is a contract. These names are stable; everything else in the tree is internal and renamed without notice.

| Name                                                               | What it is                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `data-qm-root`                                                     | The attribute on every mounted surface root; the derivation applies to it. |
| `qm-editor` · `qm-preview` · `qm-source`                           | The three surface roots.                                                   |
| `qm-card` · `qm-field`                                             | One card in the editor's stack; one field's row.                           |
| `qm-page`                                                          | One painted page in the preview.                                           |
| `qm-preview-message`                                               | The preview's message element, in any of its states.                       |
| `qm-preview-empty` · `qm-preview-unsupported` · `qm-preview-error` | Which state it is in; each carries `qm-preview-message` too.               |
| `qm-source-text`                                                   | The `<pre>` the canonical markdown lands in.                               |

`npm run check:style` holds the list against the source, so a rename here is a rename you meant.

## What is deliberately not public

The derived scale (surface / border / ink rungs, the blur radius, the popover's translucency ratio, the recede-opacity ladder, the two leading rungs, the overlay ring widths) is **internal** (`--_qm-*`, minted in `core/`). It is not a contract: a rung can be re-tuned or renamed without notice.

Leading is private for the reason the size ratio is: a typographic ratio is a convention, not a dial, and both rungs are unitless, so `--qm-font-size` already rescales the line boxes with the type.

The rungs are declared **on** each root element, so setting one from an ancestor does nothing; an element's own declaration beats an inherited value at any specificity. A rule targeting the root reaches them (`.my-app [data-qm-root] { --_qm-border: … }`) and is unsupported on the same terms. Reaching the scale takes deliberate aim, which is the intent.

A knob becomes a dial when a real consumer needs it. The surface stays the minimum that makes a palette swap work; every dial is one more thing a reader has to hold.

## Requirements

`@layer`, `color-mix()` and `light-dark()`: Baseline since 2022, 2023 and 2024 respectively.

`npm run check:style` gates all of it: no component may mint a colour or opacity literal, and no surface may cast a shadow at all; nothing outside the derivation may define a `--_qm-*`; and the consumed dial set must match this document exactly, in both directions.
