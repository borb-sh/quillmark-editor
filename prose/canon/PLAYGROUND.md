# Playground

> **Implementation**: `src/routes/`

## TL;DR

The dev app around the library: the reference wiring for the glue the primitives
push outward, the manual harness for what a unit test cannot reach, and the page a
stranger evaluating the package opens first. This doc is its shape and its visual
language — minimal modern paper at page scale, one closed `--pg-*` scale, one
layout device. The package's own look is [AESTHETIC.md](AESTHETIC.md) and
[SURFACES.md](SURFACES.md); what a host owes a mounted surface is
[`THEMING.md`](../../THEMING.md). Nothing here reads a `--_qm-*` rung, and
everything the shell mints is namespaced `--pg-*`.

## Two jobs on one page

The playground is a harness *and* the package's front door — it deploys as the
project's Pages site — and those pull in opposite directions. A harness wants its
instruments out where a hand can reach them: state strips, live document dumps,
fixture variants, the `data-testid` hooks a headless pass drives. A front door
wants a page a stranger can read.

The resolution is placement, not subtraction. **Every instrument stays and every
instrument is demoted**: a readout sits on a plate in the margin of a reading
column, never in it.

So the front page **proves rather than claims**. It opens a session over the
reference quill exactly as the tool routes do and mounts `<Preview>` on it, so the
first thing above the fold is a real compiled page painted by the library — and
clicking it resolves a content address, which is the package's whole thesis in one
gesture. The boundary quantities the harness reports (`pageCount`,
`supportsCanvas`, `warnings`) read off the same handles, at the foot, on a plate.

## The look

**Modern paper at page scale** — the same three words AESTHETIC gives the
surfaces, one level out. Hierarchy comes from type, whitespace and hairlines; the
page mints no hue that answers nothing, and no fill that is not doing a job. The
mounted surface stays the most detailed thing on any route, because the chrome
around it declines to compete.

Three places the host deliberately parts from the package, each because the host
is a *page* and the package is a *control*:

- **The host's controls are boxed.** A box says "type here" only where there is
  typing to be confused with, and there is none on these pages: the reading column
  is prose and the panels are read-only. So a box here says "this is a control",
  which is the whole of what a strip of switches needs to say. The package's
  buttons stay unboxed for the opposite reason (SURFACES §"The shared recipe").
- **The body rung is larger** than the surface's — the page is prose to read, the
  surface is UI to operate, and one size serving both would cramp the first or
  bloat the second.
- **One element is filled.** The front page's single action takes solid ink on
  page; everything else is ink, rule and whitespace. Boldness spent once is what
  makes it read as a choice.

## Two faces

**Prose is sans, chrome is mono.** Every label, wordmark, nav item, status line and
readout on these pages is a monospace run; every passage meant to be read is sans.

The split is not decoration. Monospace is the vernacular of what this package
addresses — field paths, content positions, page indices, `dirtyPages` arrays — so
a label set in it reads as an instrument's marking rather than as styling, and a
column of addresses lines up character for character, which is how they are
actually read. It also keeps the host's chrome from competing with the mounted
surface, which is sans throughout: the two faces are the seam between the page and
the thing on it.

Both faces are system stacks: a downloaded display face would land the front door
on a network request the static build otherwise does not make.

## The rail

The layout device the playground is built on: a block is **an annotation in the
margin and the content it names**. What would otherwise be a section heading moves
out of the reading column, so the content starts at the top of its own block and
the label reads as a marking on the page rather than as a line of it.

The annotation earns its column by answering something the content does not
repeat — a section label on the front page (`SURFACES`, `INSTALL`), the live
session status on a tool route. A rail carrying a heading that restated the title
beside it would be exactly the redundancy AESTHETIC strips, one scale up. Below
the width where the margin stops fitting, the rail stacks and the annotation stays
the same run of type.

## What takes a fill

**Only an instrument.** A plate on these pages means "the harness showing its
work" — the state strip, the document dump, the boundary readout, the mounting
frame around a surface. The reading column takes none, so the meaning holds.

