# Phase 2 — Preview

**Goal:** the headline live-preview surface — `createPreview(session)` and its thin
`<Preview>` wrapper — turning a `LiveSession` into a rendered, continuously-updating
view. This is the first visible headline artifact: seed the reference quill, paint
it, scroll it, click it.

**Implements:** [PREVIEW](../canon/PREVIEW.md).

**Depends on:** Phase 1. **Independent of Phase 3** — Preview needs no ProseMirror,
so it runs in parallel with the Codec.

## In scope — the three responsibilities

- **Paint.** One `<canvas>` per visible page (plus a margin band), painted via
  `session.paint`, mounted/unmounted on scroll so memory stays bounded to
  *visible + margin*. Each page gets its own canvas (the painter owns the whole
  backing store — no shared canvas, no sub-rect painting).
- **Overlay.** Field-box rectangles from `session.fieldBoxes`, positioned as CSS
  `%` with the Y-flip from PDF-point (bottom-left) space. Drawn by default,
  themeable via CSS vars, opt-out. Group by `field` (a field spans pages / repeats
  in header+footer → several boxes).
- **Bridge.** Clicks resolve pixel→PDF-pt (inverse of the overlay transform) →
  `session.positionAt` → `ContentHit` → `onCaretPick(hit)`. `scrollToField`,
  `focusPosition`, `setZoom` complete the command surface.

## Out of scope

Compile/recompile (the session's), the document and `apply` (the consumer's),
caret anchoring across edits (the VisualEditor's), and canvas text-selection /
find / a11y (gone by design — an SVG export path may sit alongside if needed).
Preview is a **pure view**: it never calls `apply`, never mutates the session.

## The flow

```
consumer: session.apply(nextDoc) ─► ChangeSet
                                       │
          preview.refresh(changeSet) ─► repaint (dirtyPages ∩ visible), re-read geometry

click ─► PDF-pt ─► session.positionAt ─► ContentHit ─► onCaretPick(hit)
                                                         ↳ consumer completes the caret move
```

`refresh(changeSet)` is the only lifecycle hop. One session, many edit sources,
preview stays a view.

## Settled decisions

- **Overlay theming tokens.** A minimal named CSS-var set for the active-field
  ring and click targets; the wider theming contract is Phase 5's — no broad
  system here.
- **Zoom model.** Zoom is density (crispness): `setZoom` folds into
  `densityScale` and layout width tracks the container, per the paint contract's
  `layoutScale × densityScale`. A separate layout-zoom waits for a fit-to-width
  control to demand it.
  - **Resize/DPR repaint (issue #9).** "Layout width tracks the container" and
    the exit criterion below both assume a mounted canvas keeps filling its page
    box, but each paint freezes `canvas.style.width/height` and nothing re-ran it
    on a live page — a resize or DPR change left the raster stale under the
    %-tracked box (overlays drift off the ink). The paint loop now owns a
    rAF-coalesced `ResizeObserver` (container width) + a re-arming
    `matchMedia('(resolution: …dppx)')` listener (DPR) that repaint mounted pages;
    canvases are `position:absolute`, so the repaint can't feed back into layout.
    This adds behavior beyond the original zoom decision but upholds its premise —
    recorded here per the deviation policy. Browser-only, so verified in the e2e
    tier (`e2e/preview.spec.ts` case (i)), not jsdom.
- **`clamped` handling.** When `PaintResult.clamped` forces density down (large
  page > 16384 px), honor it silently in V1; surface the soft-render state only
  if it bites the reference quill.

## Exit criteria

- The playground paints the multi-page `usaf_memo` render; scrolling
  mounts/unmounts canvases and memory stays bounded to visible + margin.
- Field-box overlays land on the right rectangles across pages and survive a
  container resize (percent positioning).
- A click on field ink fires `onCaretPick` with a `ContentHit` carrying the right
  `field`; a click on margin/chrome fires nothing.
- `scrollToField` / `focusPosition` / `setZoom` behave; an `apply` from the
  playground repaints only dirty ∩ visible pages.

## New dependencies

None beyond Phase 1 — the canvas API and `LiveSession` are enough.

## Risks / watch-items

- The pixel↔PDF-pt inverse must exactly mirror the overlay's forward transform, or
  clicks and boxes drift apart; make this one shared transform, tested against
  known geometry.
- DPR and the 16384-px backing clamp are browser-only — they land in the
  playground harness, not unit tests. Verify by driving the playground in a
  real browser (headless is fine; scripted checks stand in for a human pass).
- `fieldBoxes` returns content boxes only (scalar-reference / widget fields carry
  no `span`); the overlay must not assume every field has a union box.
