# Playground

> **Implementation**: `src/routes/`

## TL;DR

The dev app around the library: the reference wiring for the glue the primitives push outward, the manual harness for what a unit test cannot reach, and the page a stranger evaluating the package opens first. This doc is its shape and its visual language: minimal modern paper at page scale, one closed `--pg-*` scale, one layout device. The package's own look is [AESTHETIC.md](../../../svelte/prose/canon/AESTHETIC.md) and [SURFACES.md](../../../svelte/prose/canon/SURFACES.md); what a host owes a mounted surface is [`THEMING.md`](../../../svelte/THEMING.md). Nothing here reads a `--_qm-*` rung.

## Two jobs on one page

The playground is a harness *and* the package's front door (it deploys as the project's Pages site), and those pull in opposite directions. A harness wants its instruments where a hand can reach them: state strips, live document dumps, fixture variants, the `data-testid` hooks a headless pass drives. A front door wants a page a stranger can read.

The resolution is **placement**: the harness is one route, and the instruments on it sit on plates rather than in the reading column. What has no reader outside a hand driving the harness (fixture variants, the consumer channels a quill cannot declare) is a query flag, not chrome.

So the front page **proves rather than claims**. It is a quickstart, and every step that names a surface mounts that surface beside its sample, over a session of the reference quill opened exactly as a consumer's is: the page a stranger reads is also the page that runs. Nothing on it claims a capability the mounted surface is not already showing.

## The look

**Modern paper at page scale**: the same three words AESTHETIC gives the surfaces, one level out. Hierarchy comes from type, whitespace and hairlines; the page mints no hue that answers nothing, and no fill that is not doing a job. The mounted surface stays the most detailed thing on any route, because the chrome around it declines to compete.

Three places the host parts from the package, each because the host is a *page* and the package is a *control*:

- **The host's controls are boxed.** With no typing on these pages to be confused with, a box says "this is a control": all a harness's strip of switches needs. The package's buttons stay unboxed for the opposite reason (SURFACES §"The shared recipe").
- **The body rung is larger** than the surface's: the page is prose to read, the surface is UI to operate.
- **One element is filled**: the front page's first action, in solid ink; the action beside it takes the same shape unfilled. Boldness spent once reads as a choice.

## Two faces

**Prose is sans, chrome is mono.** Every label, wordmark, nav item, status line and readout is a monospace run; every passage meant to be read is sans.

Monospace is the vernacular of what this package addresses (field paths, content positions, page indices, `dirtyPages` arrays), so a label set in it reads as an instrument's marking rather than as styling, and a column of addresses lines up character for character. It also keeps the host's chrome off the mounted surface's ground, which is sans throughout. Both are system stacks: a downloaded face would put the front door on a network request the static build otherwise does not make.

## The rail

A block is **an annotation in the margin and the content it names**. What would otherwise be a section heading moves out of the reading column, so the content starts at the top of its own block.

The annotation earns its column by answering something the content does not repeat: the step numbers down the quickstart. A rail restating the title beside it would be the redundancy AESTHETIC strips, one scale up.

A tool route's head is **one line**: the surface's name, and the boundary's phase while it is not open. What the surface does is the surface, mounted below; a passage explaining it says nothing the page is not already showing, which is the same subtraction one scale up.

## What takes a fill

**Only an instrument.** A plate means "the harness showing its work": the state strip, the frame around a surface, the block a sample sits in. The reading column takes none, so the meaning holds: a quickstart step is a line of prose and the thing it describes, not a card around them.

## Colour

Two poles and one hue. The poles are the **system** colours behind the dials: a host knows what canvas it sits on, so `Canvas`/`CanvasText` put unstyled text and a `--pg-*` rung on the same tone, where the package has to ship calibrated literals. `--qm-bg` / `--qm-fg` still sit in front, so setting the dials on the shell retunes page and surface together, and the shell's `color-scheme: light dark` is the host declaration THEMING.md asks for; every `[data-qm-root]` below inherits it, so page and surfaces invert together with no media query.

The hue is spent on one thing: a boundary that failed. An open session takes no colour and no word; it paints the page, which is the claim. The hue is a light/dark pair, since a single literal reads as a stain on one of the two schemes. Everything else is a mix off the two poles, in oklab, so inverting the poles inverts the scale.

## The routes

Two, because the site has two readers.

- **`/`**: the quickstart. The thesis and two actions, then one step per thing a consumer does: install, open a session, mount `<Preview>`, mount `<VisualEditor>`. A step that names a surface puts its sample and that surface side by side, so the code and its output are read without scrolling between them. The samples are strings in `samples.ts`, one per step: a Svelte sample carries a `</script>` that would close the route's own script block, and a step's code is the value the tutorial edits.
- **`/playground`**: the reference split-pane shell, and the harness; its architecture is ARCHITECTURE §Playground's. It is a **workspace, not a page**: the shell hands it the viewport less the running head and it scrolls nowhere, so the panes hold still while their contents move. Below the width that fits two panes the split stacks and the page scrolls again.

Both surfaces run on the front page too, each over its own document. No apply loop runs there, so one document across two steps would let typing in the editor desynchronize the page painted above it; the two wired together is what `/playground` is.

