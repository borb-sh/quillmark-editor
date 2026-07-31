# Playground

> **Implementation**: `src/routes/`

## TL;DR

The dev app around the library: the reference wiring for the glue the primitives push outward, the manual harness for what a unit test cannot reach, and the page a stranger evaluating the package opens first. This doc is its shape and its visual language: minimal modern paper at page scale, one closed `--pg-*` scale, one layout device. The package's own look is [AESTHETIC.md](../../../ui/prose/canon/AESTHETIC.md) and [SURFACES.md](../../../ui/prose/canon/SURFACES.md); what a host owes a mounted surface is [`THEMING.md`](../../../ui/THEMING.md). Nothing here reads a `--_qm-*` rung.

## Two jobs on one page

The playground is a harness *and* the package's front door (it deploys as the project's Pages site), and those pull in opposite directions. A harness wants its instruments where a hand can reach them: state strips, live document dumps, fixture variants, the `data-testid` hooks a headless pass drives. A front door wants a page a stranger can read.

The resolution is placement, not subtraction. **Every instrument stays and every instrument is demoted**: a readout sits on a plate in the margin of a reading column, never in it.

So the front page **proves rather than claims**. It opens a session over the reference quill exactly as the tool routes do and mounts `<Preview>` on it, so the first thing above the fold is a real compiled page painted by the library, and clicking it resolves a content address, which is the package's whole thesis in one gesture. The boundary quantities (`pageCount`, `supportsCanvas`, `warnings`) read off the same handles, at the foot, on a plate.

## The look

**Modern paper at page scale**: the same three words AESTHETIC gives the surfaces, one level out. Hierarchy comes from type, whitespace and hairlines; the page mints no hue that answers nothing, and no fill that is not doing a job. The mounted surface stays the most detailed thing on any route, because the chrome around it declines to compete.

Three places the host parts from the package, each because the host is a *page* and the package is a *control*:

- **The host's controls are boxed.** With no typing on these pages to be confused with, a box says "this is a control": all a harness's strip of switches needs. The package's buttons stay unboxed for the opposite reason (SURFACES §"The shared recipe").
- **The body rung is larger** than the surface's: the page is prose to read, the surface is UI to operate.
- **One element is filled**: the front page's single action, in solid ink. Boldness spent once reads as a choice.

## Two faces

**Prose is sans, chrome is mono.** Every label, wordmark, nav item, status line and readout is a monospace run; every passage meant to be read is sans.

Monospace is the vernacular of what this package addresses (field paths, content positions, page indices, `dirtyPages` arrays), so a label set in it reads as an instrument's marking rather than as styling, and a column of addresses lines up character for character. It also keeps the host's chrome off the mounted surface's ground, which is sans throughout. Both are system stacks: a downloaded face would put the front door on a network request the static build otherwise does not make.

## The rail

A block is **an annotation in the margin and the content it names**. What would otherwise be a section heading moves out of the reading column, so the content starts at the top of its own block.

The annotation earns its column by answering something the content does not repeat: the section labels down the front page. A rail restating the title beside it would be the redundancy AESTHETIC strips, one scale up.

A tool route's head is **one line**: the surface's name, and the boundary's phase while it is not open. What the surface does is the surface, mounted below; a passage explaining it says nothing the page is not already showing, which is the same subtraction one scale up.

## What takes a fill

**Only an instrument.** A plate means "the harness showing its work": the state strip, the document dump, the boundary readout, the frame around a surface. The reading column takes none, so the meaning holds: the front page's surface list is three lines of prose, not three cards.

## Colour

Two poles and one hue. The poles are the **system** colours behind the dials: a host knows what canvas it sits on, so `Canvas`/`CanvasText` put unstyled text and a `--pg-*` rung on the same tone, where the package has to ship calibrated literals. `--qm-bg` / `--qm-fg` still sit in front, so setting the dials on the shell retunes page and surface together, and the shell's `color-scheme: light dark` is the host declaration THEMING.md asks for; every `[data-qm-root]` below inherits it, so page and surfaces invert together with no media query.

