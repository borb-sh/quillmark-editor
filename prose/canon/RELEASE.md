# Release

> **Implementation**: `.github/workflows/`

## TL;DR

Three packages publish, on independent versions, one at a time, through a release PR. One CI workflow gates every package on every push.

## Independent, not lockstep

All three are pre-1.0: the consumers are first-party, so a break rides a minor rather than earning a major. Lockstep would drag one package's version through churn another's consumers do not care about, so each carries its own version and a change to one leaves the others alone. The libraries have no edge between them ([DEPENDENCIES.md](DEPENDENCIES.md)), so there is no shared substrate co-evolving across them to argue the other way; that argument holds *within* `svelte`, which is why its surfaces are subpaths of one package rather than packages of their own.

`studio` publishes as a **static client**: the tarball is the built client and nothing else, and what it bundles moves with its own version rather than a consumer's install. Its release is otherwise every other release — the same branch, the same tag shape, the same curated section.

`playground` is `private: true`: the harness and the Pages site, never a tarball.

## The release PR

`Prepare release` takes the package and the bump, writes the new version into that package's `package.json`, promotes its `## Unreleased` section to the version's own, and opens `release/<package>-v<version>`. Merging that PR is the release: `Release` reads the package and version back out of the branch name, gates, tags `<package>-v<version>`, publishes, and cuts a GitHub Release whose body is the version's changelog section verbatim.

The version lives in the package's own manifest, so there is nothing repo-wide to bump and no arithmetic for the workflow to redo: `npm version` computes it, and a package left alone stays where it is. The tag carries the package name for the same reason — a bare `v0.1.0` would say nothing about which package reached it, and the next release's commit range is read off the last tag that names its own package.

Nothing between the tag and the publish can fail: the gate, the build and `publint` all run first, because a dangling tag is deleted and a published version is permanent. The publish skips a version the registry already has, so a run that failed after it is re-run rather than unpicked.

npm Trusted Publishing (OIDC) mints the credential, so no token is stored. It names a workflow and an environment, which is why the publish lives in one workflow file and runs in `release`. A package with no versions has no settings page to configure it on, so a first publish is a hand upload from the release branch and the merged run agrees with what it finds.

## The curated section

`## Unreleased` is a permanent fixture at the top of each published package's `CHANGELOG.md`, and an entry is written into it by the change that earns it. The release promotes the body already there; it composes nothing.

The intent lives with the commit that earns it rather than being reconstructed at release time from a range of history, and prose written while the change is in hand says what a reader needs in a way a subject line cannot. What the range of history is good for is the coverage check, so the release PR carries the commit subjects touching that package since its last tag — in the PR body, where the reviewer reads the section against them, and where nothing rides onto main waiting to be deleted.

A change touching only the playground, or only prose, writes no entry.

## The tarball

`files` names what npm does not pack on its own: `dist`, `NOTICE`, and in `svelte` the `THEMING.md` its README links. `package.json`, `README` and `LICENSE` ship whether listed or not. Every published package carries a verbatim copy of the workspace's Apache-2.0 `LICENSE` and of the `NOTICE` naming the copyright holder: a tarball is redistributed on its own, and §4 asks its recipient for both. `prepack` rebuilds `dist` from clean, so a publish cannot carry a stale artifact.

`publint` is a verb of its own, `check:pack`, run after the build and never from `prepack`: publint packs the package to lint it, and packing runs `prepack`.

## The gate

One workflow over the workspace: `lint`, `check`, `check:canon`, `check:style`, `check:deps`, `test`, `build`, `check:pack`. Every package runs each verb its own way (`check` is `svelte-check` in `svelte` and `tsc --noEmit` in quiver), but a verb name means one thing, so the workflow names verbs and the packages own the implementations.

Beside the verbs, the deploy rehearsal: `studio-pages.yml` is the workflow a quiver author calls, and CI runs that file rather than a copy of it, against `fixtures/` and the locally packed client. A layout only this repository exercises is one that breaks for an author first. It asserts and uploads nothing, this repository's Pages holding the playground.

Nothing in the gate needs a browser, and nothing runs elsewhere.
