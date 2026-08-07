# quillmark-js

The JS tier downstream of the `@quillmark/wasm` artifact: `packages/svelte` (the Svelte binding: surfaces over a session), `packages/quiver` (collection of quill templates), and two apps that compose them: `packages/playground` (private frontend) and `packages/studio` (published as a static client, for an author working on a quill template). One npm workspace, one install, one gate.

Start at each package's `prose/canon/INDEX.md` for settled design; work that is not settled lives in GitHub issues. Canon is **malleable** (no consumers, no compatibility promise): a doc that contradicts the design in hand gets rewritten in the same commit as the code.

## Prose

Comments and docs are dense, present-tense, unsold: state what is, not how it got here or what was considered. A markdown paragraph is one line, never hard-wrapped. No GitHub issue numbers in comments or docs. The `dense-prose` skill is the full rule set, run as an explicit pass, not assumed reading.

## Commands

Every command is the root's; a package script is reached with `-w packages/<name>`. CI (`.github/workflows/ci.yml`) gates `lint`, `check`, `check:canon`, `check:style`, `check:deps`, `test`, `build`, and `check:pack`. A verb name means one thing across the workspace; the implementations differ per package.

## Boundaries

- `svelte ↛ quiver` and `quiver ↛ svelte`, both directions; only the composing apps have edges to both. `check:deps` holds it.
- A package whose JS a consumer imports peers `@quillmark/wasm` and never depends on it; a bundled terminal (exports no JS, so no handle crosses out) depends on it and ships no runtime dependencies. Root `overrides` pins the developed-against version. The sibling `quillmark` checkout is reference only: read it, never build against it.
- The apps use only the public subpath API; a needed internal is an API gap to fix, not a reach-in.
- `/preview` imports no editor-side code, transitively: a preview consumer does not pull ProseMirror.

## The WASM boundary

- Boundary ledger (consumed surface, canon homes, stability): [`packages/svelte/prose/canon/DOCUMENT_MODEL.md`](packages/svelte/prose/canon/DOCUMENT_MODEL.md).
- `DocumentWriter` and the ergonomic verbs live in the artifact's hand-written runtime layer; `node_modules/@quillmark/wasm/runtime/runtime.d.ts` is the canonical typing. Read it before assuming a verb's shape.

## Verification

Vitest is the whole committed suite (real WASM under node; each package's `vitest.config.ts` documents its setup), and CI runs it in full. The playground is the surface for what a unit test cannot reach (canvas paint, scroll virtualization, DPR, the click round-trip), and studio for the repack loop, driven by hand or headlessly for the change in front of you. Chromium is preinstalled (`/opt/pw-browsers/chromium`, `PLAYWRIGHT_BROWSERS_PATH` preset; never run `playwright install`).

Nothing browser-driven is committed: a browser assertion over chrome restates a doctrine value (a leading rung, a control height, a gutter) outside the CSS that single-sources it, so it fails on every retune of a dial it does not own, and the failure is answered by pasting the new number; what survives that is a suite of numbers agreeing with themselves.

Everything runs against the reference quill [`fixtures/quills/usaf_memo/0.2.0`](fixtures/quills/usaf_memo/0.2.0), a dev fixture at the workspace root, never published. `fixtures/` is a source quiver: the suite walks the version directory into a tree, and each app packs it and fetches it back over HTTP.

In a cloud environment, commit early and often.
