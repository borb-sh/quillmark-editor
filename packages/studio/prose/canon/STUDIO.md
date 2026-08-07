# Studio

> **Implementation**: `src/` (the browser half) · `src/node/` (the Node half, reached through the `studio` bin)

## TL;DR

The surface a quill author looks at their quiver through: pick a quill, edit, watch it paint, read the errors. `quiver test` answers *does it work*; studio answers *what is it like to use*, which is where most of what makes a quill good or bad lives. This doc is its shape: two halves, the repack loop the document survives, and the endorsed look it is drawn with.

Two readers, one client. The author works mid-edit, locally, against files on disk, and the loop below is theirs. A deployed quiver is frozen at a commit, so the reader who arrives at a URL — a reviewer following a branch, someone evaluating a quiver — gets the picker, the surfaces and the errors over one built quiver, with the watch half inert and nothing to repack. One client rather than two: the carry costs nothing where there is nothing to carry, and it is the same client an `npx` over a working tree serves.

## Looked at, not blocked on

`build` and `test` are what quiver gives a quill author, and they are the whole of it. The boundary is **looked at** against **blocked on**: `test` runs in the author's CI, against the author's own wasm through the CLI's engine discovery, and installs a loader rather than an app. Studio is reached for when someone wants to see the thing.

The two share one artifact, and it is the **blueprint**: `quiver test` seeds with `quill.seedDocument()` and so does studio, so the document the gate renders is the document the author judges, and it is the only document either one can name.

Keeping the gate in quiver is what lets studio be an app at all. Nothing fails a build on studio's verdict, so studio's chrome, its weight and its wasm are its own problem.

## Why it is not the playground

Both mount the same surfaces over the same reference quill, and the distinction is **which thing is variable**. The playground holds the quill fixed and makes the *wiring* the subject, so it must show its instruments: state strips, live dumps, fixture variants, the hooks a headless pass drives. Studio holds the wiring fixed and invisible and makes the *quill* the subject, so it must hide them. The suspect when something looks wrong differs too (the library in one case, the quill in the other), and that is what decides what each surfaces.

That separation reaches the DRAWING, not only the contents. Both are one session under two surfaces in a pinned shell, so the shape of the screen is one thing taken out of the preset; what fills it is not. A page showing its instruments stands its mounts apart, framed, so each reads as one of several things on it. Studio spends the whole screen on the two mounts: they run to the viewport's edges and meet at a hairline, because the surface is the subject and every pixel of chrome around it is a pixel not spent on the quill.

Studio also sheds the playground's front-door job. Its reader arrives already committed, so there is no quickstart to carry, and it is one screen rather than a site: no router, no reading column, no landing page.

## The two halves

A browser cannot read the source layout, so studio ends at a built artifact behind a base URL, consumed with `Quiver.fromBuiltUrl`.

**The Node half** packs, watches and serves, and does nothing else: `build()` into a directory, watch the source tree, repack, hand the client and the pack to a browser. It is the `studio` bin, which is how a consumer reaches it; this repository drives the same loop from a Vite plugin, where the two things a dev server adds live: the first pack lands before the server is created, and a repack signals over the socket the page already holds.

**The bin is not an export.** An importable entry puts studio's wasm in an importer's process, which is the thing the artifact's single-copy rule exists to prevent; an executable is a process of its own and hands a handle to nobody. `studio dev` holds no wasm at all, the packer instantiating nothing, and the copy bundled into the client runs in a browser tab. One wasm per process is the invariant, and this shape never has two in one (`check:deps`).

**The packer is the author's own**, resolved from the collection's `node_modules` rather than carried. Studio ships no runtime dependencies, so the `build` behind both verbs cannot be one; resolving it there also makes the pack a local loop serves and the pack the author's CI publishes the same bytes, through the copy their `quiver test` gates with.

**A generation is never observably half-written.** `build` clears its output before writing it, so a pack is assembled outside the served tree and moved in with one rename. Without that, a client reading the pointer mid-pack reports a broken quiver for an edit that was fine.

