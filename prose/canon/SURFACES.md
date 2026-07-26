# Surfaces

> **Implementation**: `src/lib/visual/`

## TL;DR

The visual chrome of the editor's surfaces — background, border, shadow, padding,
and radius — across the card stack, its fields and body, and the floating
selection popover. The visual language that motivates the choices (monochrome,
typographic, restrained) is [AESTHETIC.md](AESTHETIC.md); the public dials behind
the chrome are [`THEMING.md`](../../THEMING.md). Prior art is web-app, whose
`SURFACES.md` this carries.

Two orthogonal rules decide how a surface looks, each with a single source so a new
control inherits them instead of reinventing:

1. **Elevation** — is the surface in the document flow, or floating over it?
2. **Rhythm** — one closed spacing scale and one radius base, not a per-component choice.

## Elevation

The card is the container; nothing inside it is a second box.

- **The card stack is in-flow.** A card carries one quiet edge — a single hairline
  at `--_qm-border`, not a hairline and a shadow — over `--_qm-surface-raised`. The
  `main` card sits at the base surface (`--_qm-surface`) instead, so the document's
  head reads as the page and the composable cards read as stacked on it. One border
  rung across all of them, not a different grey per card. The card is the only
  container in the column.
- **Fields and the body sit quiet inside the card.** A scalar control and a prose
  leaf each carry one hairline — the shared `--_qm-border` at `--_qm-radius-inner`
  over `--_qm-surface` (§"The shared recipe") — and nothing heavier: no fill, no
  shadow, no frame within the frame. The single hairline is the floor a control
  needs to read as editable and to host its focus ring (§"Focus and active state");
  a *second* box inside it — a nested border, a filled panel — is the density the
  monochrome rule (AESTHETIC.md) removes.
- **The floating surfaces earn the lift the cards do without.** The selection
  popover takes `--_qm-surface-popover` (the base surface mixed toward transparent)
  behind a `--_qm-blur` backdrop, a hairline, and `--_qm-shadow-popover`; the enum
  listbox takes the same shadow over an opaque `--_qm-surface`, since a list of
  choices reads through worse than a row of glyphs. Both sit over content with
  nothing behind them (VISUAL_EDITOR_UIUX §Formatting).

## The shared recipe

Chrome comes from the rungs applied one way, not hand-written per component. The
scalar controls share one control chrome — `--_qm-surface`, one `--_qm-border`
hairline, `--_qm-radius-inner`; the two floating surfaces share the popover
recipe above. A palette change is then one dial, not one edit per field file. A
control that mints its own border grey or radius instead of reading the rung is
the drift this prevents.

## Rhythm

**Spacing.** A small closed scale — `--_qm-space` and its `half`/`2`/`3`/`4`
multiples — is the shared rhythm. Card padding and the prose-leaf inset stack to a
uniform inset on every side, so a body-shown card and a body-hidden card stay
symmetric; every left edge aligns to one gutter. Stacked regions — a card's header,
its field list, its body — are separated by one gap, not per-region margins that
drift. Pick from the scale; an in-between value is a review smell.

**Radius.** One radius base with at most a small derived step, by surface weight —
the card and the two floating surfaces at `--_qm-radius`, interior controls at the
tighter `--_qm-radius-inner` — not a free choice per component. `--_qm-radius-pill`
is a shape tier beside the ramp rather than a step on it, so a fully-rounded end cap
stays round at any `--qm-radius`. Four unrelated radii is drift, not a scale.

