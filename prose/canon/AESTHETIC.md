# Visual Aesthetic

> **Implementation**: `src/lib/visual/`

## TL;DR

The visual language of the editor surfaces — the look a consumer sees before
theming, and the rules a restyle preserves; styles live in component `<style>`
blocks, and the `/visual` playground route is the reference surface. The surface
chrome it governs (background, border, shadow, padding, radius) is
[SURFACES.md](SURFACES.md); the token baseline it draws on is
[`THEMING.md`](../../THEMING.md). Prior art is web-app, whose `AESTHETIC.md` this
carries.

## The look

Modern paper: monochrome, typographic, restrained. Hierarchy comes from type
weight and size and from whitespace, not from color fills, badges, or icon chrome.
This is the visual half of VISUAL_EDITOR_UIUX §"Complex UX, minimal UI" — dense
behavior over a thin, neutral skin — so the baseline states an opinion a consumer
overrides to its brand without fighting baked-in decoration.

## Rules

- **Monochrome and typographic.** Weight and whitespace carry hierarchy, not color
  fills or decorative borders. Color encodes meaning — an inline diagnostic
  (`--qm-diag-error`, `--qm-diag-warning`), the preview overlay's active field
  box (`--qm-accent`) — never ornament.
- **Icons encode identity or function — never decoration.** A control's glyph
  names its action: reorder, delete, a formatting mark. An icon that dresses a
  label or a section heading, doing a job a word already does, is cut. The set is
  Lucide (`@lucide/svelte`, à la carte per-icon imports); a stroke glyph inherits
  `currentColor`, so it re-tints with the surface's text token, no fill.
- **Strip redundancy.** Prefer removing chrome to adding it — a heading that
  restates the field beneath it, a divider whitespace already implies, a label the
  control already speaks. The card stack is the document's structure; it needs no
  framing that repeats it.
- **Secondary text recedes through muted type**, not heavier weight or a box.
  Field labels (`--qm-label`), section labels (`--qm-section-label`), and the
  ghosted `default:` placeholder (`--qm-ghost`) step back by tone alone.

## Neutral baseline

The shipped `--qm-*` defaults are deliberately plain — a neutral grey skin that
reads as un-branded rather than designed, so the consumer's override is the design.
The rules above are what a restyle keeps: change the hues and the font, not the
monochrome-and-whitespace hierarchy. The surface is ten dials deriving a private
scale, so a restyle is a handful of values and dark mode is two of them
([`THEMING.md`](../../THEMING.md)). Part/class hooks stay declined — a class
contract freezes internal DOM shape.
