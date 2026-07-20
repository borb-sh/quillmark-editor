# Architecture

Scope: what `@quillmark/editor` is — the VisualEditor and Preview surfaces, the
shared document/engine substrate beneath them, the data flow between them, and
the package's public API (the minimal source editor lives here as a debug view).

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
`/visual`, `/source`, `/form` (future). Not split into `@quillmark/preview` etc.

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

Today only the `svelte` condition is exposed; subpaths land as the core does.

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

<!-- Remaining content pending discussion: document model, preview internals,
     VisualEditor decomposition, codec, theming, public API. -->