**Type.** One closed ramp, not a per-component size. A body anchor and a ratio
derive four rungs — `--_qm-text-title` (card title), `--_qm-text-body` (inputs, add
affordances), `--_qm-text-label` (field labels), `--_qm-text-meta` (section labels,
diagnostics, mini controls) — with weight a fixed convention over them
(`--_qm-weight-label` on a field label, `--_qm-weight-soft` on a nested object
prop's secondary label), not per-file. The ~8 ad-hoc sizes the study counted
collapse to the four; an in-between size is the drift this prevents.

**The scale in code.** All three axes are public dials deriving a closed private
scale ([`THEMING.md`](../../THEMING.md)) — geometry (`--qm-radius`, `--qm-space`),
type (`--qm-font-size`, with the ratio between rungs a fixed constant), and colour
(`--qm-bg`, `--qm-fg`, and the three status hues, which step surfaces `bg → fg` and
ink `fg → bg` in oklab). The derivation is minted ONCE, as a stylesheet in `core/`
the package imports itself, and applies to every element marked `data-qm-root` —
the editor, the portaled popover and select list, the preview, and the source view,
none of which descend from the others. That rule carries the baseline font and ink
too, so a root inherits them by carrying the marker rather than by restating a
declaration; it stops short of a body `font-size`, which the prose leaves take from
the page and measure their caret against. A component reads a rung, never a
literal; `check:style` gates all three axes, so an in-between value fails CI, not
just review.

## Focus and active state

A surface a caret or selection can land on shows it, within the monochrome
palette — but a **form control** and a **prose leaf** are not the same focus
case, and one rule for both is the conflation [#45] resolves:

- **Scalar controls draw a tokenized ring.** A focused `TextField` / `NumberField`
  / `EnumField` / `BooleanField` / `DateField` (and the array JSON control) shows
  `--_qm-ring-focus` at `--_qm-ring-offset` in place of the raw UA default —
  themed, and identical across the controls because it is ONE RULE they opt into
  (`.qm-focus-ring`), not a rung each assembles. The rung fixes the value; the rule
  fixes which properties draw a ring and on what state, which `check:style` cannot
  see. Two variants, for the one distinction: a date field's focus lives on a
  segment, so it rings the field on `:focus-within` rather than flickering the ring
  across the segments as the caret walks them. Invariant: never clear a form
  control's native outline without a visible replacement.
- **A prose leaf keeps the caret as its focus indicator.** The blinking caret is
  the editor convention for a text-editing region — Google Docs, Notion, every
  ProseMirror surface — and a ring around a `contenteditable` reads as the form
  chrome the AESTHETIC rule strips, not as paper. So the leaf clears its
  contenteditable outline deliberately; the caret *is* the replacement, and the
  active leaf is cued quietly by tinting its wrapper hairline to `--_qm-accent`
  (`:focus-within`), not by a heavy ring.

One hue carries "active" across the panes: the editor's focus ring and the preview
overlay's active box both resolve `--_qm-accent`, so a field reads as focused with
the same colour in the editor and in the preview (the editor↔preview active
address, VISUAL_EDITOR_UIUX §"Editor↔preview"). The overlay's idle box is the same
hue held back — `--_qm-accent-soft` at `--_qm-ring-width`, against the active box's
`--_qm-ring-width-active`. The active *card* is set apart separately — the `active`
state that pins the reorder chevrons (VISUAL_EDITOR_UIUX §"Card stack").

Buttons (reorder, delete, mark, add) keep the UA `:focus-visible` ring — already
an accessible indicator; theming them is deferred, not part of [#45].

[#45]: https://github.com/borb-sh/quillmark-editor/issues/45

## Preventing drift

- **Chrome → rungs.** The look lives in the `--_qm-*` scale; a component reads a
  rung, it does not mint a value.
- **Scale → a closed set.** Spacing, radius, type, and colour are small fixed
  scales; a value outside them is a review smell.
- **Public surface → the minimum.** The dials are the contract
  ([`THEMING.md`](../../THEMING.md) counts them); a rung is promotable the day a
  consumer needs it. Fewer names is the point — each one is a thing a reader holds.
- **Rule → this page.** The elevation and rhythm questions have a written answer,
  so they are not re-argued per change.

## Links

[AESTHETIC.md](AESTHETIC.md) · [VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md) · [`THEMING.md`](../../THEMING.md)
