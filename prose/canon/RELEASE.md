# Release

> **Implementation**: `.changeset/` · `.github/workflows/`

## TL;DR

Three packages publish, on independent versions, through changesets. The harness never publishes. One CI workflow gates every package on every push.

## Independent, not lockstep

Every published package is pre-1.0: the consumers are first-party, so a break rides a minor rather than earning a major. Lockstep would drag one package's version through churn another's consumers do not care about, so each carries its own version and a change to one leaves the others' alone. The two libraries have no edge between them ([DEPENDENCIES.md](DEPENDENCIES.md)), so there is no shared substrate co-evolving across them to argue the other way; that argument holds *within* `svelte`, which is why its surfaces are subpaths of one package rather than packages of their own.

`@quillmark/studio` publishes as an **app**: a bin and a prebuilt client, no importable API. What that buys is an author outside this repo, who has `build` and `test` and otherwise no way to see what their quill is like to use. Its version answers to that reader rather than to a dependent, since nothing depends on it.

`playground` alone is `private: true`: the harness and Pages site, never a tarball.

## Changesets

A change that should ship carries a `.changeset/*.md` naming the packages it bumps and the semver level. Release is then two mechanical steps: `changeset version` writes the version bumps and the changelogs, `changeset publish` publishes whatever the registry does not have.

The intent lives with the commit that earns it rather than being reconstructed at release time from a range of history, and a repo where two packages release on their own clocks needs the per-package answer recorded per change. A change touching only an app, or only prose, carries no changeset.

npm Trusted Publishing (OIDC) mints the credential, so no token is stored.

## The tarball

`files` names what npm does not pack on its own: `dist`, `NOTICE`, and in `svelte` the `THEMING.md` its README links. Studio's `dist` is two halves — `dist/client` from Vite, `dist/node` from `tsc` — and the bin serves the first and is the second. `package.json`, `README` and `LICENSE` ship whether listed or not. Every published package carries a verbatim copy of the workspace's Apache-2.0 `LICENSE` and of the `NOTICE` naming the copyright holder: a tarball is redistributed on its own, and §4 asks its recipient for both. `prepack` rebuilds `dist` from clean, so a publish cannot carry a stale artifact.

`publint` runs from the root `release` script over every published package, after the build and before `changeset publish`, never from `prepack`: publint packs the package to lint it, and packing runs `prepack`.

## The gate

One workflow over the workspace: `lint`, `check`, `check:canon`, `check:style`, `check:deps`, `test`, `build`. Every package runs each verb its own way (`check` is `svelte-check` in `svelte` and `tsc --noEmit` in quiver), but a verb name means one thing, so the workflow names verbs and the packages own the implementations.

Nothing in the gate needs a browser, and nothing runs elsewhere.
