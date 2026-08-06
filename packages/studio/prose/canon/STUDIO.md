# Studio

> **Implementation**: `src/` (the browser half) · the Vite config's `studio:quiver-source` plugin (the Node half)

## TL;DR

The surface a quill author looks at their quiver through: pick a quill, edit, watch it paint, read the errors. `quiver test` answers *does it work*; studio answers *what is it like to use*, which is where most of what makes a quill good or bad lives. One reader: the author, mid-edit, locally, against files on disk. This doc is its shape: two halves, the repack loop the document survives, and the endorsed look it is drawn with.

## Looked at, not blocked on

`build` and `test` are what quiver gives a quill author, and they are the whole of it. The boundary is **looked at** against **blocked on**: `test` runs in the author's CI, against the author's own wasm through the CLI's engine discovery, and installs a loader rather than an app. Studio is reached for when someone wants to see the thing.

The two share one artifact, and it is the **blueprint**: `quiver test` seeds with `quill.seedDocument()` and so does studio, so the document the gate renders is the document the author judges, and it is the only document either one can name.

Keeping the gate in quiver is what lets studio be an app at all. Nothing fails a build on studio's verdict, so studio's chrome, its weight and its wasm are its own problem.

## Why it is not the playground

Both mount the same surfaces over the same reference quill, and the distinction is **which thing is variable**. The playground holds the quill fixed and makes the *wiring* the subject, so it must show its instruments: state strips, live dumps, fixture variants, the hooks a headless pass drives. Studio holds the wiring fixed and invisible and makes the *quill* the subject, so it must hide them. The suspect when something looks wrong differs too (the library in one case, the quill in the other), and that is what decides what each surfaces.

Studio also sheds the playground's front-door job. Its reader arrives already committed, so there is no quickstart to carry, and it is one screen rather than a site: no router, no reading column, no landing page.

## The two halves

A browser cannot read the source layout, so studio ends at a built artifact behind a base URL, consumed with `Quiver.fromBuiltUrl`.

**The Node half** packs and watches, and does nothing else: `build()` into the directory the dev server serves, watch the source tree, repack, signal. It is a Vite plugin, and the dev server's alone. Two constraints come from the serving layer rather than from quivers, and both are stated where the plugin is: the first pack lands before the server is created, and the packed tree stays watched.

**A generation is never observably half-written.** `build` clears its output before writing it, so a pack is assembled outside the served tree and moved in with one rename. Without that, a client reading the pointer mid-pack reports a broken quiver for an edit that was fine.

**The browser half** is an ordinary quiver consumer: `fromBuiltUrl(base)`, a picker over `quillNames()` and `versionsOf()` (both sync, so it needs no loading state), `getQuill(ref)`, then the surfaces over one `LiveSession`. The picker offers only what varies: an axis holding one value is printed rather than selected, since a working tree is usually one quill at one version and a control that cannot be used is chrome competing with the surface. The fact stays either way, an author having to know what they are looking at. The quill it holds is **borrowed** (cached per canonical ref for the quiver's lifetime and handed to every caller), so studio frees the session and the document and nothing else. It rewrites no quill bytes, so it needs no quill of its own.

**Nothing renders on the server.** The WASM boundary and the paint loop are browser concerns, which is what keeps the Node half a packer and a file watcher.

**One wasm, and the head says which.** The root `overrides` pin is the workspace's only copy, so studio and `quiver test` render through one instance and cannot disagree. The version is stated anyway: a client bundles the copy it was built with, a gate runs whatever its own tree holds, and nothing at runtime reconciles them, so the reader who cannot run `npm ls` is told what painted the page.

**The client is not prebuilt.** Shipping it built is a launch constraint only a published studio carries, so studio is an ordinary Vite dev server, with HMR on its own chrome.

**The bridge is studio's own.** The caret bridge and the debounced recompile are consumer-layer by design, and studio's chrome diverges from the playground's anyway. A shared shell promoted into the package would contradict the reason the shell is the consumer's.

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

## Built as though it publishes

Studio is private, so it depends on `@quillmark/wasm` rather than peering it, and it launches against `fixtures/`, the workspace's source quiver. Publishing it is a packaging change rather than a rewrite, and that is a property the browser half maintains rather than one it would acquire: it takes its base URL at **runtime**, off the document's own, and imports nothing workspace-relative. The source path and the output directory are the Node half's alone.

**The built client carries no quiver.** A quiver is what the client is laid *over*, at the `quiver/` its base resolves to, so one packed inside it occupies that URL and the winner is whichever copy lands last — the workspace's fixture, on a site that meant to serve its own. `scripts/site.mjs` is the arrangement stated once: assert the client is quiverless, lay it out, build a quiver beside it, assert the pointer is reachable. `vite preview` serves what it assembles, so the shape a deploy makes is the shape looked at locally.

## Preventing drift

Studio's chrome is `@quillmark/svelte/preset`, the same import a third-party consumer makes, and the reason "studio looks like the endorsed version" is a fact about the build rather than a claim in a doc. It has no recipes of its own: every rule a host draws its chrome with is the endorsed look, and studio adds none beside them.

What `studio.css` still mints is two heights, which is the whole of what one screen adds to the endorsed look. `check:style` runs its axes over this scope, so a component that mints a grey, a size, a radius or a duration fails CI rather than review, and its conformance rule fails a rung that restates one of the preset's, or that names the same concept as the playground's at a different value. The pane height is exactly that case: it is the playground's `--pg-pane` job, and the two are held to one number.

## Not

A Typst IDE: studio shows a quill, it does not edit the plate or the schema. Not a CMS: no auth, no persistence, no multi-doc management, matching the playground's own limit. Not a gate: `quiver test` is blocked on, studio is looked at. Not toolchain: studio absorbs no verb from quiver and carries no CLI.

## Links

[QUIVER.md](../../../quiver/prose/canon/QUIVER.md) · [PLAYGROUND.md](../../../playground/prose/canon/PLAYGROUND.md) · [`THEMING.md`](../../../svelte/THEMING.md)
