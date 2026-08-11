# quillmark-js

The JS tier downstream of the `@quillmark/wasm` artifact: `packages/svelte`, `packages/quiver`, `packages/quillkit`, and `packages/playground`, the one private package. One npm workspace, one install, one gate.

Start at each package's `prose/canon/INDEX.md` for what the package is and its settled design; work that is not settled lives in GitHub issues. Canon is **malleable** (no consumers, no compatibility promise): a doc that contradicts the design in hand gets rewritten in the same commit as the code.

## Prose

Most comments should not exist; the ones that do are dense, present-tense, unsold: state what is, not how it got here or what was considered. A claim is verified against the code or left unsaid: wrong is worse than missing, and a hand-kept list is a claim. A markdown paragraph is one line, never hard-wrapped. No GitHub issue numbers in comments or docs. The `dense-prose` skill is the full rule set, run as an explicit pass, not assumed reading.

## Commands

Every command is the root's; a package script is reached with `-w packages/<name>`. `gate` is the whole gate in one verb, and with `check:pack` is what CI (`.github/workflows/ci.yml`) holds. `gate:fast` is its first half, everything that needs no build. A verb name means one thing across the workspace; the implementations differ per package.

A gate holds what a diff cannot show — a stylesheet a bundler pruned, a rung that resolves to nothing, a pointer at a renamed heading, a lock missing a platform. What a reviewer can see for itself is review's: the gates warn there, and never fail. A value a surface mints on purpose says so on the line (`mint: <reason>`) and is counted rather than blocked.

`check:registry` sits outside both: it asks the registry whether each published version is there, and a release branch is ahead of the registry by design. It runs on its own schedule (`.github/workflows/registry.yml`), against `main`, where being ahead is a fault.

## Boundaries

- `svelte ↛ quiver` and `quiver ↛ svelte`, both directions; a node reaching both composes them, which the playground does as an app and quillkit does inside the client it bundles. `check:deps` holds it.
- **One wasm per process.** A package with an importable entry peers `@quillmark/wasm` and never depends on it; a bundled terminal (no importable entry, so the copy it bundles meets no other) depends on it and ships no runtime dependencies. Neither a `bin` nor a `./package.json` export is an importable entry (a process hands out no handles, and a manifest is a location rather than a module), so one terminal may carry a compiled Node program and a bundled browser program at once, as quillkit does. Root `overrides` pins the developed-against version. The sibling `quillmark` checkout is reference only: read it, never build against it.
- **quillkit carries nothing it can resolve.** The loader and the engine come out of the collection's own `node_modules`, so a collection pins the format it is packed in and the wasm its gate renders through. The client is the converse and ships in the tarball: it reads no format and writes no quiver, so pinning it buys nothing.
- The apps use only the public subpath API; a needed internal is an API gap to fix, not a reach-in.
- `/preview` imports no editor-side code, transitively: a preview consumer does not pull ProseMirror.

## The WASM boundary

- Boundary ledger (consumed surface, canon homes, stability): [`packages/svelte/prose/canon/DOCUMENT_MODEL.md`](packages/svelte/prose/canon/DOCUMENT_MODEL.md).
- `DocumentWriter` and the ergonomic verbs live in the artifact's hand-written runtime layer; `node_modules/@quillmark/wasm/runtime/runtime.d.ts` is the canonical typing. Read it before assuming a verb's shape.

## Verification

Vitest is the whole committed suite (real WASM under node; each package's `vitest.config.ts` documents its setup), and CI runs it in full. The playground is the surface for what a unit test cannot reach (canvas paint, scroll virtualization, DPR, the click round-trip), and `npm run dev:studio` or `quillkit studio` for the repack loop, driven by hand or headlessly. Chromium is preinstalled (`/opt/pw-browsers/chromium`, `PLAYWRIGHT_BROWSERS_PATH` preset; never run `playwright install`).

Nothing browser-driven is committed: a browser assertion over chrome restates a doctrine value (a leading rung, a control height, a gutter) outside the CSS that single-sources it, so it fails on every retune of a dial it does not own, and the failure is answered by pasting the new number; what survives that is a suite of numbers agreeing with themselves.

Everything runs against the reference quill [`fixtures/quills/usaf_memo/0.2.0`](fixtures/quills/usaf_memo/0.2.0), a dev fixture at the workspace root, never published. `fixtures/` is a source quiver: the suite walks the version directory into a tree, and each app packs it and fetches it back over HTTP.

In a cloud environment, commit early and often.
