# Studio

> **Implementation**: `src/` (the browser half) · `node/` (the Node half, and the bin that is it)

## TL;DR

The surface a quill author looks at their quiver through: pick a quill, edit, watch it paint, read the errors. `quiver test` answers *does it work*; studio answers *what is it like to use*, which is where most of what makes a quill good or bad lives. One reader: the author, mid-edit, locally, against files on disk — `npx @quillmark/studio` in a quiver root, on the cwd convention `quiver build` and `quiver test` already use. This doc is its shape: two halves, the repack loop the document survives, and a host scale of its own.

## Looked at, not blocked on

`build` and `test` are what quiver gives a quill author, and they are the whole of it. The boundary is **looked at** against **blocked on**: `test` runs in the author's CI, against the author's own wasm through the CLI's engine discovery, and installs a loader rather than an app. Studio is reached for when someone wants to see the thing.

Keeping the gate in quiver is what lets studio be an app at all. Nothing fails a build on studio's verdict, so studio's chrome, its weight and its wasm are its own problem.

## Why it is not the playground

Both mount the same surfaces over the same reference quill, and the distinction is **which thing is variable**. The playground holds the quill fixed and makes the *wiring* the subject, so it must show its instruments: state strips, live dumps, fixture variants, the hooks a headless pass drives. Studio holds the wiring fixed and invisible and makes the *quill* the subject, so it must hide them. The suspect when something looks wrong differs too (the library in one case, the quill in the other), and that is what decides what each surfaces.

Studio also sheds the playground's front-door job. Its reader arrives already committed, so there is no quickstart to carry, and it is one screen rather than a site: no router, no reading column, no landing page.

## The two halves

A browser cannot read the source layout, so studio ends at a built artifact behind a base URL, consumed with `Quiver.fromBuiltUrl`.

**The Node half** packs, watches and serves, and does nothing else: `build()` into a tree outside the client's, watch the source, repack, signal. It is a plain module, because a published studio has no Vite behind it to hang on; in this repo a plugin mounts its middleware and Vite serves the client, and from a tarball the bin serves both. Its dependency is `@quillmark/quiver/node` and the standard library, which is what an author downloads to look at a quill.

**A generation is never observably half-written.** `build` clears its output before writing it, so a pack is assembled outside the served tree and moved in with one rename. Without that, a client reading the pointer mid-pack reports a broken quiver for an edit that was fine. A read waits for quiet rather than racing the swap: the rename is atomic, but a client that opened between two of them would pair a new pointer with a manifest already gone.

**One signal, one client.** The repack arrives as a server-sent event on `/__studio/events`, served by the bin and the dev adapter alike. A client that listened on `import.meta.hot` would be a different client published, and losing the repack loop is losing most of what studio is.

**The browser half** is an ordinary quiver consumer: `fromBuiltUrl(base)`, a picker over `quillNames()` and `versionsOf()` (both sync, so it needs no loading state), `getQuill(ref)`, then the surfaces over one `LiveSession`. The quill it holds is **borrowed** (cached per canonical ref for the quiver's lifetime and handed to every caller), so studio frees the session and the document and nothing else. It rewrites no quill bytes, so it needs no quill of its own.

**Nothing renders on the server.** The WASM boundary and the paint loop are browser concerns, which is what keeps the Node half a packer and a file watcher.

**The author's wasm, or none.** Every note studio shows is the artifact's output, so a client carrying its own copy would render through a different program than the gate does: it could show a `conform::*` the author's `quiver test` never produces, and hide one it will. The client's `@quillmark/wasm` imports are therefore left **bare** at build, and the bin resolves the copy installed beside the quiver — the CLI's engine discovery, from the same cwd — serves that package tree, and mints the import map the bare specifiers resolve through. Package-level parity is the whole of what that buys: a custom `engine` from `quiver.config.js` is a Node object, so it stays the gate's alone.

The artifact is an **optional peer**: a package with a `bin` discovers it in the consumer's tree, and declaring it a dependency would install a second copy beside the one it went looking for. Absent, or below the floor the client was built against, is answered at boot in one line — unanswered it surfaces as `runtime::init_failed` or a foreign handle, both of which read like the quill's fault.

**The client ships prebuilt.** An author cannot run a bundler over studio's source, so `vite build` lands in `dist/client` and the tarball carries it. In this repo the Vite dev server serves the same client with HMR on studio's own chrome. The two paths differ in who serves the client and in nothing else the client can observe.

**The bridge is studio's own.** The caret bridge and the debounced recompile are consumer-layer by design, and studio's chrome diverges from the playground's anyway. A shared shell promoted into the package would contradict the reason the shell is the consumer's.

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

Every note keeps its **address**, and that is the load-bearing column. The editor routes a diagnostic to its control by `path`, so a note with none reached no field and is visible only here; the summary counts them. A diagnostic detached from the field that provoked it is a quill's problem, and nothing else in the toolchain shows it.

The band is under the panes rather than over them: it is consulted, not watched, and a surface that appears and disappears would reflow the thing being judged every time a keystroke fixed a field.

## Published, and built that way

`npx @quillmark/studio` in a quiver root: the author's three moves over a quiver are pack it, gate it, look at it, and all three are asked for from the same directory. The bin refuses a directory with no `Quiver.yaml` rather than packing nothing, binds to localhost alone (the trees it serves are the author's own disk, and nothing here authenticates a reader), and stages generations under `node_modules/.studio`, on the source's filesystem so the swap is a rename and inside what the watch already ignores.

The browser half maintains what makes that a packaging change rather than a rewrite: it takes its base URL at **runtime**, off the document's own, and imports nothing workspace-relative. The source path, the output directory and the artifact's mount are the Node half's alone. In this repo the source is `fixtures/`, the workspace's source quiver, and nothing else about the client differs.

The dependency shape follows the graph rather than the app: `@quillmark/quiver` is a real dependency, because the Node half imports it at runtime; `@quillmark/svelte` is a **dev** dependency, because the client is built and its surfaces ship inside `dist/client` — declaring it a dependency would download the editor twice, once in the tarball and once beside it. A studio release therefore pins the `@quillmark/svelte` it was built against, which is the right way round: studio is an app, and its reader composes no package.

## Preventing drift

The host derivation and its recipes are **two stylesheets**, the split the package makes and for the same reason: a rung fixes a value, a recipe fixes which declarations make a thing, and only the second can be checked against the first. The derivation is exempt from the literal rules, so a recipe beside it would inherit the exemption.

Literals live in the derivation and nowhere else under `src`: `check:style` runs its axes over the `--st-*` scope too, so a component that mints a grey, a size, a radius or a duration fails CI rather than review. A value that cannot be minted in a card must not become mintable one directory over.

The scale is shorter than the playground's, and the derivation states which rungs studio does without and why. What it carries that the playground does not is a second hue, because a note has two severities and studio's one job is to show them.

## Not

A Typst IDE: studio shows a quill, it does not edit the plate or the schema. Not a CMS: no auth, no persistence, no multi-doc management, matching the playground's own limit. Not a gate: `quiver test` is blocked on, studio is looked at. Not toolchain: studio absorbs no verb from quiver, and its bin launches the app rather than adding one. Not a hosted service, which is a different reader.

## Links

[QUIVER.md](../../../quiver/prose/canon/QUIVER.md) · [PLAYGROUND.md](../../../playground/prose/canon/PLAYGROUND.md) · [`THEMING.md`](../../../svelte/THEMING.md)
