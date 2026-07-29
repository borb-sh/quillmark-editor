# @quillmark/editor

Editor + live-preview component library for Quillmark WASM consumers. SvelteKit
lib/app repo: `src/lib` → `svelte-package` → the published package; `src/routes`
→ the dev playground (never published).

Start at [`prose/canon/INDEX.md`](prose/canon/INDEX.md) — the settled systems.
Deferred and undesigned work lives in GitHub issues. Canon is **malleable**: no
consumers, no compatibility promise. A doc that contradicts the design in hand
gets rewritten in the same commit as the code. `npm run check:canon` gates the
doc spine — the shape `scripts/check-canon.mjs` states and enforces — not the
claims.

Comments and docs: use the `dense-prose` skill. No GitHub issue numbers in
comments or docs — state the design fact itself, not where it's tracked.

## Commands

- `npm run dev` — playground (Vite).
- `npm run build` — `svelte-kit sync && svelte-package` → `dist/`.
- `npm test` — Vitest.
- `npm run check` / `npm run lint` / `npm run check:canon` — CI gates.

## Boundaries

- The editor consumes the **published** `@quillmark/wasm` (pinned in
  `package.json`). A sibling `quillmark` checkout is reference only — read it,
  never build against it.
- The playground uses only the public subpath API; a needed internal is an API
  gap to fix, not a reach-in.
- `/preview` imports no editor-side code (the reserved `@quillmark/preview`
  promotion stays a re-export).

## The WASM boundary

- Boundary ledger — consumed surface, canon homes, stability:
  [`prose/canon/DOCUMENT_MODEL.md`](prose/canon/DOCUMENT_MODEL.md).
- `DocumentWriter` and the ergonomic verbs live in the package's hand-written
  runtime layer; `node_modules/@quillmark/wasm/runtime/runtime.d.ts` is the
  canonical typing — read it before assuming a verb's shape.
- WASM under Vitest: copy the sibling checkout's
  `crates/bindings/wasm/vitest.config.js` — node environment,
  `vite-plugin-wasm`, `vite-plugin-top-level-await`.

## Verification

Vitest is the whole committed suite, and CI runs it in full. The playground is
the surface for what a unit test cannot reach — canvas paint, scroll
virtualization, DPR, the click round-trip — driven by hand or headlessly for the
change in front of you. Chromium is preinstalled (`/opt/pw-browsers/chromium`,
`PLAYWRIGHT_BROWSERS_PATH` preset; never run `playwright install`).

Nothing browser-driven is committed. A browser assertion over chrome restates a
doctrine value — a leading rung, a control height, a gutter — outside the CSS
that single-sources it, so it fails on every retune of a dial it does not own,
and the failure is answered by pasting the new number. What survives that is a
suite of numbers agreeing with themselves.

Everything runs against the reference quill
[`fixtures/quills/usaf_memo/0.2.0`](fixtures/quills/usaf_memo/0.2.0) — dev
fixture only, never published.

In a cloud environment, commit early and often.
