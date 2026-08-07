# Playground

> **Implementation**: `src/routes/`

## TL;DR

The dev app around the library: the reference wiring for the glue the primitives push outward, the manual harness for what a unit test cannot reach, and the page a stranger evaluating the package opens first. Its shape is two routes, two readers, and the endorsed look they are drawn with. What a host must provide a mounted surface is [`THEMING.md`](../../../svelte/THEMING.md); nothing here reads a `--_qm-*` rung.

## Two jobs on one page

The playground is a harness *and* the package's landing page (it deploys as the project's Pages site), and those pull in opposite directions. A harness wants its instruments within reach: state strips, live document dumps, fixture variants, the `data-testid` hooks a headless pass drives. A landing page wants to be readable by a stranger.

The resolution is **placement**: the harness is one route, and the instruments on it sit on plates rather than in the reading column. What has no reader outside a hand driving the harness (fixture variants, the consumer channels a quill cannot declare) is a query flag, not chrome.

So the front page **mounts what it describes**. It is a quickstart, and every surface it names is mounted beside the steps that reach it, over a session of the reference quill opened exactly as a consumer's is: the page a stranger reads is also the page that runs. Nothing on it claims a capability the mounted surface is not already showing.

## The host scale

The playground draws with `@quillmark/svelte/preset`, the same import a third-party consumer makes, so it looks like the endorsed version by construction. The preset carries the `--qmh-*` scale and the recipes, the workspace shell among them; `playground.css` carries what the app adds on top and nothing the preset already has: a page maximum, a display size, a demo frame's height, and the ramp's upper steps derived from the preset's base. The column the front page reads against is the preset's measure, so the width prose wraps at and the width a code sample is cut to are one number.

An app scale may not restate a name the preset defines, and two app scales may not mint one concept at two values ([ARCHITECTURE.md](../../../svelte/prose/canon/ARCHITECTURE.md) §Styling). That second rule is what surfaced the shell: the playground's stacked-pane height and studio's were one job at one value under two prefixes, and a rung two apps have to keep agreeing on is a rung the preset owns.

A mounting site states only what the surface cannot, and most of that is `.qm-frame`'s and `.qm-split`'s rather than the route's: a track that may shrink below its content, an edge and a corner, and the clip that holds a surface to them, positioned so the clip reaches the surface's out-of-flow parts (one that resolves past the frame lands unclipped and extends the page's scroll past its own foot). The editor carries `.qm-pane` because it is mounted in a fixed height rather than a page, and the gutter, the tone, the desk and the tail are the surface's own (THEMING §"Drop it in").

The chrome around a mounted surface stays **plainer than the surface**, which is the most detailed thing on any route. Colour is spent on one thing, a boundary that failed; an open session takes no colour and no word, since the page it paints already shows it.

## The routes

Two, because the site has two readers.

- **`/`**: the quickstart, in two columns. The thesis and two actions, then one step per thing a consumer does: install, open a session, mount `<Preview>`, mount `<VisualEditor>`. Prose and code run down the reading column and the surfaces stand in what is left of the page, one band per surface: install, session and preview beside the page a session paints, edit beside the editor. The code and its output are read without scrolling between them, and a step with no output of its own spends no width on one. Below the width that holds a measure and a surface abreast, the split stacks and each surface follows the steps that reach it. The samples are strings in `samples.ts`, one per step: a Svelte sample carries a `</script>` that would close the route's own script block, and a step's code is the value the tutorial edits.
- **`/playground`**: the reference split-pane shell, and the harness; its architecture is ARCHITECTURE §Playground's. It is a **workspace, not a page**, and the shape of one is `.qm-workspace`'s: the layout hands the route the viewport less the running head and it scrolls nowhere, so the panes hold still while their contents move. The shell is pinned at every width, and a gesture past the end of a pane stops there rather than chaining out to bounce the document. The panes take `.qm-split`'s even tracks, with the page gap and their own frames between them. Below the width that fits two the split stacks itself; what the route decides is where the room comes from, and it is the route's own column, so both panes stay reachable without the document becoming a scroller. A drawer under the panes mirrors `doc.toMarkdown()`, read-only, in `SourceMirror.svelte`: the package ships no surface for it because `Document` is public and the serialize is the whole of one (ARCHITECTURE §Packaging), so a debug view in the harness is not a reach past the public API.

Both surfaces run on the front page too, each over its own document. No apply loop runs there, so one document across two steps would let typing in the editor desynchronize the page painted above it. `/playground` is where the two are wired together.

Two guardrails hold across both: the playground consumes only the public subpath API (a needed internal is an API gap to fix), and it stays a harness, not a product: no auth, persistence, or multi-doc management.

## Fixture variants

The reference quill on disk reaches some branches and not others: it declares one card kind, a blank date default, no guidance channel, and no card whose kind the schema cannot project. The variants that reach them are **query flags on `/playground`**, read once at mount: `?kinds2`, `?dateDefault=YYYY-MM-DD` (schema, patched into the tree before the quill is built), `?tips`, `?foreign` (seeds, applied to the document after). They carry no chrome, because the only reader is a hand driving the harness, and a switch for one would be a control on the landing page for everyone else.

## Quiver, not bundler

Every route opens its session over the reference quill from a **quiver**, not from the bundler: no Typst source or font bytes in the JS bundle. This is the workspace's one edge to `@quillmark/quiver`; the library has none, so the app is where the two tiers meet.

One `Quiver` serves the page. Its quill cache is per canonical ref and lives as long as the quiver does, so a client-side navigation between routes reuses one materialization rather than paying for its own. Routes mint and free their own `Quill` from the tree when schema variants rewrite bytes a materialized quill has no seam for.

## Links

[ARCHITECTURE.md](../../../svelte/prose/canon/ARCHITECTURE.md) · [`THEMING.md`](../../../svelte/THEMING.md)
