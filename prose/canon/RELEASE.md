# Release

> **Implementation**: `.changeset/` · `.github/workflows/`

## TL;DR

Two packages publish, on independent versions, through changesets. The app never publishes. One CI workflow gates every package on every push.

## Independent, not lockstep

Quiver is published and settled; `svelte` is `0.0.0` and being rewritten. Lockstep would drag quiver's version through churn its consumers do not care about, so each package carries its own version and a change to one leaves the other's alone. The packages have no edge between them ([DEPENDENCIES.md](DEPENDENCIES.md)), so there is no shared substrate co-evolving across them to argue the other way; that argument holds *within* `svelte`, which is why its surfaces are subpaths of one package rather than packages of their own.

`playground` is `private: true`. It is the harness and the Pages site, never a tarball.

## Changesets

A change that should ship carries a `.changeset/*.md` naming the packages it bumps and the semver level. Release is then two mechanical steps: `changeset version` writes the version bumps and the changelogs, `changeset publish` publishes whatever the registry does not have.

The intent lives with the commit that earns it rather than being reconstructed at release time from a range of history, and a repo where two packages release on their own clocks needs the per-package answer recorded per change. A change touching only the playground, or only prose, carries no changeset.

npm Trusted Publishing (OIDC) mints the credential, so no token is stored.

## The gate

One workflow over the workspace: `lint`, `check`, `check:canon`, `check:style`, `check:deps`, `test`, `build`. Every package runs each verb its own way (`check` is `svelte-check` in `svelte` and `tsc --noEmit` in quiver), but a verb name means one thing, so the workflow names verbs and the packages own the implementations.

Nothing in the gate needs a browser, and nothing runs elsewhere.
