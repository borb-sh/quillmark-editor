# @quillmark/editor

Editor + live-preview component library for Quillmark WASM consumers. SvelteKit lib/app repo: `src/lib` → `svelte-package` → the published package; `src/routes` → the dev playground, never published.

Start at [`prose/canon/INDEX.md`](prose/canon/INDEX.md), the settled systems; deferred and undesigned work lives in GitHub issues. Canon is **malleable** (no consumers, no compatibility promise): a doc that contradicts the design in hand gets rewritten in the same commit as the code.

## Prose

Comments and docs are dense, present-tense, unsold: state what is, not how it got here or what was considered. A markdown paragraph is one line, never hard-wrapped. No GitHub issue numbers in comments or docs. The `dense-prose` skill is the full rule set, run as an explicit pass, not assumed reading.

## Commands

Scripts are `package.json`'s. CI (`.github/workflows/ci.yml`) gates `lint`, `check`, `check:canon`, `check:style`, `test`, and `build`.

## Boundaries

- The editor consumes the published `@quillmark/wasm` pinned in `package.json`; the sibling `quillmark` checkout is reference only: read it, never build against it.
- The playground uses only the public subpath API; a needed internal is an API gap to fix, not a reach-in.
- `/preview` imports no editor-side code (the reserved `@quillmark/preview` promotion stays a re-export).

## The WASM boundary

- Boundary ledger (consumed surface, canon homes, stability): [`prose/canon/DOCUMENT_MODEL.md`](prose/canon/DOCUMENT_MODEL.md).
- `DocumentWriter` and the ergonomic verbs live in the package's hand-written runtime layer; `node_modules/@quillmark/wasm/runtime/runtime.d.ts` is the canonical typing. Read it before assuming a verb's shape.

## Verification

Vitest is the whole committed suite (real WASM under node; `vitest.config.ts` documents the setup), and CI runs it in full. The playground is the surface for what a unit test cannot reach (canvas paint, scroll virtualization, DPR, the click round-trip), driven by hand or headlessly for the change in front of you. Chromium is preinstalled (`/opt/pw-browsers/chromium`, `PLAYWRIGHT_BROWSERS_PATH` preset; never run `playwright install`).

Nothing browser-driven is committed: a browser assertion over chrome restates a doctrine value (a leading rung, a control height, a gutter) outside the CSS that single-sources it, so it fails on every retune of a dial it does not own, and the failure is answered by pasting the new number; what survives that is a suite of numbers agreeing with themselves.

Everything runs against the reference quill [`fixtures/quills/usaf_memo/0.2.0`](fixtures/quills/usaf_memo/0.2.0), a dev fixture, never published.

In a cloud environment, commit early and often.
