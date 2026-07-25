# Architecture

> **Implementation**: `src/lib/` (the package) · `src/routes/` (the playground)

## TL;DR

What `@quillmark/editor` is — the VisualEditor and Preview surfaces, the shared
document/engine substrate beneath them, the data flow between them, and the
package's public API (the minimal source editor lives here as a debug view).
`src/lib/` → `svelte-package` → `dist/` is the published tarball; `src/routes/`
is the playground.

## Core vs chrome

TS-first, zero `.js`. Two layers:

- **Vanilla TS core** — no framework: the `@quillmark/wasm` + quiver boundary,
  document model, codec, ProseMirror + CodeMirror integration, and the preview
  paint loop. Pure `.ts`; ships framework-free `.d.ts`.
- **Svelte + bits-ui chrome** — `.svelte` components (`<script lang="ts">`) for
  toolbars, the schema-driven metadata form, and the split-pane shell;
  `.svelte.ts` modules for shared reactive logic.

The heavy libraries (ProseMirror, CodeMirror, canvas paint) are already
framework-agnostic, so the core carries the substance and the chrome stays thin.
Svelte earns its place in the stateful UI; a vanilla-core consumer wraps a mount
API in a few lines.

## Packaging

**One package, `@quillmark/editor`, with subpath exports** — `/core`, `/preview`,
`/visual`, `/source` ship; `/form` is reserved for the deferred metadata surface.
Not split into `@quillmark/preview` etc.

Subpaths, not separate packages, because the thing a split would buy — a
preview-only consumer not pulling ProseMirror/CodeMirror — is a dependency-graph
concern that subpath entries already solve: each subpath is its own module root,
so a bundler pulls only what the imported entry reaches. The one thing separate
packages add, independent versioning, is a cost here: the surfaces share a
substrate (Document model, engine boundary, `ContentHit`/`ChangeSet` types) and
co-evolve, so a per-package version matrix is tax with no payer.

Reserved, not taken: `@quillmark/preview` as its own package. Preview is the one
surface with a distinct audience (read-only viewer, share page, CI screenshot)
that wants neither a dep named "editor" nor the editor deps. Keep the `/preview`
subpath free of any editor-side import so the promotion stays a re-export, not a
refactor — pay it when a viewer-only consumer appears.

Each subpath export declares `types` + `svelte` + `default`, all pointing at the
`dist/<subpath>/index.js` module root; `publint` gates the map.

## Playground

The repo ships a self-hosted playground app alongside the library — the
SvelteKit lib/app duality: `src/lib/` → `svelte-package` → the published tarball
(`files: ["dist"]` keeps the app out), `src/routes/` → a static build → the
deployed playground. It is the reference wiring for the shell glue the
primitives push outward (`preview.onCaretPick → codec → visualEditor.setCaret`,
session open, diagnostics routing) and the manual harness for what unit tests
cannot reach (canvas paint, scroll virtualization, DPR, the click round-trip).
Two guardrails: it consumes only the public API (a needed internal is an API
gap to fix, and exercising the subpaths proves their seams are clean), and it
stays a harness, not a product (pick a quill, edit, preview, diagnostics — no
auth, persistence, or multi-doc management).

The routes are `/preview` (paint + overlay + click bridge), `/visual` (the
VisualEditor over a seeded document), and `/editor` — the reference **split-pane
shell**: one `LiveSession`, the VisualEditor and Preview over one document, the
caret bridge wired both ways, the preview following edits on a debounced
`session.apply`, `session.warnings` routed to inline diagnostics, and the source
view. The bridge is consumer-layer glue: the editor emits addresses and carets,
the preview surfaces hits, and the shell joins them (`fieldPathForAddr` maps an
editor `Addr` to the preview's field-path grammar) — neither surface imports the
other.

## Theming

The surfaces carry the behavior against a neutral, overridable baseline — ten
`--qm-*` dials a consumer overrides on any ancestor (VISUAL_EDITOR_UIUX §"Complex
UX, minimal UI"), deriving the private `--_qm-*` scale every component reads. The
contract is the package's [`THEMING.md`](../../THEMING.md); the derivation is
`core/theme.ts`, applied as a `style` attribute on each detached root — `core/` is
the one module both `preview/` and `visual/` import, which is what lets one
derivation reach four cascade islands without a CSS file.

The systems beneath these surfaces have their own canon: the document/WASM
boundary ([DOCUMENT_MODEL.md](DOCUMENT_MODEL.md)), the paint loop
([PREVIEW.md](PREVIEW.md)), the content codec ([CODEC.md](CODEC.md)), and the
VisualEditor's composition ([VISUAL_EDITOR.md](VISUAL_EDITOR.md),
[VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md)).
