# Playground

> **Implementation**: `src/routes/`

## TL;DR

The dev app around the library: the reference wiring for the glue the primitives push outward, the manual harness for what a unit test cannot reach, and the page a stranger evaluating the package opens first. This doc is its shape: two routes, two readers, and a host scale of its own. What a host owes a mounted surface is [`THEMING.md`](../../../svelte/THEMING.md); nothing here reads a `--_qm-*` rung.

## Two jobs on one page

The playground is a harness *and* the package's front door (it deploys as the project's Pages site), and those pull in opposite directions. A harness wants its instruments where a hand can reach them: state strips, live document dumps, fixture variants, the `data-testid` hooks a headless pass drives. A front door wants a page a stranger can read.

The resolution is **placement**: the harness is one route, and the instruments on it sit on plates rather than in the reading column. What has no reader outside a hand driving the harness (fixture variants, the consumer channels a quill cannot declare) is a query flag, not chrome.

So the front page **proves rather than claims**. It is a quickstart, and every step that names a surface mounts that surface beside its sample, over a session of the reference quill opened exactly as a consumer's is: the page a stranger reads is also the page that runs. Nothing on it claims a capability the mounted surface is not already showing.

## The host scale

The host is a page where the package is a control, so it carries a scale of its own: `--pg-*`, derived in `playground.css` and read everywhere under `src/routes`. It parts from the package's in what it derives FROM. The poles are the **system** colours behind the dials (`Canvas` / `CanvasText`): a host knows what canvas it sits on, where the package has to ship calibrated literals. `--qm-bg` / `--qm-fg` still sit in front, so setting the dials on the shell retunes page and surface together, and the shell's `color-scheme: light dark` is the host declaration THEMING.md asks for; every `[data-qm-root]` below inherits it, so page and surfaces invert together with no media query.

What the chrome around a mounted surface does is **decline to compete**: the surface stays the most detailed thing on any route. Colour is spent on one thing, a boundary that failed; an open session takes no colour and no word, because it paints the page, which is the claim.

## The routes

Two, because the site has two readers.

- **`/`**: the quickstart. The thesis and two actions, then one step per thing a consumer does: install, open a session, mount `<Preview>`, mount `<VisualEditor>`. A step that names a surface puts its sample and that surface side by side, so the code and its output are read without scrolling between them. The samples are strings in `samples.ts`, one per step: a Svelte sample carries a `</script>` that would close the route's own script block, and a step's code is the value the tutorial edits.
- **`/playground`**: the reference split-pane shell, and the harness; its architecture is ARCHITECTURE §Playground's. It is a **workspace, not a page**: the shell hands it the viewport less the running head and it scrolls nowhere, so the panes hold still while their contents move. The shell is pinned to the viewport at every width, and a gesture past the end of a pane stops there rather than chaining out to bounce the document. Below the width that fits two panes the split stacks and the route's own column takes the scroll, which is what keeps both panes reachable without the document becoming a scroller.

Both surfaces run on the front page too, each over its own document. No apply loop runs there, so one document across two steps would let typing in the editor desynchronize the page painted above it; the two wired together is what `/playground` is.

Two guardrails hold across both: the playground consumes only the public subpath API (a needed internal is an API gap to fix), and it stays a harness, not a product: no auth, persistence, or multi-doc management.

## Fixture variants

The reference quill on disk reaches some branches and not others: it declares one card kind, a blank date default, no guidance channel, and no card whose kind the schema cannot project. The variants that reach them are **query flags on `/playground`**, read once at mount: `?kinds2`, `?dateDefault=YYYY-MM-DD` (schema, patched into the tree before the quill is built), `?tips`, `?foreign` (seeds, applied to the document after). They carry no chrome, because the only reader is a hand driving the harness, and a switch for one is a control on the front door for everyone else.

## Where the quills come from

Every route opens its session over the reference quill, and gets it from a **quiver**, not from the bundler. `scripts/build-quiver.mjs` packs the workspace's `fixtures/` tree into `static/quiver/` before dev and before build, and the app reads it back with `Quiver.fromBuiltUrl`: pointer, manifest, one content-addressed bundle, fonts dehydrated into a store. That is the browser consumer path in full, which is what a harness owes the thing it is a harness for. The quill is not a bundler input either way, so no Typst source or font bytes are inlined into the JS.

This is the workspace's one edge to `@quillmark/quiver`. The library has none ([DEPENDENCIES.md](../../../../prose/canon/DEPENDENCIES.md)), so the app is where the two tiers meet, and this route set is the demonstration that they compose without an edge between them.

One `Quiver` serves the page. Its quill cache is per canonical ref and lives as long as the quiver does, so a client-side navigation between routes reuses one materialization rather than paying for its own. Routes mint and free their own `Quill` from the tree: the schema variants rewrite bytes a materialized quill has no seam for, so the loader hands back `getQuill(ref).toTree()` and the caller owns what it builds from it. The discarded materialization is the cost of that seam.

THEMING.md §"What is behind the column is yours" leaves four properties to the host, and the playground demonstrates **both** documented answers to the page tone rather than leaving one on paper: the editor's column carries all four on one rule with plain `--qm-bg` behind it (the supported bare case), on `/playground`'s left pane and the front page's editor step alike, while every mounted `<Preview>` sits inset on a tone of the host's own, so the painted page reads against it.

## Preventing drift

The host derivation and its recipes are **two stylesheets**, the split the package makes and for the same reason ([ARCHITECTURE.md](../../../svelte/prose/canon/ARCHITECTURE.md) §Styling): a rung fixes a value, a recipe fixes which declarations make a thing, and only the second can be checked against the first. The derivation is exempt from the literal rules, so a recipe beside it would inherit the exemption.

Literals live in the derivation and nowhere else under `src/routes`: `check:style` runs its axes over the host scope too, against the `--pg-*` rung, so a route that mints a grey, a size, a radius or a duration fails CI rather than review. What stays the package's alone is the **dial census**: that the consumed `--qm-*` set equals THEMING.md's is a claim about the package's contract.

## Links

[ARCHITECTURE.md](../../../svelte/prose/canon/ARCHITECTURE.md) · [`THEMING.md`](../../../svelte/THEMING.md)
