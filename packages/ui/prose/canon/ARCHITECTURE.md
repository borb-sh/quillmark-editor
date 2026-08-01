# Architecture

> **Implementation**: `src/lib/`

## TL;DR

What `@quillmark/ui` is: the VisualEditor and Preview surfaces, the shared document/engine substrate beneath them, the data flow between them, and the package's public API (the minimal source editor lives here as a debug view). `src/lib/` → `svelte-package` → `dist/` is the published tarball; the app that mounts it is a sibling package.

## Core vs chrome

TS-first, zero `.js`. Two layers:

- **Vanilla TS core**: no framework: the `@quillmark/wasm` boundary, document model, codec, ProseMirror integration, the preview paint loop, and the source mirror. Pure `.ts`; ships framework-free `.d.ts`.
- **Svelte + bits-ui chrome**: `.svelte` components (`<script lang="ts">`) for toolbars, the schema-driven metadata form, and the split-pane shell; `.svelte.ts` modules for shared reactive logic.

The heavy machinery (ProseMirror, canvas paint) is already framework-agnostic, so the core carries the substance and the chrome stays thin. Svelte earns its place in the stateful UI; a vanilla-core consumer wraps a mount API in a few lines.

## Packaging

**One package, `@quillmark/ui`, with subpath exports**: `/core`, `/preview`, `/visual`, `/source` ship; `/form` is reserved for the metadata surface.

Subpaths, not separate packages, because the thing a split would buy (a preview-only consumer not pulling ProseMirror) is a dependency-graph concern that subpath entries already solve: each subpath is its own module root, so a bundler pulls only what the imported entry reaches. The one thing separate packages add, independent versioning, is a cost here: the surfaces share a substrate (Document model, engine boundary, `ContentHit`/`ChangeSet` types) and co-evolve, so a per-package version matrix is tax with no payer.

The container's name is what makes that hold for the one surface with a distinct audience. Preview's audience (read-only viewer, share page, CI screenshot) is not editing, and a neutral container is a dependency it can take. So `/preview` keeps no editor-side import, and the reason is **bundle weight**: it is what makes the subpath claim true rather than merely stated. `check:deps` walks the graph transitively, and the rule is the [workspace's](../../../../prose/canon/DEPENDENCIES.md).

Each subpath export declares `types` + `svelte` + `default`, all pointing at the `dist/<subpath>/index.js` module root; `publint` gates the map.

## Playground

The workspace ships a self-hosted playground app beside the library, one package over: `src/lib/` → `svelte-package` → the published tarball, `packages/playground` → a static build → the deployed site. It is the reference wiring for the shell glue the primitives push outward (`preview.onCaretPick → codec → visualEditor.setCaret`, session open, diagnostics routing) and the manual harness for what unit tests cannot reach (canvas paint, scroll virtualization, DPR, the click round-trip). Two guardrails: it consumes only the public API through the published subpaths (a needed internal is an API gap to fix, and a separate package is what makes that unfakeable rather than a convention), and it stays a harness, not a product (pick a quill, edit, preview, diagnostics; no auth, persistence, or multi-doc management).

Its routes, and the host-side visual language they share, are [PLAYGROUND.md](../../../playground/prose/canon/PLAYGROUND.md). One of them is architectural: `/editor` is the reference **split-pane shell**, where the caret bridge is consumer-layer glue: the editor emits addresses and carets, the preview surfaces hits, and the shell joins them (`fieldPathForAddr` maps an editor `Addr` to the preview's field-path grammar), so neither surface imports the other. That the column around the cards is the consumer's, not the package's, is what makes that route the place THEMING.md's four mounting-site properties are demonstrated.

## The error channel

Every surface recovers rather than throws: a page that will not paint, a `toMarkdown` that fails, a commit the boundary refuses, a leaf whose `applyChange` falls back to `install`. Each recovery is a fact the embedding app cannot otherwise reach — the preview's error state is a class on a div, and the rest was a console line — so every one of them reports through `onError`, one optional sink per surface carrying `{ code, message, severity, cause }` and falling to `console.error` when unset (`core/errors.ts`).

**Per surface, not per shell.** A preview-only consumer, the audience `/preview` keeps its weight for, has no shell joining surfaces and still needs the channel. The replication is the implementation's, where it is one bound reporter per mount; the consumer wires one hook per surface they mounted.

**A sink routes on `code`, never on `message`.** The codes are a closed union naming the failure SITE (`preview.paint`, `field.commit`, `content.install`), so a product's own wording and its telemetry both key off something that will not be reworded under them. `cause` is the caught value verbatim, which is where a `QuillmarkError`'s `diagnostics` are reached.

**`severity` separates the document's failures from the wiring's.** `error` is a failure a document, a quill or the backend produced and the surface absorbed. `dev` is the package's own contract broken by the code around it — a handle prop swapped in place on a surface that binds once, reported once per mount — and is reachable by no document and no user, so a telemetry sink drops the whole class on this field rather than by listing the codes that happen to be dev-only today.

**Nothing on this channel gates.** A reported failure is one the surface has already answered: the preview shows its message, the rejected commit writes nothing and pins a diagnostic, the leaf keeps its optimistic state and the store takes the full projection. The channel is observation; a sink that throws is the consumer's bug and not a seam the package offers.

## Theming

The surfaces carry the behavior against a neutral, overridable baseline: the `--qm-*` dials a consumer overrides on any ancestor (VISUAL_EDITOR_UIUX §"Complex UX, minimal UI"), deriving the private `--_qm-*` scale every component reads. The contract is the package's [`THEMING.md`](../../THEMING.md); the derivation is a stylesheet in `core/`, side-effect imported by the one module both `preview/` and `visual/` already pull (so a consumer has nothing to import), and applied to every element marked `data-qm-root`. A stylesheet rather than an inline attribute is what lets the scale carry a cascade layer consumer CSS beats without `!important` and the baseline font every root inherits.

The one signal the surface takes from outside the dials is the **host's declared `color-scheme`**, which the poles read through `light-dark()` and the root inherits untouched, so light/dark is the mounting site's declaration, not a preference the package reads behind it. A host with a theme of its own declares the scheme alongside it; the playground does this in its `playground.css`, which is also where the reference shell derives its own chrome from the same signal.

The systems beneath these surfaces have their own canon: the document/WASM boundary ([DOCUMENT_MODEL.md](DOCUMENT_MODEL.md)), the paint loop ([PREVIEW.md](PREVIEW.md)), the content codec ([CODEC.md](CODEC.md)), and the VisualEditor's composition ([VISUAL_EDITOR.md](VISUAL_EDITOR.md), [VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md)).
