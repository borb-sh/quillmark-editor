# Theming

`@quillmark/svelte` ships **complex UX over a thin skin** (VISUAL_EDITOR_UIUX §"Complex UX, minimal UI"): the surfaces carry the behavior (direct manipulation, the caret bridge, per-field state) against a neutral, overridable visual baseline a consumer restyles to its brand without fighting baked-in design.

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

Give a length dial a length. `--qm-space: 4` is a valid custom property and an invalid length, so it substitutes through every `calc()` that reads it. Where `@property` is supported the surface absorbs that: the three rungs reading a length dial are registered, so an invalid dial lands them on the package default instead of collapsing the padding to zero. The dials themselves cannot be registered — a registered property's initial value must be computationally independent, and these default in `rem` — so the guard sits one step downstream and the fallback is the package's figure, not yours.

## Your CSS beats ours

The surfaces' own rules live in the `qm` cascade layer, so **unlayered CSS of yours beats them outright**, at any specificity and without `!important`. Nothing to declare; this is the case most apps are in.

If your app uses cascade layers of its own, layer order decides it, and layer order is first-declaration order across the document — which makes it the bundler's, not yours. Name our layer first in one statement of your own and it stops mattering:

```css
@layer qm, app;
```

Anywhere in your CSS. Declared before our sheet it fixes the order outright; declared after, `qm` is already first and `app` appends behind it. Either way your layer lands after ours and wins:

| Your CSS          | Our sheet first | Your sheet first |
| ----------------- | --------------- | ---------------- |
| Unlayered         | you win         | you win          |
| Layered           | you win         | **we win**       |
| `@layer qm, app;` | you win         | you win          |

`qm` is the contract; the sub-layers under it (`qm.scale`, `qm.chrome`) are ours to re-cut.

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

## The three class handles

Each mounted surface carries a stable root class, so you can place and size it from your own stylesheet without a wrapper: `.qm-editor`, `.qm-preview`, `.qm-source`. Each also takes a `class` prop that merges onto the same element, which is the better handle when you have one to give.

Those three are the whole class contract. Every other `qm-*` class in the DOM is internal and renames without notice: a class contract over the interior would freeze the DOM shape the surfaces are free to re-cut, and the dials already reach the values a restyle wants. `check:style` holds the promise from the other side — a root class named here and carried by nothing fails the gate.

## What is deliberately not public

The derived scale (surface / border / ink rungs, the blur radius, the popover's translucency ratio, the recede-opacity ladder, the two leading rungs, the overlay ring widths) is **internal** (`--_qm-*`, minted in `core/`). It is not a contract: a rung can be re-tuned or renamed without notice.

Leading is private for the reason the size ratio is: a typographic ratio is a convention, not a dial, and both rungs are unitless, so `--qm-font-size` already rescales the line boxes with the type.

The rungs are declared **on** each root element, so setting one from an ancestor does nothing; an element's own declaration beats an inherited value at any specificity. A rule targeting the root reaches them (`.my-app [data-qm-root] { --_qm-border: … }`) and is unsupported on the same terms. Reaching the scale takes deliberate aim, which is the intent.

A knob becomes a dial when a real consumer needs it. The surface stays the minimum that makes a palette swap work; every dial is one more thing a reader has to hold.

## Requirements

`@layer`, `color-mix()` and `light-dark()`: Baseline since 2022, 2023 and 2024 respectively.

`@property` is the one feature the surface does not require: where it is missing the registrations are skipped and an invalid length dial collapses the surface rather than falling back, which is the behaviour without the guard rather than a new one.

`npm run check:style` gates all of it: no component may mint a colour, opacity, rhythm or stroke literal, in a stylesheet or in the `.ts` that writes styles as strings, and no surface may cast a shadow at all; nothing outside the derivation may define a `--_qm-*`; the consumed dial set must match this document exactly, in both directions; and every root class promised above must be carried by something in `src/`.
