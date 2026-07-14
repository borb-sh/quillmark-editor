# Visual Editor — UI/UX

Scope: the interaction and visual patterns of the VisualEditor — the card-stack
metaphor, per-field affordances, the formatting chrome, and the editor→preview
coupling. The architectural composition (ownership, the address spine, the edit
ops) is [VISUAL_EDITOR.md](VISUAL_EDITOR.md); this doc is the surface a user
touches. Prior art is web-app; a decision that carries it forward says so.

This records the V1 surface. Two questions stay open (§Open); a few capabilities
are deferred past V1 and named where they belong.

## Two settled principles

**Vertical rhythm.** The UI is a single vertical stack, carried from web-app: the
`main` card, then composable `cards[]` in order, each a block of its fields and
body, with an add affordance between blocks. Reading and editing move
top-to-bottom down one column; the document's structure is the page's structure.

**Complex UX, minimal UI.** The editor ships dense behavior over a thin skin:
direct manipulation, the caret bridge, per-field state, against a bare built-in
visual opinion, so a consumer restyles to its brand without fighting baked-in
design. Structure and behavior live in the primitives (bits-ui's headless base);
appearance is a themeable surface with a neutral, overridable baseline. The exact
theming contract is open (§Open).

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
`markOps`. The keymap mirrors it (`Cmd+B`…) for keyboard. On touch, an accessory
bar above the keyboard carries the same marks — a selection popover fights the OS
selection handles.

**Input rules — typist shorthand, no chrome.** `**`, `*`, `~~`, `` ` ``, `<u>`,
`# `, `- `, `1. `, `> `. These cover marks and the block shorthands (headings,
lists, quote). Markdown is an input shorthand, never the stored form.

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
  placeholder (never written back — it lives in the schema). No `must_fill` nudge
  and no separate tips surface in V1.

## Editor→preview

Coupling is one-way and opt-in. The editor emits its active address and caret
moves; a consumer may wire those to a preview so the preview follows the editor.
The preview is unaware of the VisualEditor — there is no click-in-preview path
back to a field. The bridge lives at the consumer layer and is not mandatory; the
editor|preview split shell is the consumer's.

## Source view

Debug-only, per [ARCHITECTURE.md](ARCHITECTURE.md) — not an editable dual mode. A
source view is a whole-document serialize/parse round-trip, the layer federation
deletes.

## Open

- **Theming contract** — the themeable surface that delivers minimal, tunable UI:
  custom-property names, class vs. part hooks, what a consumer overrides. Kept
  simple for now; the shape is deferred.
- **Insert surface (post-V1)** — the deferred position anchor: gutter affordance,
  menu, slash command, and table/island authoring.
