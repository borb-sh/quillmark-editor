# Surfaces

> **Implementation**: `src/lib/visual/`

## TL;DR

The visual chrome of the editor's surfaces — background, border, shadow, padding,
and radius — across the card stack, its fields and body, and the floating
selection popover. The visual language that motivates the choices (monochrome,
typographic, restrained) is [AESTHETIC.md](AESTHETIC.md); the tokens are
[`THEMING.md`](../../THEMING.md). Prior art is web-app, whose `SURFACES.md` this
carries.

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
- **Fields and the body sit quiet inside the card.** A scalar control and a prose
  leaf each carry one hairline — the shared `--qm-border` at one radius (§"The
  shared recipe") — and nothing heavier: no fill, no shadow, no frame within the
  frame. The single hairline is the floor a control needs to read as editable and
  to host its focus ring (§"Focus and active state"); a *second* box inside it —
  a nested border, a filled panel — is the density the monochrome rule
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

**Radius.** One radius base with at most a small derived step, by surface
weight — the card (and popover) one tier, interior controls a tighter one — not a
free choice per component. Four unrelated radii is drift, not a scale.

**Type.** One closed ramp, not a per-component size. A body anchor and a ratio
derive four rungs — title (card title), body (inputs, add affordances), label
(field labels), meta (section labels, diagnostics, mini controls) — with weight a
fixed convention over them (label `600`, a nested object prop's secondary label
`500`), not per-file. The ~8 ad-hoc sizes the study counted collapse to the four;
an in-between size is the drift this prevents.

**The scale in code.** All three axes are dials deriving a closed private scale
([`THEMING.md`](../../THEMING.md)) — geometry (`--qm-radius`, `--qm-space`), type
(`--qm-font-size`, `--qm-font-scale`), and colour (`--qm-bg`, `--qm-fg`, and the
three status hues, which step surfaces `bg → fg` and ink `fg → bg` in oklab). The
derivation is minted ONCE, in `core/theme.ts`, and applied as a `style` attribute
on each detached root — the editor, the portaled popover and select list, the
preview, and the source view, none of which descend from the others. A component
reads a rung, never a literal; `check:geometry`, `check:type`, and `check:theme`
gate it, so an in-between value fails CI, not just review.

## Focus and active state

A surface a caret or selection can land on shows it, within the monochrome
palette — but a **form control** and a **prose leaf** are not the same focus
case, and one rule for both is the conflation [#45] resolves:

- **Scalar controls draw a tokenized ring.** A focused `TextField` / `NumberField`
  / `EnumField` / `DateField` (and the array JSON control) shows a
  `--qm-focus-ring` outline in place of the raw UA default — themed, and consistent
  across the controls. Invariant: never clear a form control's native outline
  without a visible replacement.
- **A prose leaf keeps the caret as its focus indicator.** The blinking caret is
  the editor convention for a text-editing region — Google Docs, Notion, every
  ProseMirror surface — and a ring around a `contenteditable` reads as the form
  chrome the AESTHETIC rule strips, not as paper. So the leaf clears its
  contenteditable outline deliberately; the caret *is* the replacement, and the
  active leaf is cued quietly by tinting its wrapper hairline to `--qm-focus-ring`
  (`:focus-within`), not by a heavy ring.

One hue carries "active" across the panes: both the editor's focus ring and the
preview overlay's active box read `--qm-accent`, so a field reads as focused with
the same color in the editor and in the preview (the editor↔preview active address, VISUAL_EDITOR_UIUX §"Editor↔
preview"). The active *card* is set apart separately — the `active` state that
pins the reorder chevrons (VISUAL_EDITOR_UIUX §"Card stack").

Buttons (reorder, delete, mark, add) keep the UA `:focus-visible` ring — already
an accessible indicator; theming them is deferred, not part of [#45].

[#45]: https://github.com/borb-sh/quillmark-editor/issues/45

## Preventing drift

- **Chrome → tokens.** The look lives in the `--_qm-*` scale; a component reads a
  rung, it does not mint a value.
- **Scale → a closed set.** Spacing, radius, type, and colour are small fixed
  scales; a value outside them is a review smell.
- **Public surface → the minimum.** Ten dials are the contract; a rung is
  promotable the day a consumer needs it, and a public token is permanent.
- **Rule → this page.** The elevation and rhythm questions have a written answer,
  so they are not re-argued per change.

## Links

[AESTHETIC.md](AESTHETIC.md) · [VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md) · [`THEMING.md`](../../THEMING.md)
