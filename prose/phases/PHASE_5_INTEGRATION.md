# Phase 5 — Integration, bridges & hardening

**Goal:** wire the surfaces into one reference experience, close the consumer-layer
glue the primitives push outward, and harden the package for release — the caret
bridge, diagnostics routing, the split shell, the debug source view, a theming
baseline, and a public-API audit. Then promote the settled designs into `canon/`.

**Implements:** [ARCHITECTURE](../designs/ARCHITECTURE.md) (playground, public API,
theming), and the seams the surface docs push to the consumer.

**Depends on:** Phases 2, 3, and 4.

## In scope

- **The caret bridge, both directions.** `preview.onCaretPick(hit)` → resolve
  `hit.field` to a leaf → `codec.corpusToPM(hit.pos)` → set the PM caret (a
  `'segment'` hit just focuses); and a caret move in the active leaf →
  `preview.focusPosition(field, pos)`. The bridge lives at the **consumer** layer
  and is opt-in — the editor is unaware of the preview.
- **Diagnostics routing.** Merge the three producers (`quill.validate`,
  `LiveSession.warnings`, render errors via `FieldRegion.field`), key them to field
  addresses, de-duplicate with a settled precedence. This is the editor's own slice
  named in [DOCUMENT_MODEL](../designs/DOCUMENT_MODEL.md) §Diagnostics routing.
- **The split-pane shell.** The editor|preview layout, session open, and edit
  routing — the reference wiring the playground demonstrates (one session, edits
  from the VisualEditor, `preview.refresh` on each `ChangeSet`).
- **Debug source view.** A read-only `Document.toMarkdown()` / source round-trip
  behind CodeMirror — a debug view, **not** an editable dual mode (the layer
  federation deletes).
- **Theming baseline.** The minimal, overridable custom-property surface that
  delivers "complex UX, minimal UI" — a neutral baseline a consumer restyles
  without fighting baked-in design.
- **Public-API audit & release readiness.** Every subpath is a clean module root;
  `/preview` reaches **no** editor-side import (so the reserved `@quillmark/preview`
  promotion stays a re-export); the playground consumes only the public API;
  `publint` / `svelte-check` / `prettier` green; README and usage docs.
- **Promote to canon.** Move the now-implemented designs into `prose/canon/`
  (`canon/INDEX.md` is waiting), leaving `designs/` for what is still in flight.

## Out of scope

Auth, persistence, autosave, multi-doc management — the playground stays a harness,
not a product (`ARCHITECTURE` §Playground). New authoring surfaces (the deferred
insert menu / table authoring) remain deferred.

## The flow

```
one LiveSession (consumer-owned)
   VisualEditor edits ──► applyChange / writer ──► session.apply ──► ChangeSet ──► preview.refresh
   preview click ──► CorpusHit ──► onCaretPick ──► codec.corpusToPM ──► editor caret
   editor caret ──► preview.focusPosition
   validate + warnings + render errors ──► merged, field-keyed ──► inline diagnostics
```

## Decisions this phase forces

- **Diagnostics precedence.** The de-dup order when a field carries a validate
  error, a session warning, and a render error at once. *Recommended:* hard field
  errors (coercion failures) outrank `must_fill`/soft warnings outrank
  session/render notes; settle the exact ladder against real `usaf_memo` cases.
- **The theming contract.** Custom-property names, class-vs-part hooks, what a
  consumer overrides — explicitly open in the UI/UX design. *Recommended:* ship a
  small, documented token set covering the overlay, the card chrome, and the prose
  leaf; leave the broad system for a later pass rather than over-specifying now.
- **Source view scope.** Whether the debug view is document-wide only or per-field.
  *Recommended:* whole-document read-only markdown in V1.

## Exit criteria

- The playground is the full reference harness: pick the quill, edit every field
  type, watch the preview follow edits and the caret bridge round-trip both ways,
  see diagnostics inline. No internal reach-through — public API only.
- `/preview` builds with zero editor-side imports; the subpath dist passes
  `publint`; the package installs and mounts in a bare vanilla-TS consumer in a few
  lines (the architecture's stated bar).
- The debug source view renders canonical markdown read-only.
- Implemented designs are promoted into `canon/` with `canon/INDEX.md` populated;
  `designs/` retains only genuinely open work.

## New dependencies

CodeMirror (debug source view). Any theming-token tooling if used. Pinned.

## Risks / watch-items

- The `/preview`-editor-import-free rule is easy to violate accidentally once
  everything is in one repo; the import-boundary check lands with Phase 1's
  skeleton — keep it green, and audit the built `dist` here so the
  reserved-package promotion stays a re-export, not a refactor.
- The bridge must stay consumer-layer — folding it into the editor would couple the
  two headline surfaces the designs deliberately keep independent.
- Promotion to canon is not a rename: canon "describes what *is* and points into the
  code," so each promoted doc gets a pass to match the shipped reality, not a
  copy-paste of the design.
