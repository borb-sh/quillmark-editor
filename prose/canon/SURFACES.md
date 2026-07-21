# Surfaces

Scope: the visual chrome of the editor's surfaces — background, border, shadow,
padding, and radius — across the card stack, its fields and body, and the floating
selection popover. The visual language that motivates the choices (monochrome,
typographic, restrained) is [AESTHETIC.md](AESTHETIC.md); the tokens are
[`THEMING.md`](../../THEMING.md). Prior art is web-app, whose `SURFACES.md` this
carries.

Implementation: `src/lib/visual/` — `Card`, the per-field controls, `FormatPopover`.

Two orthogonal rules decide how a surface looks, each with a single source so a new
control inherits them instead of reinventing:

1. **Elevation** — is the surface in the document flow, or floating over it?
2. **Rhythm** — one closed spacing scale and one radius base, not a per-component choice.

## Elevation

The card is the container; nothing inside it is a second box.

- **The card stack is in-flow.** A card (`--qm-card-bg`; the `main` card
  `--qm-main-bg`) carries one quiet edge — a single hairline or a soft shadow, not
  both — and one `--qm-border` value, not a different grey per card. It is the only
  container in the column.
- **Fields and the body sit chromeless inside the card.** A scalar control shows
  its value, not a frame; the body prose leaf is text on the card surface, set off
  from the fields above it by whitespace or a single hairline, never its own
  bordered box. Boxes-inside-boxes is the density the monochrome rule
  (AESTHETIC.md) removes.
- **The selection popover is the one floating surface.** With nothing behind it, it
  earns the lift the cards do without: `--qm-popover-bg`, a hairline, and a shadow
  set it apart from the content beneath (VISUAL_EDITOR_UIUX §Formatting).

## The shared recipe

Chrome comes from the `--qm-*` tokens applied one way, not hand-written per
component. The scalar controls share one control chrome — background
`--qm-field-bg`, one border, one radius; the popover chrome is the `--qm-popover-*`
set. A token change is then one edit, not one per field file. A control that mints
its own border grey or radius instead of reading the token is the drift this
prevents.

## Rhythm

**Spacing.** A small closed scale — a base step and a couple of multiples — is the
shared rhythm. Card padding and the prose-leaf inset stack to a uniform inset on
every side, so a body-shown card and a body-hidden card stay symmetric; every left
edge aligns to one gutter. Stacked regions — a card's header, its field list, its
body — are separated by one gap, not per-region margins that drift. Pick from the
scale; an in-between value is a review smell.

**Radius.** One `--qm-radius` base with at most a small derived step, by surface
weight — the card one tier, its interior controls a tighter one — not a free choice
per component. Four unrelated radii is drift, not a scale.

## Focus and active state

A surface a caret or selection can land on shows it, within the monochrome palette.
A focused field or prose leaf draws a ring rather than clearing the native outline
with nothing in its place; the active card is set apart from its neighbors (the
`active` state that pins the reorder chevrons, VISUAL_EDITOR_UIUX §"Card stack").
The active field ring is the one place a non-neutral hue is load-bearing
(`--qm-field-ring-active`), so the focused target reads at a glance.

## Preventing drift

- **Chrome → tokens.** The look lives in `--qm-*`; a component reads a token, it
  does not mint a value.
- **Scale → a closed set.** Spacing and radius are a small fixed scale; a value
  outside it is a review smell.
- **Rule → this page.** The elevation and rhythm questions have a written answer,
  so they are not re-argued per change.

## Links

[AESTHETIC.md](AESTHETIC.md) · [VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md) · [`THEMING.md`](../../THEMING.md)
