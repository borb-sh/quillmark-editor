# Preview

> **Implementation**: `src/lib/preview/`

## TL;DR

The headline live preview surface — turning the current document into a rendered,
continuously-updating view of the output. `PreviewController` (vanilla-TS core)
composes the paint loop, the field-box overlay, and the click/scroll bridge over
one `LiveSession`, wrapped by a thin `<Preview>` Svelte component. The subpath
imports nothing editor-side — enforced by `tests/preview-boundary.test.ts`.

## Shape

`PreviewController` (vanilla-TS core, `createPreview`), wrapped by a thin
`<Preview>` Svelte component. It wraps **one** `LiveSession` the consumer
already opened (`engine.open(quill, doc)`) and supplies exactly the layer
`LiveSession` omits: viewport, DOM, DPR, and click mapping. It is a **pure
view** — it paints and reads geometry off the session, never mutates it.

Grounds on quillmark's `LiveSession` (canon: quillmark `prose/canon/PREVIEW.md`),
which is per-page, document-space geometry with no notion of a viewport.

## Ownership

The **consumer** owns the session and drives edits, from any source (source
editor, VisualEditor, one-shot pipeline). The preview never calls `apply`:

```ts
const session = engine.open(quill, doc);            // consumer owns
const preview = createPreview(session, { container });
// …
const changeSet = session.apply(nextDoc);           // edit from any source
preview.refresh(changeSet);                         // repaint dirty ∩ visible
```

One session, many edit sources, preview stays a view. `refresh(changeSet)` is
the only lifecycle hop — it repaints `dirtyPages ∩ visible` and re-reads
geometry.

## Three responsibilities

- **Paint** — one `<canvas>` per visible page (+ margin), painted via
  `session.paint`; mounted/unmounted on scroll, so memory stays bounded to
  *visible + margin* per the canon. Mounted pages repaint on container-width
  changes (a rAF-coalesced `ResizeObserver`) and on DPR changes (a re-arming
  `(resolution: …dppx)` query), so the raster tracks the `%`-positioned overlay
  instead of going stale; the canvases are `position:absolute`, so a repaint never
  feeds back into layout. When `PaintResult.clamped` caps density on an oversized
  page, V1 honors it silently.
- **Overlay** — field boxes (`session.fieldBoxes`) positioned as CSS `%`
  (Y-flipped from PDF-pt). Built by default, opt-out; **carrying no ink at rest**.
  `field` is not unique (a field split across pages or shown in header + footer
  surfaces several boxes); group by `field`, and a field's boxes bloom in step.
- **Bridge** — clicks resolve to a content position and surface as a hook;
  commands scroll/focus a field.

A **field box** is the rectangle on the rendered page where a schema field's
content lands — the field's canonical `DocPath` address (`main.subject`,
`cards.<kind>[2].name`, cards by absolute document index) mapped to on-page
geometry. `fieldBoxes(field)` unions a field's segment rects into one (striped)
box per page.

## Overlay

**The preview draws nothing on the page at rest.** It is the surface a user proofs
against — its claim is *this is the output* — so any ink the overlay leaves is ink
the reader has to discount. That rules out a resting hairline, and it rules out a
resting wash more strongly: a hairline becomes a filled area over `main.body`,
present during the activity that dominates the session. There is no alpha band that
is both legible at pane scale and non-tinting, so the answer is not a fainter resting
state but no resting state.

What the boxes are for, then, is geometry and one event:

- **Geometry.** The bridge scrolls a field by its first box; the e2e locates ink by
  the rect. This never needed to be visible.
- **The correlation bloom.** On a change of active address the field's boxes wash to
  `--_qm-accent-wash` and decay to zero over `--_qm-duration-linger`. A field's boxes
  share one start time, so a two-box `main.subject` blooms in step instead of
  shimmering.

Two consequences worth stating, because both are easy to reintroduce:

- **A rebuilt box RESUMES its bloom, never restarts it.** `refresh` re-creates every
  box, and the playground recompiles 120ms after each keystroke burst — a CSS
  animation on a fresh node would re-bloom continuously while the user writes. The
  bloom carries its start time, so a rebuilt node picks up at the offset the old one
  reached (`core/bloom.ts`).
- **Discoverability is not the overlay's job any more.** The idle hairline was the
  only hint that preview text is clickable, and it is gone. The click target is the
  text itself, which is what a reader would try first; touch had no hover affordance
  to lose either way. If this proves too quiet, the reserve answer is an off-paper
  mark in the pane margin beside the page — the only form that can rest without
  contaminating the proof.

## Click bridge

The preview owns the pixel→pt math (inverse of the overlay transform) and the
session query; the consumer completes the caret move, because only the editor's
codec maps a content offset to a ProseMirror position.

```
click → PDF-pt → session.positionAt(p, x, y) → ContentHit → onCaretPick(hit)
                                                            ↳ consumer:
                                                              codec.usvToPM → setCaret
```

`ContentHit.granularity` decides precision: `'cluster'` → caret-exact;
`'segment'` → focus the field/segment, no exact caret. `positionAt` returns
nothing for non-field ink (margins, page chrome) — the hook does not fire. One
hook suffices: `ContentHit` carries `field`, so coarse "focus this field" is just
ignoring `pos`.

## Minimal surface

```ts
function createPreview(session: LiveSession, opts: PreviewOptions): PreviewController;

interface PreviewOptions {
  container: HTMLElement;
  margin?: number;        // pages kept painted beyond the viewport; default 1
  overlays?: boolean;     // draw field-box overlays; default true
  onCaretPick?(hit: ContentHit): void;   // preview → editor
}

interface PreviewController {
  refresh(change: ChangeSet): void;                  // repaint dirty ∩ visible, re-read geometry
  scrollToField(field: string): void;                // fieldBoxes → scroll into view
  focusPosition(field: string, pos: number): void;   // editor → preview: locate → caret rect → scroll
  setZoom(scale: number): void;                       // folds into densityScale, repaints visible
  destroy(): void;
}
```

## Not owned

- Compile / incremental recompile — the session's.
- The document and `apply` — the consumer's.
- Caret anchoring across edits — the VisualEditor's `StepMap`.
- Canvas text-selection / find / a11y — gone by design; keep an SVG export path
  alongside if needed.
