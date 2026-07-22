# Resting Fields

> **Status**: proposed, unscheduled. On promotion amends
> [SURFACES.md](../canon/SURFACES.md) §Elevation and
> [AESTHETIC.md](../canon/AESTHETIC.md).

## TL;DR

Fields rest as typography and grow control chrome only when engaged, so the
editor at rest reads like the document it produces, not a form. Covers the card
stack's scalar controls and prose leaves; the sibling proposal for the preview
pane is [QUIET_PREVIEW.md](QUIET_PREVIEW.md).

## The problem

Every scalar control and prose leaf carries a bordered, filled box at rest
(`--qm-border` + `--qm-field-bg`), so a card reads as a column of inputs that
happens to produce a document. The box restates what the label, the ghosted
placeholder, and the caret already say — editability — and it is the densest
visual element on an otherwise monochrome surface. SURFACES already rules that
"fields sit chromeless inside the card"; today that holds for neither scalars
nor prose leaves.

## Direction

Two field states:

- **Resting** — the value typeset on the card surface: muted label
  (`--qm-label`), value in body type, no border, no fill. An empty field keeps a
  visible affordance — the ghosted `default:` (`--qm-ghost`) over a quiet
  underline or inset — so empty-and-editable never reads as absent.
- **Engaged** — on hover, the control chrome fades in; on focus, the full
  control: `--qm-field-bg`, border, and the focus ring
  ([#45](https://github.com/borb-sh/quillmark-editor/issues/45)). A field with a
  routed diagnostic holds engaged chrome while the diagnostic is present, so an
  error is never pinned to bare text.

The card title already does this — transparent at rest, border on hover/focus —
so the proposal is that pattern applied stack-wide. Prior art outside the repo:
Linear's issue properties, iWork's inline editing.

## Open questions

- **Discoverability floor.** Does an all-typeset card read as read-only to a
  first-time user? Mitigations to test in the playground before promotion: the
  hover chrome, `cursor: text` over resting fields, the ghosted empties.
- **Touch.** No hover state exists: engaged chrome always on for coarse
  pointers, or first-tap-engages?
- **Dense rows.** `ui.compact` packs fields onto a shared row; resting values
  with muted labels may need a separator the border used to provide.
- **Dependencies.**
  [#45](https://github.com/borb-sh/quillmark-editor/issues/45) — the resting
  border cannot go until a focus ring exists to replace it;
  [#46](https://github.com/borb-sh/quillmark-editor/issues/46) —
  chrome-on-demand summons tokenized chrome, not per-component literals.
