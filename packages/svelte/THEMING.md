# Theming

`@quillmark/svelte` ships complex UX over a thin skin: the surfaces carry the behavior (direct manipulation, the caret bridge, per-field state) against a neutral visual baseline a consumer restyles to its brand without fighting baked-in design.

There are three depths to that, and most apps stop at the first:

|                   | You write             | You get                                                 |
| ----------------- | --------------------- | ------------------------------------------------------- |
| **Drop it in**    | nothing               | a mounted surface that looks right in a bare `<div>`    |
| **Make it yours** | ten custom properties | the whole surface rescaled and recolored to your brand  |
| **Match ours**    | one CSS import        | the page around the surface, drawn the way we draw ours |

## Drop it in

```svelte
<VisualEditor {doc} {quill} />
```

Nothing to import and nothing to set. The package pulls its own stylesheet, and each surface owns its whole **column**, not only the cards in it: the gutter the stack sits in, the tone behind it, and (for the preview) the desk the painted sheet floats on. A bare `<div>` is a mounting site.

**Mounting into a fixed-height pane**: pass `class="qm-pane"`. The surface becomes its own scroll container and takes a scroll tail, so the last card can be read at the middle of your pane rather than against its bottom edge. Without it the editor grows to its content and your page scrolls, which is what you want when the editor _is_ the page. The preview always scrolls: a viewport onto a document has nothing else to be.

`.qm-pane` is opt-in on the editor rather than the default because the editor is what its own popovers portal into, and a scroll container clips them. In a pane you would have had that clipping from your own scrolling frame anyway; in a page you should not have it at all.

**Placing and sizing**: each surface carries a stable root class (`.qm-editor`, `.qm-preview`), so you can place it from your own stylesheet without a wrapper. Each also takes a `class` prop that merges onto the same element, which is the better handle when you have one to give.

**Taking the column back**: your CSS is unlayered and ours is not (below), so `padding: 0` or a `background` of your own on `.qm-editor` wins outright. Nothing is locked.

## Make it yours

The whole contract is **ten CSS custom properties**. They are dials, not a palette: each derives a closed private scale that every component reads, so one override rescales or recolors the whole surface. Set them on any ancestor of a mounted surface (the app, or one pane):

```css
.my-editor {
	--qm-bg: #fff;
	--qm-fg: #10233b;
	--qm-accent: #6d28d9;
	--qm-font: 'Inter', system-ui, sans-serif;
}
```

### The dials

| Token            | Default                                | What it sets                                                                                            |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `--qm-bg`        | `#fff` / `#14171c`                     | Base surface. Cards, fields, the painted page, the popover, and the column behind them step off it.     |
| `--qm-fg`        | `#1a1a1a` / `#e8eaed`                  | Base ink. Body text, labels, and borders step off it.                                                   |
| `--qm-accent`    | `#2563eb`                              | Focus rings, active marks, the preview's active field box.                                              |
| `--qm-danger`    | `#c5221f`                              | Error diagnostics, the required marker, the delete glyph.                                               |
| `--qm-warning`   | `#b25000`                              | Warning diagnostics.                                                                                    |
| `--qm-font`      | `ui-sans-serif, system-ui, sans-serif` | The editor surface's font family. Controls and buttons take it too, in place of the UA face.            |
| `--qm-font-mono` | `ui-monospace, monospace`              | The monospace face: the JSON array control, the tips card.                                              |
| `--qm-font-size` | `0.875rem`                             | Body text: every control's size, and the anchor the ramp derives up (title) and down (label/meta) from. |
| `--qm-radius`    | `8px`                                  | Card & popover corner. Interior controls derive a tighter tier (half).                                  |
| `--qm-space`     | `0.25rem`                              | Spacing base. Gaps and insets are `half`/`1×`/`2×`/`3×`/`4×` multiples of it.                           |

Give a length dial a length: `--qm-space: 4` is a valid custom property and an invalid length, so it substitutes through every `calc()` that reads it. Where `@property` is supported the surface absorbs that, landing on the package default rather than collapsing the padding to zero.

### Your CSS beats ours

The surfaces' own rules live in the `qm` cascade layer, so **unlayered CSS of yours beats them outright**, at any specificity and without `!important`. Nothing to declare; this is the case most apps are in.

If your app uses cascade layers of its own, layer order decides it, and layer order is first-declaration order across the document — which makes it the bundler's, not yours. Name our layer first in one statement of your own, anywhere in your CSS, and it stops mattering:

```css
@layer qm, app;
```

Declared before our sheet it fixes the order outright; declared after, `qm` is already first and `app` appends behind it. Either way your layer lands after ours and wins. `qm` is the contract; the sub-layers under it (`qm.scale`, `qm.chrome`) are ours to re-cut.

### The surface follows your colour scheme

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

Declare nothing and you get light. A dark app that skips this line gets a light editor in a dark page, and light scrollbars, date pickers and carets throughout. (The preset below declares `light dark` for you.)

Setting the poles yourself wins over the default in both schemes, so a fixed palette stays fixed:

