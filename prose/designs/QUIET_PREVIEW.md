# Quiet Preview

> **Status**: proposed, unscheduled. On promotion amends
> [PREVIEW.md](../canon/PREVIEW.md) §Overlay and the ring defaults in
> [`THEMING.md`](../../THEMING.md).

## TL;DR

The preview is the proof sheet: the page shows its own ink, and the field-box
overlay surfaces only for the active field and under the pointer — no idle ring
on every box. The click bridge and the caret follow are untouched. The sibling
proposal for the editor pane is [RESTING_FIELDS.md](RESTING_FIELDS.md).

## The problem

The overlay draws by default on every field box: an idle ring
(`--qm-field-ring`, blue at 0.55 alpha) on all of them, all the time. The one
surface whose job is to look exactly like the output ships decorated — against
AESTHETIC's "color encodes meaning, never ornament" — and the only relief is
wholesale opt-out (`overlays={false}`), which also discards the active-field
ring the caret bridge feeds.

## Direction

Three overlay states per field box, replacing the idle/active pair:

- **Hidden** — the resting state of every box. The page is ink.
- **Hover** — the box under the pointer draws the quiet ring
  (`--qm-field-ring`, repurposed from idle to hover): the click affordance
  appears exactly when the user is aiming.
- **Active** — the focused field's box draws the strong ring
  (`--qm-field-ring-active`), following the caret bridge as today.

`overlays={false}` keeps its meaning. Click-to-caret, `focusPosition`, and
scroll behavior are unchanged — the bridge reads geometry from the session, not
from the overlay DOM.

## Open questions

- **Discoverability.** Without idle rings, what says the page is clickable — a
  cursor change over field ink, a one-time reveal on first render, or the hover
  ring alone? Playground test before promotion.
- **Touch.** No hover state; tap is reveal and caret-place in one gesture.
  Confirm the active ring alone carries enough feedback.
- **Default flip.** V1 ships idle rings on; the quiet policy changes consumers'
  rendered chrome. Decide whether it lands as the new default or opt-in until a
  breaking release.