**The browser half** is an ordinary quiver consumer: `fromBuiltUrl(base)`, a picker over `quillNames()` and `versionsOf()` (both sync, so it needs no loading state), `getQuill(ref)`, then the surfaces over one `LiveSession`. The picker offers only what varies: an axis holding one value is printed rather than selected, since a working tree is usually one quill at one version and a control that cannot be used is chrome competing with the surface. The fact stays either way, an author having to know what they are looking at. The quill it holds is **borrowed** (cached per canonical ref for the quiver's lifetime and handed to every caller), so studio frees the session and the document and nothing else. It rewrites no quill bytes, so it needs no quill of its own.

**Nothing renders on the server.** The WASM boundary and the paint loop are browser concerns, which is what keeps the Node half a packer and a file watcher.

**One wasm, and the head says which.** The root `overrides` pin is the workspace's only copy, so studio and `quiver test` render through one instance and cannot disagree. The version is stated anyway: a client bundles the copy it was built with, a gate runs whatever its own tree holds, and nothing at runtime reconciles them, so the reader who cannot run `npm ls` is told what painted the page.

**The client ships built and runs unbuilt.** The tarball is what `vite build` produced; locally it is an ordinary Vite dev server, with HMR on its own chrome. An author who cannot run a bundler is the reason for the first, and the reason the wasm is bundled with it.

**The bridge is studio's own; the shell's shape is not.** The caret bridge and the debounced recompile are consumer-layer by design, and a shared component wiring them would contradict the reason the wiring is the consumer's. The shape of the screen goes the other way: the pinned bands, the row a band puts its parts on, and the split's tracks and its breakpoint are the preset's classes on studio's own elements (THEMING §"The shell"). What studio writes is what a band is MADE of, which is where the look diverges: the mark's treatment, the head's depth and full-bleed rule, the closed gap and the seam between the mounts, the band that scrolls once the split stacks. A rule studio writes because the preset picked the playground's answer is the promotion coming apart, not a divergence.

**Published, not peered.** The tarball is `dist` and `bin`, a **bundled terminal** (`check:deps`): wasm and both libraries bundled into the client, no runtime dependencies, no importable entry. The base URL is a runtime fact; the quiver is laid beside the client at deploy time and never baked into it.

**The layout is written once.** `studio site --out <dir>` lays the client at a root with a built quiver at `quiver/` beneath it, which is where the client looks, and asserts both halves: a client carrying a quiver of its own would occupy that URL, and the winner would be whichever copy landed last. The reusable workflow calls the verb rather than restating it, so a consumer running it locally gates the shape their deploy will have. It clears what it writes, so an `--out` holding the collection or the working directory is refused the way `build` refuses one holding its source. The tree is studio's, one level above the one quiver is handed, so the refusal does not travel with the packer.

Studio draws with `@quillmark/svelte/preset`, the same import a third-party consumer makes; `studio.css` adds one height beyond the endorsed look, the depth the notes band opens to.

## The document is the blueprint's

Studio holds one document and it is the schema's own: `seedDocument()` over the `example:` values in `Quill.yaml`. There is no door in and no door out: no file it is read from, none it is written to, and nothing of studio's own that outlives the tab.

**Reload is the reseed.** A boot seeds, and the carry keeps a running session on the document in hand, so an `example:` edited mid-session does not appear until the page reloads. F5 is the whole of that verb, and it costs a keystroke rather than a control.

**What that costs.** The failures that only a long list, a wrapping value or an empty optional reveal are invisible here, and to `quiver test` with it: neither renders a document the schema did not write. The corpus *is* the `example:` block, so an author buys that coverage by writing examples that are uncomfortable rather than tidy.

## The document survives the quill

The playground holds the quill fixed; studio is the surface where the schema changes under live content. A repack yields a new content-addressed manifest and pointer, and the quill cache lives as long as the quiver does, so the client **drops the quiver rather than invalidating it**: new `Quiver`, re-`getQuill`, and the old handles go with the old open. The pointer is already fetched `no-cache`, so no loader API moves for this: a `refresh()` verb would be an optimization against a working loop.

What crosses is the document, as its canonical markdown, landed through the bound ingestion door (`quill.parse`, which conforms as it parses). Three outcomes, and each is a fact about the quill rather than an error to swallow:

- a plate-only edit repaints the same document verbatim;
- an additive schema change keeps it and defaults the new fields;
- an incompatible one strands what the schema will not take, with the `conform::*` diagnostics naming each stranded value.

**Showing what stranded is the point**, so those diagnostics are a labelled group in the errors band rather than a swallowed load warning. They describe the document as it *arrived*, so they are dropped at the first edit and the schema producer speaks for it from then on.

Two edges the loop turns on. A ref that went away under the author (a version directory renamed) leaves the document nothing to land in, so whatever the catalog now holds is seeded instead. And a quill that will not **open**, the state an author reloads through most often with a plate mid-fix, keeps the document as text rather than eating it: the panes go empty, the errors say why, and the next repack that compiles gets it back.

An open takes as long as the backend takes to load and compile a page, which is long enough for a second repack to land inside one, so the loser of two overlapping opens drops what it built instead of both writing the same slot.

A *pick*, unlike a repack, carries nothing. A different quill is a different document, and its seeded example is where "what is this quill like to use" starts.

## The errors

Four producers say something about the document in hand, and an author reading them wants one list:

| Origin | What it is |
| --- | --- |
| `schema` | `quill.validate(doc)`: the schema's verdict on the document |
| `render` | the compile: `session.warnings`, and the diagnostics a throw carries |
| `carried` | the `conform::*` set a repack stranded |
| `surface` | what an editor or a preview recovered from |

A throw is unwrapped rather than reported as one line: a `QuillmarkError` carries every diagnostic, and a broken plate is the case that matters.

Every note keeps its **address**, and that is the load-bearing column. An address is written in one of two spaces. `path` is the document's: the editor routes a diagnostic to its control by it. `location` is the quill's source, a file, a line and a column, which a compile failure carries and nothing the schema says does; it routes to nothing here and is what an author opens their other editor at. A note with neither is **unrouted**: it names no place at all, and the summary counts those. A diagnostic detached from what provoked it is a quill's problem, and nothing else in the toolchain shows it.

The band is under the panes rather than over them: it is consulted, not watched, and a surface that appears and disappears would reflow the thing being judged every time a keystroke fixed a field.

**A document that will not compile is a state of the paint, not a row under it.** The session is transactional, so the last good paint stays on screen and stops answering the document. That is what a failed open reports one pane over, so it takes the same register: the failure at the surface it is about, carrying the place to open. The paint stays whole underneath, being the only evidence of what the plate did before it stopped compiling, and the strip is laid over rather than stacked above, so breaking a plate and fixing it do not resize what is being judged. The band still lists the diagnostics, one list being its job.

## Not

A Typst IDE: studio shows a quill, it does not edit the plate or the schema. Not a CMS: no auth, no persistence, no multi-doc management, matching the playground's own limit. Not a gate: `quiver test` is blocked on, studio is looked at, and `studio dev` gates nothing. Studio carries its own verbs and **absorbs none**: `build` and `test` stay quiver's, and nothing here renders on a server.

## The door rule, for what comes next

Studio is headed for features that write quill source (a schema editor, a form quill-ifier), and today every arrow points one way: disk → HTTP → browser. Those need an arrow back, and it is the first thing between the halves that is not a static file.

The rule that keeps it from leaking: **quiver owns the authored source layout and every door onto it; a door moves bytes into the layout and does not know what the bytes mean.** A door that must parse a `Quill.yaml` to do its job is studio's, not quiver's. Quiver already owns the safety the layout implies (the path-escape rejection reading manifest-named files off a disk, the destructive-write refusals in `build`), which is the concrete reason a client cannot reimplement it correctly.

No write door yet. Designing a protocol before there is an editor to shape it is how the wrong protocol gets built; the rule is what makes the right one land when it arrives.

## Links

[QUIVER.md](../../../quiver/prose/canon/QUIVER.md) · [PLAYGROUND.md](../../../playground/prose/canon/PLAYGROUND.md) · [`THEMING.md`](../../../svelte/THEMING.md)
