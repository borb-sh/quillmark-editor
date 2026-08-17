# quillmark-js

The JS tier downstream of the `@quillmark/wasm` artifact: `packages/svelte`, `packages/quiver`, `packages/quillkit`, and `packages/playground`, the one private package. One npm workspace, one install, one gate.

Start at each package's `prose/canon/INDEX.md` for what the package is and its settled design; work that is not settled lives in GitHub issues. Canon design choices are currently evolving and malleable.

## Commands

Every command is the root's; a package script is reached with `-w packages/<name>`. `gate` is the whole gate in one verb, and with `check:pack` is what CI (`.github/workflows/ci.yml`) holds. `gate:fast` is its first half, everything that needs no build. A verb name means one thing across the workspace; the implementations differ per package.

Gates warn rather than fail on what a reviewer can see for itself. A value a surface mints on purpose says so on the line (`mint: <reason>`) and is counted rather than blocked.

`check:registry` sits outside both: it asks the registry whether each published version is there, and a release branch is ahead of the registry by design. It runs on its own schedule (`.github/workflows/registry.yml`), against `main`, where being ahead is a fault.

## Verification

Vitest is the whole committed suite (real WASM under node; each published package's `vitest.config.ts` documents its setup), and CI runs it in full. The playground is the surface for what a unit test cannot reach (canvas paint, scroll virtualization, DPR, the click round-trip), and `npm run dev:studio` or `quillkit studio` for the repack loop, driven by hand or headlessly. Chromium is preinstalled (`/opt/pw-browsers/chromium`, `PLAYWRIGHT_BROWSERS_PATH` preset; never run `playwright install`).
