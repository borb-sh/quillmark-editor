# Visual Aesthetic

> **Implementation**: `src/lib/visual/`

## TL;DR

The visual language of the editor surfaces — the look a consumer sees before
theming, and the rules a restyle preserves; styles live in component `<style>`
blocks, and the `/visual` playground route is the reference surface. The surface
chrome it governs (background, border, shadow, padding, radius) is
[SURFACES.md](SURFACES.md); the public dials behind it are
[`THEMING.md`](../../THEMING.md). Prior art is web-app, whose `AESTHETIC.md` this
carries.

## The look

Modern paper: monochrome, typographic, restrained. Hierarchy comes from type
weight, size and leading and from whitespace, not from color fills, badges, or
icon chrome. Leading is the whole of what tells the card's paper from the card's
chrome, since the body sits on the same size rung as the input beside it
(SURFACES §Rhythm). This is the visual half of VISUAL_EDITOR_UIUX §"Complex UX,
minimal UI" — dense behavior over a thin, neutral skin — so the baseline states
an opinion a consumer overrides to its brand without fighting baked-in
decoration.

## Rules

- **Monochrome and typographic.** Weight and whitespace carry hierarchy, not color
  fills or decorative borders. Color encodes meaning — an inline diagnostic
  (`--_qm-danger`, `--_qm-warning`), a focused control's ring (`--_qm-accent`) —
  never ornament. The three status hues are the only rungs that leave the two-pole
  greyscale.
- **The authored document takes the same rule as the chrome around it.** A leaf
  renders a heading by weight, a link by a dotted underline, code by
  `--_qm-font-mono` — never by a size ramp, a fill, or a hue. Two reasons, and they
  agree: there is no hue to spend, since `--_qm-accent` already means focus and a
  fourth meaning on it collides with the ring; and the package cannot know what a
  quill's paper does with a heading level, so a size ramp in the leaf is the editor
  predicting a hierarchy the rendered page may not set — the reference quill
  collapses all six levels into a bold run-in. The level survives in the model, where
  the codec round-trips it; type is just not what carries it.
- **Colour that answers nothing is ornament, however faint.** The test is whether
  removing it loses an answer, not whether it is faint enough to tolerate. A hairline
  on every field box, present before anything is focused or clicked, answers nothing
  at 55% alpha or at any other. So the preview draws none: correlation is marked as
  an event that decays (SURFACES §Motion), and the page rests clean.
- **Icons encode identity or function — never decoration.** A control's glyph
  names its action: reorder, delete, a formatting mark. An icon that dresses a
  label or a section heading, doing a job a word already does, is cut. The set is
  Lucide (`@lucide/svelte`, à la carte per-icon imports); a stroke glyph inherits
  `currentColor`, so it re-tints with the surface's ink rung, no fill.
- **Strip redundancy.** Prefer removing chrome to adding it — a heading that
  restates the field beneath it, a divider whitespace already implies, a label the
  control already speaks. The card stack is the document's structure; it needs no
  framing that repeats it. A button carrying a field's border is the rule's concrete
  case: a box says "type here", so buttons are unboxed (SURFACES §"The shared
  recipe"). A dashed edge is narrower still — it says "nothing is here yet", which
  leaves one honest use, the un-schemable card, where that is the state being
  reported.
- **Secondary text recedes through muted type**, not heavier weight or a box. Field
  labels (`--_qm-ink-label`), section labels (`--_qm-ink-meta`), and the ghosted
  `default:` placeholder (`--_qm-ink-ghost`) step back by tone alone — three rungs
  off one ink pole, so the recession holds at any palette. An affordance that
  recedes rather than text does it by opacity on the same ladder
  (`--_qm-opacity-idle`, `--_qm-opacity-muted`), never by a lighter grey it mints.

## Neutral baseline

The shipped defaults are deliberately plain — a neutral grey skin that reads as
un-branded rather than designed, so the consumer's override is the design. The
rules above are what a restyle keeps: change the hues and the font, not the
monochrome-and-whitespace hierarchy. The surface is a small dial set deriving a
closed private scale ([`THEMING.md`](../../THEMING.md)), so a restyle is a handful
of values and dark mode is two of them. Part/class hooks stay declined — a class
contract freezes internal DOM shape.
