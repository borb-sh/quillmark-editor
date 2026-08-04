# Theming

`@quillmark/svelte` ships complex UX over a thin skin: the surfaces carry the behavior (direct manipulation, the caret bridge, per-field state) against a neutral visual baseline a consumer restyles to its brand without fighting baked-in design.

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

Give a length dial a length: `--qm-space: 4` is a valid custom property and an invalid length, so it substitutes through every `calc()` that reads it. Where `@property` is supported the surface absorbs that, landing on the package default rather than collapsing the padding to zero.

## Your CSS beats ours

The surfaces' own rules live in the `qm` cascade layer, so **unlayered CSS of yours beats them outright**, at any specificity and without `!important`. Nothing to declare; this is the case most apps are in.

If your app uses cascade layers of its own, layer order decides it, and layer order is first-declaration order across the document — which makes it the bundler's, not yours. Name our layer first in one statement of your own, anywhere in your CSS, and it stops mattering:

```css
@layer qm, app;
```

Declared before our sheet it fixes the order outright; declared after, `qm` is already first and `app` appends behind it. Either way your layer lands after ours and wins. `qm` is the contract; the sub-layers under it (`qm.scale`, `qm.chrome`) are ours to re-cut.

## What is behind the column is yours

The package draws cards, not the column they sit in. Four properties are the mounting site's: the gutter between your pane edge and the cards, the scroll container, the page tone behind the column, and the scroll tail that lets the last card reach the middle of your viewport. Nothing needs setting for the surface to look right: every card sits one rung off the base surface and every control one rung inside its card, so a control reads against its card whatever you put behind it.

## The surface follows your colour scheme

Surfaces step `bg → fg` and ink steps `fg → bg`, mixed in **oklab**, so inverting the two poles inverts the whole scale, including borders and the popover's translucent fill.

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

Declare nothing and you get light. A dark app that skips this line gets a light editor in a dark page, and light scrollbars, date pickers and carets throughout.

Setting the poles yourself wins over the default in both schemes, so a fixed palette stays fixed:

```css
.my-editor {
	--qm-bg: #14171c;
	--qm-fg: #e8eaed;
}
```

A palette **pinned against** your own scheme is the one case needing a second line: the surfaces follow your dials, but native chrome follows `color-scheme`, so pin it with them (`.my-editor { color-scheme: dark }`). Skip that line and what the browser paints — the selection highlight, the scrollbar, the spinner — stays on whichever scheme the host inherits.

No JS runs and no media query: the derivation resolves through the cascade at paint time, so there is no `dark` prop and no mode toggle. The consumer's palette decides.

## The three class handles

Each mounted surface carries a stable root class, so you can place and size it from your own stylesheet without a wrapper: `.qm-editor`, `.qm-preview`, `.qm-source`. Each also takes a `class` prop that merges onto the same element, which is the better handle when you have one to give.

Those three are the whole class contract. Every other `qm-*` class in the DOM is internal and renames without notice: a class contract over the interior would freeze the DOM shape the surfaces are free to re-cut, and the dials already reach the values a restyle wants.

The derived scale (surface / border / ink rungs, the blur radius, the popover's translucency ratio, the recede-opacity ladder, the two leading rungs, the overlay ring widths) is internal on the same terms, and declared **on** each root element, so setting a rung from an ancestor does nothing. A dial appears when a real consumer needs one; every dial is one more thing a reader has to hold.

## Requirements

`@layer`, `color-mix()` and `light-dark()`: Baseline since 2022, 2023 and 2024 respectively. `@property` is the one feature the surface does not require: where it is missing, an invalid length dial collapses the surface rather than falling back.
