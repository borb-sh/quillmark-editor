# Theming

`@quillmark/editor` ships **complex UX over a thin skin** (VISUAL_EDITOR_UIUX
§"Complex UX, minimal UI"): the surfaces carry the behavior — direct
manipulation, the caret bridge, per-field state — against a neutral, overridable
visual baseline a consumer restyles to its brand without fighting baked-in
design.

The surface is a set of CSS **custom properties**. Every one is consumed as
`var(--qm-…, <neutral default>)`, so an unset token falls back to the baseline and
a set token overrides it — no component defines a token, so there is nothing to
unset. Scope an override to any ancestor of the mounted surface (the whole app,
or one pane):

```css
.my-editor {
	--qm-font: 'Inter', system-ui, sans-serif;
	--qm-text: #10233b;
	--qm-border: #d7dee8;
	--qm-field-ring-active: #6d28d9;
}
```

This is the **baseline** contract — small, and deliberately so. The broad theming
system (semantic scales, class-vs-part hooks, dark mode) is deferred past V1
(VISUAL_EDITOR_UIUX §Open); the tokens below are stable, a later system layers
over them rather than replacing them. A handful of secondary chrome colors (hover
tints, control edges) are not yet tokenized and fall under that deferred pass.

## Tokens

### Base — typography & text

| Token                | Default                                | What it colors                                             |
| -------------------- | -------------------------------------- | ---------------------------------------------------------- |
| `--qm-font`          | `ui-sans-serif, system-ui, sans-serif` | The editor surface's font family.                          |
| `--qm-text`          | `#1a1a1a`                              | Primary text.                                              |
| `--qm-label`         | `#555`                                 | Field labels.                                              |
| `--qm-section-label` | `#8a8a8a`                              | `ui.group` section labels.                                 |
| `--qm-ghost`         | `#9a9a9a`                              | The ghosted `default:` placeholder (never written back).   |
| `--qm-border`        | neutral grey                           | The shared chrome border across cards, fields, and leaves. |

Two dials set the type ramp the same way the geometry dials set shape (below):
`--qm-font-size` anchors the body size, `--qm-font-scale` is the ratio between
rungs. They derive a small closed private scale — `--_qm-text-title` (a step up),
`--_qm-text-body`, `--_qm-text-label`, `--_qm-text-meta` (two steps down) — plus a
fixed weight convention `--_qm-weight-label` (`600`, card titles & field labels) /
`--_qm-weight-soft` (`500`, a nested object prop's secondary label). Every surface
reads a rung, never a size literal; `npm run check:type` gates it. The privates are
internal, not a contract; set only the two dials below.

| Token             | Default    | What it sizes                                                                    |
| ----------------- | ---------- | -------------------------------------------------------------------------------- |
| `--qm-font-size`  | `0.875rem` | Body text — the anchor the ramp derives up (title) and down (label/meta) from.   |
| `--qm-font-scale` | `1.125`    | Ratio between adjacent rungs. Raise it for more size contrast, lower to flatten. |

### Geometry

Two dials set the surface's shape and density (SURFACES §Rhythm). Each derives a
small closed private scale — `--_qm-radius`/`--_qm-radius-inner` and the
`--_qm-space-*` rungs — that every interior control reads, so one override
rescales the whole surface. The privates are internal, not a contract; set only
the two dials below.

| Token         | Default   | What it sizes                                                                 |
| ------------- | --------- | ----------------------------------------------------------------------------- |
| `--qm-radius` | `8px`     | Card & popover corner. Interior controls derive a tighter tier (half).        |
| `--qm-space`  | `0.25rem` | Spacing base. Gaps and insets are `half`/`1×`/`2×`/`3×`/`4×` multiples of it. |

### Card chrome

| Token          | Default   | What it colors                  |
| -------------- | --------- | ------------------------------- |
| `--qm-main-bg` | `#fff`    | The main card's background.     |
| `--qm-card-bg` | `#fafafa` | A composable card's background. |

### Field & prose leaf

| Token               | Default   | What it colors                                                       |
| ------------------- | --------- | -------------------------------------------------------------------- |
| `--qm-field-bg`     | `#fff`    | A field control / prose-leaf background.                             |
| `--qm-focus-ring`   | `#2563eb` | A focused scalar control's ring, and the active prose leaf's border. |
| `--qm-diag-error`   | `#c5221f` | An `error` inline diagnostic.                                        |
| `--qm-diag-warning` | `#b25000` | A `warning` inline diagnostic.                                       |

`--qm-focus-ring` defaults to the same hue as the preview overlay's active-box
ring (`--qm-field-ring-active`), so the same field reads as active with one hue
across the editor and the preview; override it to split the two.

### Preview overlay

The field-box overlay drawn over the painted page (PREVIEW §Overlay). Opt out of
the overlay entirely with `<Preview overlays={false}>`; restyle it with:

| Token                          | Default                        | What it colors                         |
| ------------------------------ | ------------------------------ | -------------------------------------- |
| `--qm-field-ring`              | `rgba(37, 99, 235, 0.55)`      | An idle field box's ring.              |
| `--qm-field-ring-width`        | `1px`                          | Idle ring width.                       |
| `--qm-field-ring-active`       | `#2563eb`                      | The active field box's ring.           |
| `--qm-field-ring-active-width` | `2px`                          | Active ring width.                     |
| `--qm-page-bg`                 | `#fff`                         | The page background behind the canvas. |
| `--qm-page-shadow`             | `0 1px 4px rgba(0, 0, 0, 0.2)` | The page drop shadow.                  |

### Formatting popover

The selection-mark popover (VISUAL_EDITOR_UIUX §Formatting) — a translucent pill:
`--qm-popover-bg` is mixed toward transparent (~82%) behind a backdrop blur, so an
opaque override still tints the mix.

| Token                    | Default   | What it colors                                |
| ------------------------ | --------- | --------------------------------------------- |
| `--qm-popover-bg`        | `#fff`    | The popover fill (mixed translucent + blur).  |
| `--qm-popover-hover`     | `#f0f0f0` | A hovered mark button.                        |
| `--qm-popover-active-bg` | `#1a1a1a` | An active (applied) mark button's background. |
| `--qm-popover-active-fg` | `#fff`    | An active mark button's foreground.           |

### Debug source view

The read-only `@quillmark/editor/source` surface.

| Token                     | Default   | What it colors          |
| ------------------------- | --------- | ----------------------- |
| `--qm-source-bg`          | `#fbfbfb` | The editor background.  |
| `--qm-source-gutter-bg`   | `#f3f3f3` | The line-number gutter. |
| `--qm-source-gutter-text` | `#9a9a9a` | The line numbers.       |
