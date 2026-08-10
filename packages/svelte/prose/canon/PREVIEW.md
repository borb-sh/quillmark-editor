# Preview

> **Implementation**: `src/lib/preview/`

## TL;DR

The headline live preview surface: turning the current document into a rendered, continuously-updating view of the output. `PreviewController` (vanilla-TS core) composes the paint loop, the field-box overlay, and the click/scroll bridge over one `LiveSession`, wrapped by a thin `<Preview>` Svelte component. The subpath imports nothing editor-side: enforced by `check:deps`, which walks the subpath's import graph rather than its direct imports.

## Shape

`PreviewController` (vanilla-TS core, `createPreview`), wrapped by a thin `<Preview>` Svelte component. It wraps **one** `LiveSession` the consumer already opened (`engine.open(quill, doc)`) and supplies exactly the layer `LiveSession` omits: viewport, DOM, DPR, and click mapping. It is a **pure view**: it paints and reads geometry off the session, never mutates it.

Grounds on quillmark's `LiveSession` (canon: quillmark `prose/canon/PREVIEW.md`), which is per-page, document-space geometry with no notion of a viewport.

## Ownership

The **consumer** owns the session and drives edits, from any source (source editor, VisualEditor, one-shot pipeline). The preview never calls `apply`:

```ts
const session = engine.open(quill, doc);            // consumer owns
const preview = createPreview(session, { container });
// …
const changeSet = session.update(nextDoc);           // edit from any source
preview.refresh(changeSet);                         // repaint dirty ∩ visible
```

One session, many edit sources, preview stays a view. `refresh(changeSet)` is the only lifecycle hop: it repaints `dirtyPages ∩ visible` and re-reads geometry.

## Three responsibilities

- **Paint**: one `<canvas>` per visible page (+ margin), painted via `session.paint`; mounted/unmounted on scroll, so memory stays bounded to *visible + margin* per the canon. Each page slot is a `.qm-page` carrying `data-page`, its index: the two hooks a consumer drawing its own overlay targets, the number being otherwise position among siblings, which holds today and is not a contract. Mounted pages repaint on container-width changes (a rAF-coalesced `ResizeObserver`) and on DPR changes (a re-arming `(resolution: …dppx)` query), so the raster tracks the `%`-positioned overlay instead of going stale; the canvases are `position:absolute`, so a repaint never feeds back into layout. When `PaintResult.clamped` caps density on an oversized page, V1 honors it silently.
- **Overlay**: one box per rect the address has, positioned as CSS `%` (Y-flipped from PDF-pt). Built by default, opt-out; **carrying no ink at rest**. `field` is not unique (a field split across pages or shown in header + footer surfaces several boxes); group by `field`, and a field's boxes bloom in step.
- **Bridge**: clicks resolve to an address and surface as a hook; commands scroll/focus a field.

A **field box** is the rectangle on the rendered page where a schema field's content lands: the field's canonical `DocPath` address (`main.subject`, `cards.<kind>[2].name`, cards by absolute document index) mapped to on-page geometry. `fieldBoxes(field)` unions a field's segment rects into one (striped) box per page.

**An address's boxes are `fieldBoxes`'s union, else its own `regions()` rects, else the rects of everything under it** (`geometry.ts`, `boxesForField`; the one rule the overlay and the scroll both read). `fieldBoxes` is span-bearing-content-only: it answers `[]` for a scalar the plate places without tracking its content and for a `richtext[]` element, and the boundary says what such a field's box is — a single `regions()` rect. The third rung is the same sentence one granularity down: an array's own ink is its elements' (`main.references` is named by no region, only `main.references.0` and `.1` are), so a host holding the declared path reaches the rows it prints. It is a fallback and not a union, so an address with rects of its own never also draws its children's.

## Overlay

**The preview draws nothing on the page at rest.** It is the surface a user proofs against (its claim is _this is the output_), so any ink the overlay leaves is ink the reader has to discount, and there is no alpha band both legible at pane scale and non-tinting. Nothing advertises that the text is clickable either: the click target is the text itself, which is what a reader tries first.

The boxes serve geometry and one event:

- **Geometry.** The bridge scrolls a field by its first box, reading the rect and not a pixel of the box itself. Each box carries `data-qm-field` (its address) and `.qm-field-box`: the hooks a consumer targets, since the correlation wash is animated from a script and cannot be restyled away.
- **The correlation bloom.** A change of active address is an event, so the field's boxes wash and decay to nothing rather than resting lit. It covers the address and everything under it, because the two ends speak different granularities and neither is wrong: the boxes are keyed as `regions()` names them (`main.references.0`), while an editor-side signal names the declared field (`main.references`). A field's boxes share one start time, so a two-box `main.subject` blooms in step instead of shimmering, and a **rebuilt box resumes its bloom, never restarts it**: `refresh` re-creates every box (the playground recompiles 120ms after each keystroke burst), so the bloom carries its start time and a fresh node picks up where the old one reached (`core/bloom.ts`). Without that, writing re-blooms the page continuously.

## Click bridge

