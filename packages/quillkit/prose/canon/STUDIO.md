# Studio

> **Implementation**: `client/`

## TL;DR

The surface a quill author looks at their quiver through: pick a quill, edit, watch it paint, read the errors. `quillkit test` answers *does it work*; studio answers *what is it like to use*, which is where most of what makes a quill good or bad lives. This doc is its shape: what it is a client of, the repack loop the document survives, and the endorsed look it is drawn with.

Two readers, one client. The author works mid-edit, locally, against files on disk, and the loop below is theirs. A deployed quiver is frozen at a commit, so the reader who arrives at a URL (a reviewer following a branch, someone evaluating a quiver) gets the picker, the surfaces and the errors over one built quiver, with nothing to repack. One client rather than two: it is the same client an `npx quillkit studio` over a working tree serves.

**Studio is the noun, not the verb.** It is a client rather than a package: `client/` beside the bin's `src/` under one manifest, no verb of its own, and `quillkit studio` is how the surface is reached ([QUILLKIT.md](QUILLKIT.md)). The name still has a job the tool's cannot do: the deployed thing a reviewer arrives at is a studio, and "the collection's site" names a directory rather than a surface.

## Looked at, not blocked on

Studio is reached for when someone wants to see the thing; the gate is `quillkit test` (QUILLKIT §"Blocked on, looked at"). Nothing fails a build on studio's verdict, which is what lets it be an app at all: its chrome, its weight and its wasm are its own problem.

## Why it is not the playground

Both mount the same surfaces over the same reference quill, and the distinction is **which thing is variable**. The playground holds the quill fixed and makes the *wiring* the subject, so it must show its instruments: state strips, live dumps, fixture variants, the hooks a headless pass drives. Studio holds the wiring fixed and invisible and makes the *quill* the subject, so it must hide them. The suspect when something looks wrong differs too (the library in one case, the quill in the other), and that is what decides what each surfaces.

That separation reaches the DRAWING, not only the contents. Both are one session under two surfaces in a pinned shell, so the shape of the screen is one thing taken out of the preset; what fills it is not. A page showing its instruments stands its mounts apart, framed, so each reads as one of several things on it. Studio spends the whole screen on the two mounts: they run to the viewport's edges and meet at a hairline, because the surface is the subject and every pixel of chrome around it is a pixel not spent on the quill.

Studio also sheds the playground's front-door job: one screen rather than a site, with no router, no reading column and no landing page. The author arrives having typed the verb, so there is no quickstart to carry.

## A client, and what serves it

A browser cannot read the source layout, so studio ends at a built artifact behind a base URL, consumed with `Quiver.fromBuiltUrl`. Packing, watching and serving are `quillkit studio`'s, and none of it is here: `client/` is the client those verbs lay over a pack, and that is the whole of it.

**Shipped inside the tool, and nothing in it is importable.** `vite build` lands the client at `dist/client`, beside the compiled bin under the one `dist` the tarball carries, with wasm and both libraries bundled in. quillkit is a **bundled terminal** (`check:deps`): no importable entry, no runtime dependencies, so what the client bundles is never installed a second time beside it. An importable entry would put studio's wasm in an importer's process, which is the thing the artifact's single-copy rule exists to prevent; the one wasm here runs in a browser tab, in a process nothing else shares.

**Two toolchains under one manifest**, which is what carrying the client costs: `tsc` compiles the bin from `src/`, `vite build` compiles the client from `client/`, `prepack` runs both, and svelte, vite and svelte-check sit in the tool's `devDependencies`. The trees share a `dist` and meet nowhere else, which is what keeps the cost to the manifest: three programs, and no file is in two of them (`tsconfig.json`, `tsconfig.client.json`, `tsconfig.check.json`).

**A pack is never the client's.** The base URL is a runtime fact, so a quiver is laid beside the client at deploy time and never baked into it, and a built studio serves from wherever it is put. The layout is `quillkit site`'s to write ([QUILLKIT §The deploy layout](QUILLKIT.md)); the client asserts nothing about it, and `vite build` runs with `copyPublicDir: false` so a dev run's packed tree cannot ride into the tarball.