The front page's three surface entries are the case that fixes it: they are a rule
and type, not cards. Three plates there would say "instrument" three times about
what are links, and the page would lose the one distinction its fills carry.

## Colour

Two poles and two hues, and the poles are the **system** colours behind the
dials — a host knows what canvas it sits on, so `Canvas`/`CanvasText` put unstyled
text and a `--pg-*` rung on the same tone, where the package has to ship
calibrated literals. `--qm-bg` / `--qm-fg` still sit in front, so setting the dials
on the shell retunes page and surface together.

The two hues answer one question: what phase the WASM boundary is in — the
session status, the thing a harness exists to report. Each is a light/dark pair,
since a single literal reads as a stain on one of the two schemes. Everything
else is a mix off the two poles, in oklab, so inverting the poles inverts the
scale.

The running head's scheme control is **the host's `color-scheme` declaration, not a
mode**: it writes the property THEMING.md asks a host app for onto the document
element, every `[data-qm-root]` below inherits it, and page and surfaces invert
together with no media query and no JS inside the package. `system` is the absence
of the declaration rather than a third value.

## The routes

- **`/`** — the overview: the thesis, the live sheet, the three surfaces, install,
  and the session readout. The sheet is sized to the whole first page and does not
  scroll — a wheel over the hero scrolls the page, not the paper — while the click
  bridge keeps working on what is shown; the scrolling case is `/preview`'s.
- **`/preview`** — paint, overlay and the click bridge. The frame is deliberately
  short and `margin={0}`, so scrolling swaps which page is mounted; the paint
  loop's bound is only falsifiable at that size.
- **`/visual`** — the VisualEditor over a seeded document, with the consumer
  channels the reference quill cannot declare (external diagnostics, an enum
  policy, body wording) as switches, and the fixture variants as links. The
  variants are schema or seed changes read once at mount, so they reload the page
  rather than navigating within it.
- **`/editor`** — the reference **split-pane shell**: one `LiveSession`, both
  surfaces over one document, the caret bridged in each direction, the preview
  following edits on a debounced `session.apply`, `session.warnings` routed to
  inline diagnostics, and the source view. The bridge's architecture is
  ARCHITECTURE §Playground's.

Two guardrails hold across all four: the playground consumes only the public
subpath API (a needed internal is an API gap to fix, and exercising the subpaths
proves their seams are clean), and it stays a harness, not a product — pick a
quill, edit, preview, diagnostics; no auth, persistence, or multi-doc management.

## The four mounting-site properties

THEMING.md §"What is behind the column is yours" leaves four properties to the
host: the gutter, the scroll container, the page tone behind the column, and the
scroll tail. The playground demonstrates **both** documented answers to the third,
one route each, rather than picking one and leaving the other on paper:

- `/editor`'s editor pane carries all four on its single rule, with plain
  `--qm-bg` behind the column — the supported bare case, and the reason a card's
  tone is never a bet on its backdrop.
- The front page's sheet, `/preview`'s frame and `/editor`'s preview pane put a
  page tone of the host's own behind the paper (`--pg-desk`), inset so the painted
  page reads against it rather than bleeding into the frame's edge.

## Preventing drift

The host derivation and its recipes are **two stylesheets**, the split
`core/theme.css` and `visual/controls.css` make and for the same reason: a rung
fixes a value, a recipe fixes which declarations make a thing, and only the second
can be checked against the first. The derivation is exempt from the literal rules,
because it is where the defaults are stated — so a recipe living beside them would
inherit the exemption and become the one place a minted grey could hide.

Literals live in the derivation and nowhere else under `src/routes`:
`check:style` runs its axes over the host scope too, against the `--pg-*` rung, so
a route that mints a grey, a size, a radius or a duration fails CI rather than
review. What stays the package's alone is the **dial census** — that the consumed
`--qm-*` set equals THEMING.md's is a claim about the package's contract, and a
host reading a dial says nothing about whether the package documents it.

## Links

[ARCHITECTURE.md](ARCHITECTURE.md) · [AESTHETIC.md](AESTHETIC.md) · [SURFACES.md](SURFACES.md) · [`THEMING.md`](../../THEMING.md)
