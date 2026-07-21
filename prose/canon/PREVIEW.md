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
  (Y-flipped from PDF-pt). Drawn by default — active-field ring, click targets —
  themeable via CSS vars, opt-out. `field` is not unique (a field split across
  pages or shown in header + footer surfaces several boxes); group by `field`.
- **Bridge** — clicks resolve to a content position and surface as a hook;
  commands scroll/focus a field.

A **field box** is the rectangle on the rendered page where a schema field's
content lands — the address the editor edits (`subject`, `cards[2].name`)
mapped to on-page geometry. `fieldBoxes(field)` unions a field's segment rects
into one (striped) box per page.

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
