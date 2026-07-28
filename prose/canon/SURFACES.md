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

- **The card stack is in-flow.** Every card carries one quiet edge — a single
  hairline at `--_qm-border`, not a hairline and a shadow — over
  `--_qm-surface-raised`. One tone and one border rung across all of them, `main`
  included, not a different grey per card. The card is the only container in the
  column.
- **A card's tone is the package's; the page behind it is not.** So no card takes a
  rung that reads only against a particular backdrop: plain `--qm-bg` behind the
  column is a supported case, and a card at the base surface is invisible in it.
  What the package guarantees is the card↔control relationship, which holds whatever
  is behind — a control is one rung off its card, always. `main` needs no tone to say
  which card it is: it is the only headerless card, the only one without
  reorder/delete, and the first in the column.
- **Fields and the body sit quiet inside the card.** A scalar control and a prose
  leaf each carry one hairline — the shared `--_qm-border` at `--_qm-radius-inner`
  over `--_qm-surface` (§"The shared recipe") — and nothing heavier: no fill, no
  shadow, no frame within the frame. The single hairline is the floor a control
  needs to read as editable and to host its focus ring (§"Focus and active state");
  a *second* box inside it — a nested border, a filled panel — is the density the
  monochrome rule (AESTHETIC.md) removes.
- **The rungs step toward the ink, which the word "raised" only half means.** A card
  is *darker* than the page in light and *lighter* in dark: a tinted plate laid on
  the page, not a lit surface floating above it. The three surface rungs sit 4pp
  apart — the step at which a hovered item reads against a card — so each carries a
  plane on its own. "Elevated is lighter" in both poles needs a mode signal the
  derivation deliberately does not have (THEMING.md; #83 is the same wall).
- **The floating surfaces earn the lift the cards do without.** The selection
  popover takes `--_qm-surface-popover` (the *raised* surface mixed toward
  transparent) behind a `--_qm-blur` backdrop, a hairline, and
  `--_qm-shadow-popover`; the enum listbox takes the same shadow over an opaque
  `--_qm-surface`, since a list of choices reads through worse than a row of glyphs.
  Both sit over content with nothing behind them (VISUAL_EDITOR_UIUX §Formatting).

## The shared recipe

Chrome comes from the rungs applied one way, not hand-written per component. Three
recipes carry it, each **one rule in `visual/controls.css` a component opts into by
carrying its class** — the same shape as `.qm-focus-ring`, and for the same reason:
a rung fixes a value, but which declarations make a control cannot be assembled per
file and stay identical. Five hand-kept copies agree until one is edited, and
nothing raises it — no literal is minted, so `check:style` stays green while a
control renders subtly wrong.

- **`.qm-control-box`** — a typed value's box: `--_qm-surface`, one `--_qm-border`
  hairline, `--_qm-radius-inner`, `--_qm-text-body`, one padding rung. Every scalar
  control and every prose leaf.
- **`.qm-icon-btn` / `.qm-add-affordance`** — the two button families; see below.
- the two floating surfaces share the popover recipe above.

A palette change is then one dial, not one edit per field file. A control that mints
its own border grey or radius instead of reading the rung is the drift this prevents.

**A button reads the button recipe, and it is not the box.** A glyph or text button —
reorder, delete, array remove, both add affordances, the tips foot — is ink on the
card: no resting border, no resting fill, `--_qm-surface-hover` arriving on hover,
`--_qm-radius-inner` (a pill on the add triggers, which fill rather than tint,
having no resting ink for a hover to shift). The distinction one recipe for both
would lose: *a field is a box because you type into it; a button is not a box
because you press it.* Destructive ink (`--_qm-danger`) stays — that is meaning, not
chrome. Every button clears WCAG 2.5.8's 24×24 off `--_qm-tap-min`: a threshold the
spec fixes rather than a step on the space scale, so it does not move when
`--qm-space` does, and `min-*` is outside every `check:style` axis — a second
expression of the same floor would have nothing watching it.

**An inline prose leaf is inside that recipe, not beside it.** A field constrained
to one paragraph is a control in a row of controls, so it draws the same five
declarations and is therefore exactly as tall as the `.qm-input` next to it — by
construction, with no floor of its own. Two `min-height` literals tuned to agree
would drift the first time either box changed. The block leaf — the body — is the
one that is not a control: it opens at a few lines and grows.

## Rhythm

**Spacing.** A small closed scale — `--_qm-space` and its `half`/`2`/`3`/`4`
multiples — is the shared rhythm. Card padding and the prose-leaf inset stack to a
uniform inset on every side, so a body-shown card and a body-hidden card stay
symmetric; every left edge aligns to one gutter. Stacked regions — a card's header,
its field list, its body — are separated by one gap, not per-region margins that
drift. Pick from the scale; an in-between value is a review smell.

**Capacity.** A field section's column count is a closed ramp too — 1 → 2 → 4, at
`28rem` and `57rem` of CONTAINER width (VISUAL_EDITOR_UIUX §"Section grid"). Each
rung is the width at which a track still clears ~220px, the narrowest a labelled
control reads comfortably; the ramp skips 3 so a half-capacity span lands on a track
boundary at every rung. These are geometry thresholds like the tap-target floor —
they answer to what a control needs, not to `--qm-space` — so they do not derive
from the spacing dial and do not move when it does.

**Radius.** One radius base with at most a small derived step, by surface weight —
the card and the two floating surfaces at `--_qm-radius`, interior controls at the
tighter `--_qm-radius-inner` — not a free choice per component. `--_qm-radius-pill`
is a shape tier beside the ramp rather than a step on it, so a fully-rounded end cap
stays round at any `--qm-radius`. Four unrelated radii is drift, not a scale.

**Type.** One closed ramp, not a per-component size. A body anchor and a ratio
derive four rungs — `--_qm-text-title` (card title), `--_qm-text-body` (every
control: inputs, the select trigger, the date field, both prose leaves, add
affordances), `--_qm-text-label` (field labels, section headers),
`--_qm-text-meta` (diagnostics, mini controls) — with weight a fixed convention
over them (`--_qm-weight-label` on a field label, `--_qm-weight-soft` on a nested
object prop's secondary label), not per-file. The ~8 ad-hoc sizes the study counted
collapse to the four; an in-between size is the drift this prevents.

A control **reads** the rung; it does not inherit a size. Inheriting is the drift
that hides from the gate — no literal is minted, so nothing fails, and the control
silently takes the host page's body size. That inverts the ladder against the label
over it and makes control height a property of the consumer's page rather than of
the package.

**The scale in code.** All three axes are public dials deriving a closed private
scale ([`THEMING.md`](../../THEMING.md)) — geometry (`--qm-radius`, `--qm-space`),
type (`--qm-font-size`, with the ratio between rungs a fixed constant), and colour
(`--qm-bg`, `--qm-fg`, and the three status hues, which step surfaces `bg → fg` and
ink `fg → bg` in oklab). The derivation is minted ONCE, as a stylesheet in `core/`
the package imports itself, and applies to every element marked `data-qm-root` —
the editor, the portaled popover and select list, the preview, and the source view,
none of which descend from the others. That rule carries the baseline font and ink
too, so a root inherits them by carrying the marker rather than by restating a
declaration; it stops short of a body `font-size`, because a root rule sweeps every
descendant a consumer may have mounted inside the marker — a reach the derivation
does not have. Each surface reads the rung instead. A component reads a rung, never
a literal; `check:style` gates all three axes, so an in-between value fails CI, not
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

One hue carries "active" across the panes: the editor's focus ring and the
correlation bloom both resolve `--_qm-accent`, so a field reads as engaged with the
same colour on either side (the editor↔preview active address, VISUAL_EDITOR_UIUX
§"Editor↔preview"). The two differ in what they are, not in hue. Focus is a state
the editor holds, so the editor draws it and holds it. Correlation is an event — the
moment an address crossed between the panes — so a wash marks it and decays to
nothing. **The preview carries no focus ink at all**: it claims to be the rendered
output, and a border it draws on the page it is proving is a border the document did
not ask for. What the overlay draws instead is in PREVIEW §Overlay. The active *card* is set apart
separately — the `active` state that pins the reorder chevrons (VISUAL_EDITOR_UIUX
§"Card stack").

One ring width, therefore: `--_qm-ring-width` is focus, and nothing sits under it as
a held-back tier.

Buttons (reorder, delete, mark, add) keep the UA `:focus-visible` ring — already
an accessible indicator; theming them is deferred, not part of [#45].

[#45]: https://github.com/borb-sh/quillmark-editor/issues/45

## Motion

Three duration rungs, named for what the eye is doing rather than for a component:

- `--_qm-duration-fast` — a state toggling under the pointer that nobody watches: a
  hover-revealed control, a switch's knob, a popover's entrance.
- `--_qm-duration-slow` — a size or position the eye tracks, so it needs to be
  followable: the group accordion's `0fr↔1fr` row, a chevron's rotation.
- `--_qm-duration-linger` — the correlation bloom, the one duration a user actually
  waits out. Long enough that a wash which rises and decays is legible as a single
  gesture rather than a flicker.

Duration is the axis with no units of its own: every value looks plausible, so a
surface picking its own drifts silently. It is a scale like the others and
`check:style` gates it — in CSS, and in the script that animates the bloom over WAAPI
(`core/bloom.ts` reads the rung off the element rather than forking the number).

Under `prefers-reduced-motion: reduce` a transition is dropped and the bloom loses
its ramps — it holds at full for a beat and cuts. That degradation is only available
because the bloom decays to **zero**: a wash that settled at a resting tint would
have no honest reduced-motion form, since the thing being animated would also be the
thing left behind.

## Preventing drift

- **Chrome → rungs.** The look lives in the `--_qm-*` scale; a component reads a
  rung, it does not mint a value.
- **Scale → a closed set.** Spacing, radius, type, colour, and duration are small
  fixed scales; a value outside them is a review smell.
- **Public surface → the minimum.** The dials are the contract
  ([`THEMING.md`](../../THEMING.md) counts them); a rung is promotable the day a
  consumer needs it. Fewer names is the point — each one is a thing a reader holds.
- **Rule → this page.** The elevation and rhythm questions have a written answer,
  so they are not re-argued per change.

## Links

[AESTHETIC.md](AESTHETIC.md) · [VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md) · [`THEMING.md`](../../THEMING.md)
