# Phase 1 — Substrate & packaging

**Goal:** stand up the vanilla-TS core seam and the package skeleton so that a
consumer can load the reference quill, hold a live `Document`, and open a
`LiveSession` — with the build, the subpath exports, and the test runner all in
place. No user-facing surface yet; this is the ground the other phases stand on.

**Implements:** [ARCHITECTURE](../designs/ARCHITECTURE.md) (core/chrome split,
packaging, playground), [DOCUMENT_MODEL](../designs/DOCUMENT_MODEL.md) (handle
lifecycle, the consumed WASM surface).

**Depends on:** Phase 0 (done).

## In scope

- **WASM lifecycle.** `init` / `initSync`, and the owner of the `Quill` and
  `Document` handles across a session — who holds them, when they are freed, and
  the `Engine` that dispatches renders. This is the core's single most important
  responsibility (`DOCUMENT_MODEL` §What the editor owns).
- **The subpath export skeleton.** `/core`, `/preview`, `/visual`, `/source`
  as module roots, `/form` reserved; the `svelte` condition today, the others
  landing as their phases do. `/preview` stays free of any editor-side import
  (the reserved-package promotion in `ARCHITECTURE` §Packaging) — **enforced by
  a check** (a lint rule or import-graph assertion run with the test suite),
  not by inspection, so the rule holds through Phases 2–5 without a
  retroactive audit.
- **The fixture load path.** Turn `fixtures/quills/usaf_memo/0.2.0` into a
  `Quill.fromTree(Map<string, Uint8Array>)` the playground and tests can call —
  the one way a real quill enters the system.
- **Build + test tooling.** `svelte-package` producing the subpath `dist`; the
  playground static build; **Vitest** wired for the core.
- **A bare playground route** that loads the fixture, seeds a document, and opens
  a session — proving the whole chain end-to-end with no UI beyond a status line.

## Out of scope

Painting (Phase 2), any corpus↔PM translation (Phase 3), any editing UI
(Phase 4). This phase renders nothing to a canvas and edits nothing.

## The flow

```
fixture tree ─► Quill.fromTree ─► Quill handle
                                     │
              quill.seedDocument() ─► Document handle
                                     │
              new Engine().open(quill, doc) ─► LiveSession  (held by the consumer)
```

The core owns handle lifecycle; the consumer (playground) owns the session. The
exit test drives exactly this chain.

## Settled decisions

- **Fixture packaging for the browser.** An eager `?url` asset glob over
  `fixtures/**`, fetched into the `Uint8Array` map at startup — keeps the fixture
  a plain input, not an app asset (not a served directory).
- **Handle ownership.** A thin core module owns `init` and handle freeing and
  exposes the raw `Quill`/`Document` handles — the designs put lifecycle in the
  core but keep the handles quillmark's (no wrapper types).

## Exit criteria

- `npm run build` emits the subpath `dist` with framework-free `.d.ts`; the
  `/preview` import-boundary check runs with `npm test` and fails on an
  editor-side import.
- `npm test` runs Vitest (green, even if only a smoke test exists).
- The playground route loads `usaf_memo`, seeds a `Document`, opens a
  `LiveSession`, and reports `pageCount` / `supportsCanvas` / `warnings` — the WASM
  boundary is proven live in a browser.
- Handles are freed on teardown with no leak on repeated open/close.

## New dependencies

Vitest (+ its jsdom/browser env as the core needs). No ProseMirror, no CodeMirror.

## Risks / watch-items

- The `vite-plugin-wasm` + top-level-await path already exists; confirm it survives
  `svelte-package` for the library build, not just `vite dev`.
- Font/asset bytes in the fixture must arrive intact (binary, not text) — the load
  path is the first place a `?raw`-vs-`?url` mistake would corrupt them.
- `Document.main` / `cards` allocate on every read (per the WASM docs) — set the
  expectation now that hot paths cache, so Phases 3–4 do not rediscover it.
