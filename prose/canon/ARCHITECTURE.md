# Architecture

> **Implementation**: `src/lib/` (the package) · `src/routes/` (the playground)

## TL;DR

What `@quillmark/editor` is: the VisualEditor and Preview surfaces, the shared document/engine substrate beneath them, the data flow between them, and the package's public API (the minimal source editor lives here as a debug view). `src/lib/` → `svelte-package` → `dist/` is the published tarball; `src/routes/` is the playground.

## Core vs chrome

TS-first, zero `.js`. Two layers:

- **Vanilla TS core**: no framework: the `@quillmark/wasm` + quiver boundary, document model, codec, ProseMirror integration, the preview paint loop, and the source mirror. Pure `.ts`; ships framework-free `.d.ts`.
- **Svelte + bits-ui chrome**: `.svelte` components (`<script lang="ts">`) for toolbars, the schema-driven metadata form, and the split-pane shell; `.svelte.ts` modules for shared reactive logic.

The heavy machinery (ProseMirror, canvas paint) is already framework-agnostic, so the core carries the substance and the chrome stays thin. Svelte earns its place in the stateful UI; a vanilla-core consumer wraps a mount API in a few lines.

## Packaging

**One package, `@quillmark/editor`, with subpath exports**: `/core`, `/preview`, `/visual`, `/source`, `/bridge` ship; `/form` is reserved for the metadata surface. Not split into `@quillmark/preview` etc.

Subpaths, not separate packages, because the thing a split would buy (a preview-only consumer not pulling ProseMirror) is a dependency-graph concern that subpath entries already solve: each subpath is its own module root, so a bundler pulls only what the imported entry reaches. The one thing separate packages add, independent versioning, is a cost here: the surfaces share a substrate (Document model, engine boundary, `ContentHit`/`ChangeSet` types) and co-evolve, so a per-package version matrix is tax with no payer.

`/bridge` is the shell wiring bundled (`connect()`): the debounced recompile, the repaint and re-serialize behind it, and both caret hops. It is a subpath rather than a helper inside a surface because it is the layer ABOVE both, and it takes structural handles rather than importing either — so the two surfaces stay mutually unaware, a consumer with one surface passes one, and the `/preview` promotion below is untouched. Bundled rather than described in a README because the debounce, the structure-op fast path and the teardown are exactly what a hand-copied bridge gets wrong, and the playground consuming it proves the seam better than the playground reimplementing it.

Reserved, not taken: `@quillmark/preview` as its own package. Preview is the one surface with a distinct audience (read-only viewer, share page, CI screenshot) that wants neither a dep named "editor" nor the editor deps. Keep the `/preview` subpath free of any editor-side import so the promotion stays a re-export, not a refactor; pay it when a viewer-only consumer appears.

Each subpath export declares `types` + `svelte` + `default`, all pointing at the `dist/<subpath>/index.js` module root; `publint` gates the map.

## Playground

The repo ships a self-hosted playground app alongside the library: the SvelteKit lib/app duality: `src/lib/` → `svelte-package` → the published tarball (`files: ["dist"]` keeps the app out), `src/routes/` → a static build → the deployed playground. It is the reference wiring for the shell glue the primitives push outward (`preview.onCaretPick → codec → visualEditor.setCaret`, session open, diagnostics routing) and the manual harness for what unit tests cannot reach (canvas paint, scroll virtualization, DPR, the click round-trip). Two guardrails: it consumes only the public API (a needed internal is an API gap to fix, and exercising the subpaths proves their seams are clean), and it stays a harness, not a product (pick a quill, edit, preview, diagnostics; no auth, persistence, or multi-doc management).

Its routes, and the host-side visual language they share, are [PLAYGROUND.md](PLAYGROUND.md). One of them is architectural: `/editor` is the reference **split-pane shell**, where the caret bridge is consumer-layer glue: the editor emits addresses and carets, the preview surfaces hits, and the shell joins them — both directions as pass-throughs, since each surface emits the other's argument shape without importing it. That the column around the cards is the consumer's, not the package's, is what makes that route the place THEMING.md's four mounting-site properties are demonstrated.

## The error channel

Every surface recovers from its own failures — a commit the boundary refused, a page the backend cannot raster, a serialize that throws, a `validate`/`resolve` the chrome only needs for ghosts — and each recovery is invisible by construction. So each takes an **`onError`**, and each recovery site reports one `EditorError` (`core/errors.ts`): a closed `code` a consumer switches on, the thrown `cause` verbatim, and the address when the failure has one. Absent, every site writes the `console.error` it always wrote; present, nothing reaches the console, because a consumer that took the channel owns what happens to it. Nothing waits on the handler and nothing changes behavior on its absence: a report, never a gate.

The one code that is not a failure is `rebind`, the dev-only remount-contract check (`core/rebind.ts`): every surface binds its handles once at mount, and a handle swapped in place is a valid handle that silently addresses the wrong document.

## Theming

The surfaces carry the behavior against a neutral, overridable baseline: the `--qm-*` dials a consumer overrides on any ancestor (VISUAL_EDITOR_UIUX §"Complex UX, minimal UI"), deriving the private `--_qm-*` scale every component reads. The contract is the package's [`THEMING.md`](../../THEMING.md); the derivation is a stylesheet in `core/`, side-effect imported by the one module both `preview/` and `visual/` already pull (so a consumer has nothing to import), and applied to every element marked `data-qm-root`. A stylesheet rather than an inline attribute is what lets the scale carry a cascade layer consumer CSS beats without `!important` and the baseline font every root inherits.

Two properties of that contract are enforced rather than remembered. The three LENGTH dials land in registered private rungs (`@property`, `<length>`), so a unitless value is contained at the one rung that reads the dial instead of poisoning every `calc()` below it — registration sits on the private rung because a registered property's initial value must be computationally independent, which the `rem` defaults are not. And the class names THEMING.md promises are held against the DOM the package writes (`check:style`), one direction only: the promised set is a deliberate subset of the tree, so an undocumented class is internal, while a promised one that vanished is a consumer's rule silently ceasing to match.

The one signal the surface takes from outside the dials is the **host's declared `color-scheme`**, which the poles read through `light-dark()` and the root inherits untouched, so light/dark is the mounting site's declaration, not a preference the package reads behind it. A host with a theme of its own declares the scheme alongside it; the playground does this in `routes/playground.css`, which is also where the reference shell derives its own chrome from the same signal.

The systems beneath these surfaces have their own canon: the document/WASM boundary ([DOCUMENT_MODEL.md](DOCUMENT_MODEL.md)), the paint loop ([PREVIEW.md](PREVIEW.md)), the content codec ([CODEC.md](CODEC.md)), and the VisualEditor's composition ([VISUAL_EDITOR.md](VISUAL_EDITOR.md), [VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md)).