The preview owns the pixel→pt math (inverse of the overlay transform) and the session queries; the consumer completes the caret move, because only the editor's codec maps a content offset to a ProseMirror position.

```
click → PDF-pt → session.positionAt(p, x, y) → ContentHit ─┐
             └─► session.fieldAt(p, x, y)    → { field }  ─┴► onPick(at)
                                                            ↳ consumer:
                                                              codec.usvToPM → setCaret
```

**Two rungs, and the second is the plate's.** `positionAt` answers over span-tracked content; `fieldAt` answers over every placement the compile tracks, which is a strict superset — measured against the reference quill, a whole-page sweep finds no point where `positionAt` answers and `fieldAt` does not, and none where the two name different fields. So the second rung fires exactly where a field is printed without its content being tracked, which on a memo is the front matter: `main.signature_block`, a card's.

**An absent `pos` is the placement rung**, and one hook carries both (`Landing`, `/core`): a pick names its field either way, so the coarse case is a pick with no offset rather than a second hook. A fabricated `0` would be an invented offset wearing a real one's type. `granularity` is the only precision axis, and reads where there is a `pos`: `'cluster'` → caret-exact, `'segment'` → focus the field/segment, no exact caret.

**There is no third rung hit-testing `regions()` by hand.** Its rects are bounding boxes over ink the field does not fill — `main.body`'s union spans the gap between two disjoint segments — so a click in that gap would land on the body by geometry the compile never claimed. The cost is that a click inside a content box but off its ink — the gaps between and after lines — does nothing.

## Follow-the-caret scroll

`focusPosition` locates the caret rect and `scrollToField` a field's first box; both place a throwaway absolute marker at the `%` position, measure it, and remove it, so the trip is computed off the same percent geometry the overlay draws and needs no separate zoom or DPR term.

**The preview scrolls its own scrollport and nothing else.** `container.scrollTop`, never `marker.scrollIntoView()`: that walks *every* scrollable ancestor, so a host whose document scrolls has the whole page dragged to the preview by a keystroke in the editor, taking the surface the user is typing on off screen. Instant, and with no `prefers-reduced-motion` term: no `scroll-behavior` on the container means no motion for one to cancel.

**A miss is an answer, not a failure.** `scrollToField` returns whether this compile placed anything at the address. The plate places plenty it does not track, so a `false` is ordinary; and the preview carries no schema, so it cannot tell that case from a field the host misnamed. The editor's `focusField` is what distinguishes them — it holds the mounted tree and reports `target-unknown` for a name it has no field for ([VISUAL_EDITOR.md](VISUAL_EDITOR.md)). It is not an `onError` report: that channel carries failures a surface recovered from.

**The two commands split the way the bloom does** ([VISUAL_EDITOR.md](VISUAL_EDITOR.md) §"Focus and the preview bridge"), and for the same reason. `scrollToField` is a discrete act, so it centres every time. `focusPosition` is the continuous signal (one call per keystroke and per arrow key), so it moves the pane only when the caret is not clear of the fold: the caret rect's own height of clearance at each edge, since a rect flush against one is visible and unusable, and the next line typed lands past it. The clearance derives from the target, not from a margin dial, so it scales with zoom as the caret does. Centring on every call takes the scrollport back from the user on each of them, and a preview click is one of them: the click already put its target on screen, and the `setCaret` it drives comes back through `onCaretMove` as a caret move like any other. The change-guard answers that hop too; a suppression flag for it would be redundant state.

**A recompile re-locates the followed caret.** `session.locate` answers against the last compiled layout while a consumer debounces `update`, so a caret typed past that layout's content is off-content for the whole burst: `focusPosition` no-ops and the pane sits still. Nothing re-asks when the compile lands, because the next caret event is the only thing that would, so `refresh` re-runs the last followed place through the same guard. It belongs here rather than at the consumer: the staleness sits between two session queries this module owns both ends of.

## Minimal surface

```ts
function createPreview(session: LiveSession, opts: PreviewOptions): PreviewController;

interface PreviewOptions {
  container: HTMLElement;
  margin?: number;        // pages kept painted beyond the viewport; default 1
  overlays?: boolean;     // draw field-box overlays; default true
  onPick?(at: Landing): void;            // preview → editor; `pos` absent on the placement rung
  onError?: EditorErrorHandler;          // a page paint the backend refused
}

interface PreviewController {
  refresh(change: ChangeSet): void;                  // repaint dirty ∩ visible, re-read geometry, re-locate
  scrollToField(field: DocPath): boolean;            // boxes → centre in the scrollport; false when it places none
  focusPosition(at: Place): void;                    // editor → preview: locate → caret rect → centre if past the fold
  setZoom(scale: number): void;                       // folds into densityScale, repaints visible
  destroy(): void;
}
```

## Not owned

- Compile / incremental recompile: the session's.
- The document and `apply`: the consumer's.
- Caret anchoring across edits: the VisualEditor's `StepMap`.
- Canvas text-selection / find / a11y: gone by design; keep an SVG export path alongside if needed.
