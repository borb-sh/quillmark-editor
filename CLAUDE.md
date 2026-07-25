# @quillmark/editor

Editor + live-preview component library for Quillmark WASM consumers. A
SvelteKit lib/app repo: `src/lib` → `svelte-package` → the published package;
`src/routes` → the dev playground (never published).

Start at [`prose/canon/INDEX.md`](prose/canon/INDEX.md) — the settled systems that
describe V1 (**Phases 1–5 have shipped**). Deferred and not-yet-designed work is
tracked as GitHub issues. Every canon doc follows the spine documented in
[`prose/README.md`](prose/README.md) (`> **Implementation**:` folder anchor +
`## TL;DR`); `npm run check:canon` gates it.

Canon is **malleable** — the project is still taking shape and the package has no
consumers, so nothing in `prose/canon/` is a compatibility promise. A canon doc
that contradicts the design in hand is a doc to rewrite, not a constraint to
design around; rewrite it in the same commit as the code so the two never diverge.
`check:canon` gates the spine, not the claims.

Comments and docs: dense, present-tense, no marketing — the `dense-prose` skill
(in the sibling `quillmark` checkout's `.claude/skills/`).

## Commands

- `npm run dev` — the playground (Vite).
- `npm run build` — `svelte-kit sync && svelte-package` → `dist/`.
- `npm test` — Vitest.
- `npm run check` / `npm run lint` — svelte-check / prettier; CI gates.
- `npm run check:canon` — canon spine lint (CI gate; see `prose/README.md`).

## Boundaries

- The editor consumes the **published** `@quillmark/wasm` (pinned in
  `package.json`). A sibling `quillmark` checkout is reference only — read its
  source to understand the boundary, never build against it.
- The playground consumes only the public subpath API; a needed internal is an
  API gap to fix, not a reach-in.
- `/preview` imports no editor-side code (the reserved `@quillmark/preview`
  promotion stays a re-export).

## The WASM boundary, fast

- The boundary ledger — exact consumed surface, canon homes, stability:
  [`prose/canon/DOCUMENT_MODEL.md`](prose/canon/DOCUMENT_MODEL.md).
- `DocumentWriter` and the ergonomic verbs live in the package's hand-written
  runtime layer: `node_modules/@quillmark/wasm/runtime/runtime.d.ts` is the
  canonical typing — read it before assuming a verb's shape.
- Running the WASM package under Vitest: the sibling checkout's
  `crates/bindings/wasm/vitest.config.js` is the proven wiring — node
  environment + `vite-plugin-wasm` + `vite-plugin-top-level-await`.

## Verification

Two tiers: Vitest for pure/core logic; the playground for what
unit tests cannot reach (canvas paint, scroll virtualization, DPR, the click
round-trip). In the Claude cloud environment, drive the playground headlessly —
Chromium is preinstalled (`/opt/pw-browsers/chromium`,
`PLAYWRIGHT_BROWSERS_PATH` preset; never run `playwright install`).

All development and verification run against the reference quill
[`fixtures/quills/usaf_memo/0.2.0`](fixtures/quills/usaf_memo/0.2.0) — a dev
fixture only, never published.

In a cloud environment, commit early and often.