**The client** is an ordinary quiver consumer: `fromBuiltUrl(base)`, a picker over `quillNames()` and `versionsOf()` (both sync, so it needs no loading state), `getQuill(ref)`, then the surfaces over one `LiveSession`. The picker offers only what varies: an axis holding one value is printed rather than selected, since a working tree is usually one quill at one version and a control that cannot be used is chrome competing with the surface. The fact stays either way, an author having to know what they are looking at. The quill it holds is **borrowed** (cached per canonical ref for the quiver's lifetime and handed to every caller), so studio frees the session and the document and nothing else. It rewrites no quill bytes, so it needs no quill of its own.

**One wasm, and the head says which.** Inside this workspace the root `overrides` pin is the only copy, so studio and `quillkit test` render through one instance. Over a collection they are two: the client bundles the copy it was built with, a gate runs whatever the collection's own tree holds, and nothing at runtime reconciles them. The version is stated so the reader who cannot run `npm ls` is told what painted the page.

**And the bundle names the rest of what it carries.** A browser resolves nothing, so both siblings are compiled in too, and no manifest in a consumer's tree records which copies. The build stamps all three (`scripts/carried.mjs`): `__CARRIED__` for the running client, `dist/client/carried.json` for a consumer reading the tarball without running it, and one line in the release notes. A sibling's stamp is its manifest version qualified against its own release tag: a bare version claims the bytes are the released ones, and a qualified one says either how far past the tag they are or that nothing could be measured. A label rather than a refusal: nobody installs the contents of a bundle, so the coordinate is for diagnosis, and a release whose notes name unreleased sibling code reads as wrong.

**The client ships built and runs unbuilt.** The tarball carries what `vite build` produced; locally it is an ordinary Vite dev server, with HMR on its own chrome. That is the whole of what the dev server buys over `quillkit studio`, and the pack it serves is the same `build` the tool calls, so the loop is not written twice. An author who cannot run a bundler is the reason for the first, and the reason the wasm is bundled with it.

**The bridge is studio's own; the shell's shape is not.** The caret bridge and the debounced recompile are consumer-layer by design, and a shared component wiring them would contradict the reason the wiring is the consumer's. The shape of the screen goes the other way: the pinned bands, the row a band puts its parts on, and the split's tracks and its breakpoint are the preset's classes on studio's own elements (THEMING §"The shell"). What studio writes is what a band is MADE of, which is where the look diverges: the mark's treatment, the head's depth and full-bleed rule, the seam the mounts meet at, and the depth of the switch band above them. A rule studio writes because the preset picked the playground's answer is the promotion coming apart, not a divergence.

The threshold is the test of that, and studio states none: under it the split shows one track, `.qm-switch` says which, and the caret bridge reveals the editor when a hit crosses into it. The seam is what makes the number unnecessary here: it is the split's own gap closed to a stroke with the border behind it, so it appears and goes with the second track. Drawn on a pane instead, it would outlive the pane beside it and stand against the viewport, and studio would restate the preset's widths to say when not to draw it.

Studio draws with `@quillmark/svelte/preset`, the same import a third-party consumer makes; `studio.css` adds one height beyond the endorsed look, the depth the notes band opens to.

## The document is the blueprint's

Studio holds one document and it is the schema's own: `seedDocument()` over the `example:` values in `Quill.yaml`. There is no door in and no door out: no file it is read from, none it is written to, and nothing of studio's own that outlives the tab.

**Reload is the reseed.** A boot seeds, and the carry keeps a running session on the document in hand, so an `example:` edited mid-session does not appear until the page reloads. F5 is the whole of that verb, and it costs a keystroke rather than a control.

**What that costs.** The failures that only a long list, a wrapping value or an empty optional reveal are invisible here, and to `quillkit test` with it: neither renders a document the schema did not write. The corpus *is* the `example:` block, so an author buys that coverage by writing examples that are uncomfortable rather than tidy.

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

A Typst IDE: studio shows a quill, it does not edit the plate or the schema. Not a CMS: no auth, no persistence, no multi-doc management, matching the playground's own limit. Not a gate: `quillkit test` is blocked on, studio is looked at, and `quillkit studio` gates nothing. Not a tool: the client carries no verb, so every door onto it is one the bin beside it opens.

## The door rule, for what comes next

Studio is headed for features that write quill source (a schema editor, a form quill-ifier), and today every arrow points one way: disk → HTTP → browser. Those need an arrow back, and it is the first thing between the client and its server that is not a static file.

The rule that keeps it from leaking: **quiver owns the authored source layout and every door onto it; a door moves bytes into the layout and does not know what the bytes mean.** A door that must parse a `Quill.yaml` to do its job is studio's, not quiver's, and quillkit's job is to hang the door rather than to decide what goes through it. Quiver already owns the safety the layout implies (the path-escape rejection reading manifest-named files off a disk, the destructive-write refusals in `build`), which is the concrete reason a client cannot reimplement it correctly.

No write door yet. Designing a protocol before there is an editor to shape it is how the wrong protocol gets built; the rule is what makes the right one land when it arrives.

## Links

[QUILLKIT.md](QUILLKIT.md) · [QUIVER.md](../../../quiver/prose/canon/QUIVER.md) · [PLAYGROUND.md](../../../playground/prose/canon/PLAYGROUND.md) · [`THEMING.md`](../../../svelte/THEMING.md)
