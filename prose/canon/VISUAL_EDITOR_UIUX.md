# Visual Editor — UI/UX

> **Implementation**: `src/lib/visual/`

## TL;DR

The interaction and visual patterns of the VisualEditor — the card-stack metaphor,
per-field affordances, the formatting chrome, and the editor→preview coupling. The
architectural composition (ownership, the address spine, the edit ops) is
[VISUAL_EDITOR.md](VISUAL_EDITOR.md); this doc is the surface a user touches. Prior
art is web-app; a decision that carries it forward says so. This records the V1
surface: the theming baseline ships (§"Complex UX, minimal UI"), the insert surface
stays deferred (§Open), and a few capabilities deferred past V1 are named where
they belong. The `--qm-*` theming baseline is catalogued in
[`THEMING.md`](../../THEMING.md).

## Two settled principles

**Vertical rhythm.** The UI is a single vertical stack, carried from web-app: the
`main` card, then composable `cards[]` in order, each a block of its fields and
body, with an add affordance between blocks. Reading and editing move
top-to-bottom down one column; the document's structure is the page's structure.

**Complex UX, minimal UI.** The editor ships dense behavior over a thin skin:
direct manipulation, the caret bridge, per-field state, against a bare built-in
visual opinion, so a consumer restyles to its brand without fighting baked-in
design. Structure and behavior live in the primitives (bits-ui's headless base);
appearance is a themeable surface with a neutral, overridable baseline — a set of
`--qm-*` custom properties ([`THEMING.md`](../../THEMING.md)). The broad theming
system stays deferred (§Open).

## Card stack

`main` (typically headerless), then composable cards in declaration order, each a
header, its field list, and its body, with an add-card affordance between blocks.

**Card controls** carry web-app's placement (`EditorBlock`). Composable cards
only — `main` has none. In the card header, right-aligned opposite the title: a
hover-revealed move-up/move-down chevron pair, pinned visible while the card is
active, each disabled at its edge (up on the first card, down on the last); then
an always-visible delete. Reorder is buttons, not drag. Rename is the
inline-editable title itself, not a separate control; retype is a between-block
selector.

Drag reorder is not carried in V1: the interaction cost (threshold, drop targets,
keyboard and touch parity) buys only what the buttons already do.

## Formatting

Formatting splits by what an action anchors to: a **selection** (marks) or a
**position** (insertion, structure). V1 ships the selection anchor. The two-anchor
split leaves the position surface a place to land later without disturbing marks.

**Marks — selection popover.** A non-empty selection in a prose leaf raises a
popover over the active leaf: `strong`, `emph`, `underline`, `strike`, `code`,
`link`, plus `anchor` identity. It emits PM transactions the codec lowers to
`markOps`. A keymap mirrors the core marks (`Mod-b`/`i`/`u`) for keyboard;
`strike`/`code`/`link` stay toolbar-only in V1. On touch, the same marks are meant
to ride an accessory bar above the keyboard (a popover fights the OS selection
handles) — the touch bar is deferred (§Open).

The popover is a translucent, backdrop-blurred pill (SURFACES §Elevation — the one
floating surface earns the lift), top-center over the selection and flipping below
when it nears the viewport top, scaling in on each raise. Each mark is a Lucide
glyph, the icon naming its action (AESTHETIC §Icons) — bold, italic, underline,
strikethrough, code, link — with `anchor` shown disabled (its codec seam is
deferred, #43).

**Input rules — typist shorthand, no chrome.** `**`, `*`, `~~`, `` ` ``, `# `,
`- `, `1. `, `> `, and a ` ``` ` code fence. These cover the marks and the block
shorthands (headings, lists, quote, code); underline is keymap-only (`Mod-u`), and
no table-entry rule ships (island authoring deferred, §Open). Markdown is an input
shorthand, never the stored form.

**Deferred past V1 — the position anchor:** a gutter insert affordance, its menu,
and a slash command, together the doors onto insertion. While deferred, the editor
does not author tables or islands in V1 — a step back from web-app, named here
rather than left silent. Editing a table already present in an imported document
is a separate concern (the island controls), not gated by this.

## Fields

- **Field form** — the schema's fields as controls, laid out from `ui` hints.
  Layout density carries web-app's system: `ui.group`/`ui.compact` drive columns.
- **Prose leaf** — the body and each rich field as an inline WYSIWYG surface.
- **Per-field state** — focus, inline diagnostics, and a ghosted `default:`
  placeholder (never written back — it lives in the schema). A `!must_fill`
  marker surfaces only as a routed `validate()` warning among those diagnostics;
  no dedicated nudge and no tips surface (`example:`) in V1.
- **Array fields** — a repeater: one control per element (text / prose / minimal
  JSON by `items.type`), a per-row delete, an add affordance at the foot. No
  element reorder — rows hold entry order, and the array commits by value, so a
  mis-order is fixed by editing in place, not by moving rows. (The card stack
  keeps ↑/↓ — a curated set of heavyweight blocks earns it; a scalar list does
  not.) Reorder can return behind an `items`/`ui` hint if a quill needs it.

## Editor↔preview

Coupling is consumer-wired and opt-in, in both directions (VISUAL_EDITOR §"Focus
and the preview bridge"). The editor emits its active address and caret moves,
which the consumer may feed to `preview.focusPosition` so the preview follows
the editor; a preview click surfaces a `ContentHit` the consumer may hand to
`visualEditor.setCaret`, landing the caret in the editor — the click round-trip.
Neither surface imports the other; the bridge and the editor|preview split shell
live at the consumer layer (the playground wires both).

## Source view

Debug-only, per [ARCHITECTURE.md](ARCHITECTURE.md) — not an editable dual mode. The
`@quillmark/editor/source` surface is a read-only CodeMirror mirror of
`Document.toMarkdown()`, the whole-document serialize the layer federation deletes.

## Open

- **Theming (broad system)** — the baseline `--qm-*` token set ships
  ([`THEMING.md`](../../THEMING.md)); the broad system — semantic scales, class vs.
  part hooks, dark mode — is deferred.
- **Insert surface (post-V1)** — the deferred position anchor: gutter affordance,
  menu, slash command, and table/island authoring.
- **Formatting reach (post-V1)** — the touch accessory bar and keymap shortcuts
  for `strike` / `code` / `link` (only `Mod-b`/`i`/`u` bind today); the popover's
  `anchor` button awaits a codec anchor-insert seam (a `FieldController.insertAnchor`
  verb — anchors are editor-side decorations, not WASM marks).