```css
.my-editor {
	--qm-bg: #14171c;
	--qm-fg: #e8eaed;
}
```

A palette **pinned against** your own scheme is the one case needing a second line: the surfaces follow your dials, but native chrome follows `color-scheme`, so pin it with them (`.my-editor { color-scheme: dark }`). Skip that line and what the browser paints — the selection highlight, the scrollbar, the spinner — stays on whichever scheme the host inherits.

No JS runs and no media query: the derivation resolves through the cascade at paint time, so there is no `dark` prop and no mode toggle. The consumer's palette decides.

## Match ours

A mounted surface looks right on its own. The page around it (the label over a readout, the status line, the plate your controls sit on) is yours, and if you have a design system it should stay yours. If you do not, take ours:

```js
import '@quillmark/svelte/preset';
```

```html
<body class="qm-page">
	<p class="qm-label">quill</p>
	<pre class="qm-readout">usaf_memo@0.2.0</pre>
</body>
```

This is the stylesheet our own apps import: the playground and studio draw with these rules and nothing else, so what you get is what we ship, not a reduction of it.

It carries a `--qmh-*` scale for the page, derived from the same ten dials and calibrated against the surfaces' own steps, so a plate of yours and a card of ours agree about which way "raised" goes. Turning a dial moves both.

| Class         | What it is                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `.qm-page`    | The page baseline: tone, ink, face, leading, and `color-scheme: light dark`. Put it on `<body>` or the element your app mounts into. |
| `.qm-panel`   | The plate your controls and readouts sit on: one rung off the page, a hairline, a corner.                                            |
| `.qm-label`   | A run of chrome type: a section label, the name over a value.                                                                        |
| `.qm-readout` | A value read back out of the session, monospace and tabular. `<pre class="qm-readout">` is the block form.                           |
| `.qm-status`  | A phase line. `.qm-status-error` and `.qm-status-warn` are the two it fails to.                                                      |
| `.qm-control` | A boxed button or select, which is what a host's controls are and the package's are not.                                             |
| `.qm-measure` | A reading column at the width a passage wants.                                                                                       |

### The shell, if you are building a tool

An app that mounts an editor beside a preview over one session needs a screen to put them in, and it is the same screen every time. Five more classes are that screen, so what you write is the wiring rather than the grid:

```html
<div class="qm-workspace">
	<header class="qm-bar">
		<span class="qm-mark">acme<span class="qm-mark-quiet">/</span>studio</span>
	</header>
	<div class="qm-split">
		<section class="qm-frame"><!-- <VisualEditor class="qm-pane" /> --></section>
		<section class="qm-frame"><!-- <Preview /> --></section>
	</div>
</div>
```

| Class           | What it is                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.qm-workspace` | The screen: pinned to the viewport, three bands (a head, the body, an optional foot), the body taking what is left and the document scrolling nowhere. |
| `.qm-bar`       | A band's line, wrapping. The rule under it and the gutter beside it stay yours, since where a band ends is your page shell's decision.                 |
| `.qm-mark`      | Your app's name at the head of it. `.qm-mark-quiet` is the part that recedes: a separator, a qualifier.                                                |
| `.qm-split`     | Two even tracks for two surfaces, the page gap between them. Below `60rem` they stack, each at `--qmh-pane`; which element scrolls then is yours.      |
| `.qm-frame`     | The mounting site: an edge, a corner, and the clip that holds a surface to them. What is inside it is the surface's own.                               |

It is **unlayered**, so your own rules beat it by ordinary precedence, exactly as they beat the surfaces. It is also opt-in and side-effect free until imported: nothing that styles your document arrives with a component.

One rule in it earns its place regardless of whether you take the rest, and you want it if you draw a focus ring of your own:

```css
[data-qm-root] :focus-visible {
	outline: revert-layer;
	outline-offset: revert-layer;
}
```

A blanket `:focus-visible` of yours is unlayered, so it beats `@layer qm.chrome`, including on the controls that already draw a ring. `revert-layer` hands those back to ours and leaves yours everywhere else.

## What is deliberately not public

The three root classes and `.qm-pane` are the whole class contract on the surfaces. Every other `qm-*` class inside them is internal and renames without notice: a class contract over the interior would freeze the DOM shape the surfaces are free to re-cut, and the dials already reach the values a restyle wants. The preset's classes are a contract of their own: they land on _your_ DOM, so they freeze nothing of ours.

The derived surface scale (surface / border / ink rungs, the blur radius, the popover's translucency ratio, the recede-opacity ladder, the two leading rungs, the overlay ring widths, the scroll tail) is internal on the same terms, and declared **on** each root element, so setting a rung from an ancestor does nothing. A dial appears when a real consumer needs one; every dial is one more thing a reader has to hold.

## Requirements

`@layer`, `color-mix()` and `light-dark()`: Baseline since 2022, 2023 and 2024 respectively. `@property` is the one feature the surface does not require: where it is missing, an invalid length dial collapses the surface rather than falling back.