Two guardrails hold across both: the playground consumes only the public subpath API (a needed internal is an API gap to fix), and it stays a harness, not a product: no auth, persistence, or multi-doc management.

## Fixture variants

The reference quill on disk reaches some branches and not others: it declares one card kind, a blank date default, no guidance channel, and no card whose kind the schema cannot project. The variants that reach them are **query flags on `/playground`**, read once at mount: `?kinds2`, `?dateDefault=YYYY-MM-DD` (schema, patched into the tree before the quill is built), `?tips`, `?foreign` (seeds, applied to the document after). They carry no chrome, because the only reader is a hand driving the harness, and a switch for one is a control on the front door for everyone else.

## Where the quills come from

Every route opens its session over the reference quill, and gets it from a **quiver**, not from the bundler. `scripts/build-quiver.mjs` packs the workspace's `fixtures/` tree into `static/quiver/` before dev and before build, and the app reads it back with `Quiver.fromBuiltUrl`: pointer, manifest, one content-addressed bundle, fonts dehydrated into a store. That is the browser consumer path in full, which is what a harness owes the thing it is a harness for. The quill is not a bundler input either way, so no Typst source or font bytes are inlined into the JS.

This is the workspace's one edge to `@quillmark/quiver`. The library has none ([DEPENDENCIES.md](../../../../prose/canon/DEPENDENCIES.md)), so the app is where the two tiers meet, and this route set is the demonstration that they compose without an edge between them.

One `Quiver` serves the page. Its quill cache is per canonical ref and lives as long as the quiver does, so a client-side navigation between routes reuses one materialization rather than paying for its own. Routes mint and free their own `Quill` from the tree: the schema variants rewrite bytes a materialized quill has no seam for, so the loader hands back `getQuill(ref).toTree()` and the caller owns what it builds from it. The discarded materialization is the cost of that seam.

THEMING.md §"What is behind the column is yours" leaves four properties to the host, and the playground demonstrates **both** documented answers to the page tone rather than leaving one on paper: the editor's column carries all four on one rule with plain `--qm-bg` behind it (the supported bare case), on `/playground`'s left pane and the front page's editor step alike, while every mounted `<Preview>` sits inset on a tone of the host's own, so the painted page reads against it.

## What a deploy reaches

Every push to `main` rebuilds the site and republishes it whole, so the previous build's files are gone rather than shadowed. Pages puts one `cache-control: max-age=600` on everything it serves and takes no header from the repository, so naming alone decides what a cache may hold.

**Content-addressed names are immune**: everything under `_app/immutable/`, and every quiver entry but the pointer. A name fixes bytes, so a cached copy is never wrong and changed bytes never reuse the name.

**Four mutable pointers carry the whole lag**: `index.html`, the `404.html` copy of it, `_app/version.json`, `quiver/latest.json`. A reload sees the new build within ten minutes of the deploy finishing, and the two caches do not stack: browser freshness is `max-age` less `Age`, so one ten-minute window covers edge and tab together. SvelteKit fetches `version.json` `no-cache`, so its own check reads through.

An open tab sits outside that window, by design: ten minutes is the contract for a page load, not for a tab. No service worker, no `kit.version.pollInterval`, nothing pushed, so a tab keeps the chrome it loaded until something reloads it. `pollInterval` alone would not change that — SvelteKit consults `updated` only on the two recovery paths below, so a poll sets a store the app would have to act on.

Those paths self-heal one case and no more: a client-side navigation into a route chunk the redeploy removed rejects on import, SvelteKit compares `version.json` against the version baked into the bundle, and a mismatch turns the navigation into a full page load. It needs a chunk the tab has not already imported. Across two routes, a tab that has opened both holds every chunk in memory and never reaches the import that would notice.

Triage reads **CSS hashes only**. `kit.version.name` defaults to a build timestamp baked into a chunk `index.html` preloads, so unchanged source still mints new `start.*.js`, `app.*.js` and `nodes/*.js` names on every build: a JS hash differing from a local build is evidence of nothing. A CSS hash that matches proves the live shell points at that build's stylesheet. A chunk the redeploy removed answers with the SPA fallback, not a bare 404, so the console reads as a MIME failure on `text/html`.

## Preventing drift

The host derivation and its recipes are **two stylesheets**, the split `core/theme.css` and `visual/controls.css` make and for the same reason: a rung fixes a value, a recipe fixes which declarations make a thing, and only the second can be checked against the first. The derivation is exempt from the literal rules, so a recipe beside it would inherit the exemption.

Literals live in the derivation and nowhere else under `src/routes`: `check:style` runs its axes over the host scope too, against the `--pg-*` rung, so a route that mints a grey, a size, a radius or a duration fails CI rather than review. What stays the package's alone is the **dial census**: that the consumed `--qm-*` set equals THEMING.md's is a claim about the package's contract.

## Links

[ARCHITECTURE.md](../../../svelte/prose/canon/ARCHITECTURE.md) · [AESTHETIC.md](../../../svelte/prose/canon/AESTHETIC.md) · [SURFACES.md](../../../svelte/prose/canon/SURFACES.md) · [`THEMING.md`](../../../svelte/THEMING.md)