The hue is spent on one thing: a boundary that failed. An open session takes no colour and no word; it paints the page, which is the claim. The hue is a light/dark pair, since a single literal reads as a stain on one of the two schemes. Everything else is a mix off the two poles, in oklab, so inverting the poles inverts the scale.

## The routes

- **`/`**: the overview: the thesis, the live sheet, the surfaces, install, and the session readout. The sheet is sized to the whole first page and does not scroll; a wheel over the hero scrolls the page, not the paper, while the click bridge keeps working on what is shown.
- **`/preview`**: paint, overlay and the click bridge. The frame is deliberately short and `margin={0}`, so scrolling swaps which page is mounted; the paint loop's bound is only falsifiable at that size.
- **`/visual`**: the VisualEditor over a seeded document, with the consumer channels the reference quill cannot declare (external diagnostics, an enum policy, body wording) as switches, and the fixture variants as links. The variants are schema or seed changes read once at mount, so they reload the page rather than navigating within it.
- **`/editor`**: the reference split-pane shell; its architecture is ARCHITECTURE §Playground's.

Two guardrails hold across all four: the playground consumes only the public subpath API (a needed internal is an API gap to fix), and it stays a harness, not a product: no auth, persistence, or multi-doc management.

## Where the quills come from

Every route opens its session over the reference quill, and gets it from a **quiver**, not from the bundler. `scripts/build-quiver.mjs` packs the workspace's `fixtures/` tree into `static/quiver/` before dev and before build, and the app reads it back with `Quiver.fromBuiltUrl`: pointer, manifest, one content-addressed bundle, fonts dehydrated into a store. That is the whole path a browser consumer of a quiver takes, and taking it is the point. The quill also stops being a bundler input, so the JS no longer carries a megabyte of Typst source and font bytes inlined as assets.

This is the workspace's one edge to `@quillmark/quiver`. The library has none ([DEPENDENCIES.md](../../../../prose/canon/DEPENDENCIES.md)), so the app is where the two tiers meet, and the harness is the demonstration that they compose without an edge between them.

One `Quiver` serves the page. Its quill cache is per canonical ref and lives as long as the quiver does, so a client-side navigation between routes reuses one materialization rather than paying for its own. Routes still mint and free their own `Quill` from the tree: the `/visual` fixture variants rewrite schema bytes, which a materialized quill has no seam for, so the loader hands back `getQuill(ref).toTree()` and the caller owns what it builds from it. The discarded materialization is the cost of that seam.

THEMING.md §"What is behind the column is yours" leaves four properties to the host, and the playground demonstrates **both** documented answers to the page tone rather than leaving one on paper: `/editor`'s editor pane carries all four on its single rule with plain `--qm-bg` behind the column (the supported bare case), while the front page's sheet, `/preview`'s frame and `/editor`'s preview pane put a tone of the host's own behind the paper, inset so the painted page reads against it.

## Preventing drift

The host derivation and its recipes are **two stylesheets**, the split `core/theme.css` and `visual/controls.css` make and for the same reason: a rung fixes a value, a recipe fixes which declarations make a thing, and only the second can be checked against the first. The derivation is exempt from the literal rules, so a recipe beside it would inherit the exemption.

Literals live in the derivation and nowhere else under `src/routes`: `check:style` runs its axes over the host scope too, against the `--pg-*` rung, so a route that mints a grey, a size, a radius or a duration fails CI rather than review. What stays the package's alone is the **dial census**: that the consumed `--qm-*` set equals THEMING.md's is a claim about the package's contract.

## Links

[ARCHITECTURE.md](../../../ui/prose/canon/ARCHITECTURE.md) · [AESTHETIC.md](../../../ui/prose/canon/AESTHETIC.md) · [SURFACES.md](../../../ui/prose/canon/SURFACES.md) · [`THEMING.md`](../../../ui/THEMING.md)
