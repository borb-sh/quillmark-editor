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

## Packaging (open)

The core is portable, so the package likely grows subpath exports —
`@quillmark/editor/core` (plain JS, any framework) vs `@quillmark/editor`
(Svelte). Deferred until the core exists; today only the `svelte` condition is
exposed.

<!-- Remaining content pending discussion: document model, preview internals,
     VisualEditor decomposition, codec, theming, public API. -->
