# Architecture

> **Implementation**: `src/lib/`

## TL;DR

What `@quillmark/svelte` is: the VisualEditor and Preview surfaces, the shared document/engine substrate beneath them, the data flow between them, and the package's public API (the minimal source editor lives here as a debug view). `src/lib/` → `svelte-package` → `dist/` is the published tarball; the app that mounts it is a sibling package.

## Core vs chrome

TS-first, zero `.js`. Two layers:

- **Vanilla TS core**: no framework: the `@quillmark/wasm` boundary, document model, codec, ProseMirror integration, the preview paint loop, and the source mirror. Pure `.ts`; ships framework-free `.d.ts`.
- **Svelte + bits-ui chrome**: `.svelte` components (`<script lang="ts">`) for toolbars, the schema-driven metadata form, and the split-pane shell; `.svelte.ts` modules for shared reactive logic.

The heavy machinery (ProseMirror, canvas paint) is already framework-agnostic, so the core carries the substance and the chrome stays thin. Svelte earns its place in the stateful UI; a vanilla-core consumer wraps a mount API in a few lines.

## Packaging

**One package, `@quillmark/svelte`, with subpath exports**: `/core`, `/preview`, `/visual`, `/source` ship; `/form` is reserved for the metadata surface.

**The name is the binding, not the substance.** The headline surfaces are Svelte components, so the package says so: a host reads its framework off the specifier rather than off a README. That the vanilla-TS cores carry the substance is unchanged (§Core vs chrome), and `/core` stays framework-free under a framework-named package deliberately. The name draws the line at the door instead of leaving it implicit, which is what makes a second binding a re-export of `/core` rather than a rewrite, and what keeps the reserved `@quillmark/preview` promotion neutral: the paint loop it would carry reaches no Svelte and no editor-side code today.

Subpaths, not separate packages, because the thing a split would buy (a preview-only consumer not pulling ProseMirror) is a dependency-graph concern that subpath entries already solve: each subpath is its own module root, so a bundler pulls only what the imported entry reaches. The one thing separate packages add, independent versioning, is a cost here: the surfaces share a substrate (Document model, engine boundary, `ContentHit`/`ChangeSet` types) and co-evolve, so a per-package version matrix is tax with no payer.

**What the surfaces share, `/core` declares.** Two vocabularies are named there rather than per subpath, because more than one surface speaks each: the address grammar (`DocPath`, and the `Place` a caret move and a `focusPosition` both take) and the error channel (`EditorError` and the `onError` every surface accepts). Either one declared inside `/preview` or `/visual` forces the other subpath to import across a boundary the package keeps closed, or to declare its own structurally identical copy, which is drift with nothing to catch it. `/core` is the module both already import.

The container's name is what makes that hold for the one surface with a distinct audience. Preview's audience (read-only viewer, share page, CI screenshot) is not editing, and a neutral container is a dependency it can take. So `/preview` keeps no editor-side import, and the reason is **bundle weight**: it is what makes the subpath claim true rather than merely stated. `check:deps` walks the graph transitively, and the rule is the [workspace's](../../../../prose/canon/DEPENDENCIES.md).

Each subpath export declares `types` + `svelte` + `default`, all pointing at the `dist/<subpath>/index.js` module root; `publint` gates the map.

## Playground

The workspace ships a self-hosted playground app beside the library, one package over: `src/lib/` → `svelte-package` → the published tarball, `packages/playground` → a static build → the deployed site. It is the reference wiring for the shell glue the primitives push outward (`preview.onCaretPick → codec → visualEditor.setCaret`, session open, diagnostics routing) and the manual harness for what unit tests cannot reach (canvas paint, scroll virtualization, DPR, the click round-trip). Two guardrails: it consumes only the public API through the published subpaths (a needed internal is an API gap to fix, and a separate package is what makes that unfakeable rather than a convention), and it stays a harness, not a product (pick a quill, edit, preview, diagnostics; no auth, persistence, or multi-doc management).

Its routes, and the host-side visual language they share, are [PLAYGROUND.md](../../../playground/prose/canon/PLAYGROUND.md). One of them is architectural: `/editor` is the reference **split-pane shell**, where the caret bridge is consumer-layer glue: the editor emits places and carets, the preview surfaces hits, and the shell joins them, so neither surface imports the other. Both hops are pass-throughs (`onCaretMove={preview.focusPosition}`, `onCaretPick` → `setCaret`) because the two surfaces share one address vocabulary, declared once in `/core` (`Place`, `DocPath`) rather than structurally per subpath. That the column around the cards is the consumer's, not the package's, is what makes that route the place THEMING.md's four mounting-site properties are demonstrated.

## Theming

The surfaces carry the behavior against a neutral, overridable baseline: the `--qm-*` dials a consumer overrides on any ancestor (VISUAL_EDITOR_UIUX §"Complex UX, minimal UI"), deriving the private `--_qm-*` scale every component reads. The contract is the package's [`THEMING.md`](../../THEMING.md); the derivation is a stylesheet in `core/`, side-effect imported by the one module both `preview/` and `visual/` already pull (so a consumer has nothing to import), and applied to every element marked `data-qm-root`. A stylesheet rather than an inline attribute is what lets the scale carry a cascade layer consumer CSS beats without `!important` and the baseline font every root inherits.

The one signal the surface takes from outside the dials is the **host's declared `color-scheme`**, which the poles read through `light-dark()` and the root inherits untouched, so light/dark is the mounting site's declaration, not a preference the package reads behind it. A host with a theme of its own declares the scheme alongside it; the playground does this in its `playground.css`, which is also where the reference shell derives its own chrome from the same signal.

The systems beneath these surfaces have their own canon: the document/WASM boundary ([DOCUMENT_MODEL.md](DOCUMENT_MODEL.md)), the paint loop ([PREVIEW.md](PREVIEW.md)), the content codec ([CODEC.md](CODEC.md)), and the VisualEditor's composition ([VISUAL_EDITOR.md](VISUAL_EDITOR.md), [VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md)).
