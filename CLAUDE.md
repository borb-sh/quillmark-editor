# quillmark-js

The JS tier downstream of the `@quillmark/wasm` artifact: `packages/svelte`, `packages/quiver`, `packages/quillkit`, and `packages/playground`, the one private package. One npm workspace, one install, one gate.

Start at each package's `prose/canon/INDEX.md` for what the package is and its settled design; work that is not settled lives in GitHub issues. Canon design choices are currently evolving and malleable.

## Prose Style

Err on the side of minimalism. Wrong is worse than missing.

Internal comments that just translate code to English don't need to exist. The cost of every word mist be justified by helping maintainers understand systems or APIs faster.

## Commands

Every command is the root's; a package script is reached with `-w packages/<name>`. `gate` is the whole gate in one verb, and with `check:pack` is what CI (`.github/workflows/ci.yml`) holds. `gate:fast` is its first half, everything that needs no build. A verb name means one thing across the workspace; the implementations differ per package.

A gate holds what a diff cannot show — a stylesheet a bundler pruned, a rung that resolves to nothing, a pointer at a renamed heading, a lock missing a platform. What a reviewer can see for itself is review's: the gates warn there, and never fail. A value a surface mints on purpose says so on the line (`mint: <reason>`) and is counted rather than blocked.

`check:registry` sits outside both: it asks the registry whether each published version is there, and a release branch is ahead of the registry by design. It runs on its own schedule (`.github/workflows/registry.yml`), against `main`, where being ahead is a fault.

## Verification

Vitest is the whole committed suite (real WASM under node; each package's `vitest.config.ts` documents its setup), and CI runs it in full. The playground is the surface for what a unit test cannot reach (canvas paint, scroll virtualization, DPR, the click round-trip), and `npm run dev:studio` or `quillkit studio` for the repack loop, driven by hand or headlessly. Chromium is preinstalled (`/opt/pw-browsers/chromium`, `PLAYWRIGHT_BROWSERS_PATH` preset; never run `playwright install`).
