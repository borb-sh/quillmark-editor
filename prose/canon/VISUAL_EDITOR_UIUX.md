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
appearance is a themeable surface with a neutral, overridable baseline — the
`--qm-*` dials deriving a closed private scale ([`THEMING.md`](../../THEMING.md)).
Every control is styled off that scale, including the three whose native form is
UA-owned shadow DOM (enum, boolean, date), so the palette has no holes.

## Card stack

`main` (typically headerless), then composable cards in declaration order, each a
header, its field list, and its body, with an add-card affordance between blocks.

**Card controls** carry web-app's placement (`EditorBlock`). Composable cards
only — `main` has none. In the card header, right-aligned opposite the title: a
hover-revealed move-up/move-down chevron pair, pinned visible while the card is
active, each disabled at its edge (up on the first card, down on the last); then
an always-visible delete. Reorder is buttons, not drag.

Rename is the inline-editable title itself, not a separate control. The title
autosizes to its text, so the **hit region** is the header's free width rather
than that box: a press anywhere left of the controls enters the edit, and entry
selects all whether it lands on the text or beside it.

The header carries **no retype**. A kind is chosen once, at the between-block
insert affordance; the only path that changes an existing card's kind is the
recovery shell's selector, for a card whose kind the quill does not declare. A
header retype is a control with nothing to do: under one declared kind it can
only reselect the kind the card has, and a correctly typed card has nothing to
retype.

Insert and reorder **move the viewport**: a new card scrolls to centre, a moved
card to `nearest`, so a structure edit past the fold is never silent. Both honour
`prefers-reduced-motion`.

Drag reorder is not carried in V1: the interaction cost (threshold, drop targets,
keyboard and touch parity) buys only what the buttons already do.

## Tips card

An **ephemeral** block in the stack, fed by `$ext.editor.tips` (issue #71) — the
one guidance surface that is not attached to a field. It sits in a fixed slot after
`main`, ahead of the cards, so document-level hints read as document-level and
never displace a control.

One tip at a time, with an advance and a dismiss; both exits clear the channel, so
the card leaves and does not return. Content is **inline markdown**, rendered
through the codec's `renderContent` — decode, then the nodes' own `toDOM` — so a tip
is written in the body's mark vocabulary rather than by a second renderer that would
drift from it. The inline schema makes every tip one paragraph, so advancing cannot
reshape the block.

The cursor is **local**, not the channel: advancing writes nothing. A per-tip write
would round-trip the boundary and dirty the document on what is a read gesture, so
exactly one write happens, at dismissal. A dismissal therefore persists in `$ext` —
what "does not reappear" costs. The tip *string* is derived before the render effect
reads it, so an unrelated commit elsewhere in the document does not re-parse the tip
or rebuild its live region.

Visually it is in-flow like every other block (SURFACES §Elevation): one hairline,
no lift, no new token. It recedes by tone and type — the label rung in the muted
label colour (AESTHETIC §"Secondary text recedes") — so it reads as guidance beside
the fields rather than as another one.

## Formatting

Formatting splits by what an action anchors to: a **selection** (marks) or a
**position** (insertion, structure). V1 ships the selection anchor. The two-anchor
split leaves the position surface a place to land later without disturbing marks.

**Marks — selection popover.** A non-empty selection in a prose leaf raises a
popover over the active leaf: `strong`, `emph`, `underline`, `strike`, `code`,
`link`, plus `anchor` identity. The six formatting marks emit PM `toggleMark`
transactions the codec lowers to `markOps`; `anchor` is a decoration (not a PM
mark), toggled through the `FieldController.insertAnchor` / `removeAnchor` seam
and lowered to an `anchor` op (CODEC §Marks). A keymap mirrors the core marks (`Mod-b`/`i`/`u`) for keyboard;
`strike`/`code`/`link` stay toolbar-only in V1. On touch, the same marks are meant
to ride an accessory bar above the keyboard (a popover fights the OS selection
handles) — the touch bar is deferred (§Open).

The popover is a translucent, backdrop-blurred pill (SURFACES §Elevation — the one
floating surface earns the lift), top-center over the selection and flipping below
when it nears the viewport top, scaling in on each raise. Each mark is a Lucide
glyph, the icon naming its action (AESTHETIC §Icons) — bold, italic, underline,
strikethrough, code, link — with `anchor` a 7th, toggling an identity handle
over the selection (its codec seam ships: `FieldController.insertAnchor`, #43).

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

- **Field form** — the schema's fields as controls, laid out from `ui` hints. The
  editor carries web-app's density *hints* — `ui.group` and `ui.compact` — and not
  its layout pass: a section is ONE grid, capacity comes from a container query, and
  fields auto-place (§"Section grid").
  `ui.group` sections are a collapsible accordion — one open at a time, the sole
  group (or, body-less, the first) auto-expanded; ungrouped fields stay above it,
  always visible. A section header is a heading, not metadata: sentence case at the
  field-label rung, its whole row the target, its label centred between the rule
  above it and the one it draws. Open and hover are ink steps; the chevron's
  rotation carries open/closed, and no hue enters (AESTHETIC §Rules).
- **Prose leaf** — the body and each rich field as an inline WYSIWYG surface.
- **Per-field state** — focus, inline diagnostics, a ghosted `default:`
  placeholder (never written back — it lives in the schema), a persistent required
  `*` on no-`default:` (Unendorsed) fields, and the field's `description:` as a
  label tooltip (issue #75). A `!must_fill` marker also surfaces as a routed
  `validate()` warning among those diagnostics — the `*` states required-ness, the
  warning reports unmet-ness; `example:` still gets no dedicated nudge. No field
  carries a tips surface: guidance that is not about one field belongs to the
  document, and rides the tips card (§"Tips card").
- **Array fields** — a repeater: one control per element (text / prose / minimal
  JSON by `items.type`), a per-row delete, an add affordance at the foot. No
  element reorder — rows hold entry order, and the array commits by value, so a
  mis-order is fixed by editing in place, not by moving rows. (The card stack
  keeps ↑/↓ — a curated set of heavyweight blocks earns it; a scalar list does
  not.) Reorder can return behind an `items`/`ui` hint if a quill needs it.

### Section grid

A section is one grid, and a row is its output rather than its input. `placeFields`
gives each field a span — nothing more — and the grid places them:

- **`ui.compact` asks; the editor may decline.** A row is as tall as its tallest
  cell, so the shapes that GROW under their neighbours take a full row whatever the
  hint says: arrays (which own their label and their own rows), objects (a nested
  field set), and block richtext — `inline` absent, so it holds paragraphs. An
  inline prose leaf is one line tall and packs like any scalar. A quill asking for a
  dense multi-paragraph field asks for something a row cannot give; the hint is
  declined rather than granted at the row's expense.
- **Capacity is the container's, not JavaScript's.** A container query steps
  1 → 2 → 4 columns, each rung the width at which a track still clears a comfortable
  field (SURFACES §Rhythm). Nothing measures, so there is no observer to loop, no
  first pass at the wrong capacity, and — because re-packing never restructures the
  DOM — no resize can remount a prose leaf.
- **A trailing orphan keeps its column width.** It continues a grid that already
  exists, so auto-placement holds it to one track. A field that grew to fill its
  line would render the third of three at twice its siblings.
- **A compact run of ONE takes half the capacity from column 1.** It has no row
  above to align to, so a single track reads as truncated. Capacity skips 3 so that
  half always lands on a track boundary.
- **Fields subgrid onto the section's rows.** A row-sharing field takes three tracks
  from the section — label, control, diagnostics — instead of sizing its own, so
  every control in a row starts at one baseline however tall a neighbour's label
  wrapped, and a diagnostic under one field lifts none of the others out of line. A
  full-width field owns its row and stays a plain stack: there is nothing to align
  it against. No fallback ships — subgrid and container queries are both Baseline.

## Editor↔preview

Coupling is consumer-wired and opt-in, in both directions (VISUAL_EDITOR §"Focus
and the preview bridge"). The editor emits its active address and caret moves,
which the consumer may feed to `preview.focusPosition` so the preview follows
the editor; a preview click surfaces a `ContentHit` the consumer may hand to
`visualEditor.setCaret`, landing the caret in the editor — the click round-trip.
Neither surface imports the other; the bridge and the editor|preview split shell
live at the consumer layer (the playground wires both).

**Each direction shows where it landed, and neither leaves a mark.** A hop between
the panes is an event, so it is marked by an accent wash that blooms and decays to
nothing — resting ink on either side would outlive the hop that caused it, and on
the preview it would sit on the surface the user is proofing (PREVIEW §Overlay,
SURFACES §Motion). The two sides differ in exactly one way, because their inputs do:

- **Editor → preview** is a CONTINUOUS signal — `onCaretMove` fires per keystroke —
  so the preview blooms only on a change of address. Marking the field being typed
  into is noise, and the recompile already repaints the changed text 120ms later:
  the edit is its own highlight. The bloom earns its keep when a field is engaged
  *without* typing — orienting, tabbing, clicking.
- **Preview → editor** is a DISCRETE act — one click, one `setCaret` — so the
  landing leaf blooms every time, unguarded. Its commonest target is the leaf
  already focused, where placing a caret changes nothing on screen, or one
  off-screen, where the browser's focus-scroll moves the page and leaves the caret
  to be found. A border flash would answer neither: `ProseField` already tints its
  hairline to `--_qm-accent` on `:focus-within`, so in the common case the border it
  would flash to is the colour it already is.

A landing REVEALS itself first. A collapsed accordion group clips its panel to zero
height without unmounting it, so a caret placed inside one is a caret nobody can see
— `main.subject` on the reference memo is exactly this case. `setCaret` asks the
owning card to open the group holding its target (§"Card stack" keeps `expanded` the
card's own state; the editor only asks), then lands. Focus alone cannot substitute:
the browser scrolls to a clipped box without unclipping it.

## Source view

Debug-only, per [ARCHITECTURE.md](ARCHITECTURE.md) — not an editable dual mode. The
`@quillmark/editor/source` surface is a read-only text mirror of
`Document.toMarkdown()`, the whole-document serialize the layer federation deletes.
Monospace text in a `<pre>`, no syntax highlighting: a surface with no caret earns
no editor library, so `/source` ships dependency-free.

## Open

- **Control slots** — a per-`ControlKind` extension point past the tokens is
  deferred until a consumer needs one. The constraint is recorded: the package owns
  reconciliation (`syncedLocal`), so a slot handing out a raw `value` reintroduces
  issue #48's caret reset in consumer code, invisibly to this repo's tests.
- **Insert surface (post-V1)** — the deferred position anchor: gutter affordance,
  menu, slash command, and table/island authoring.
- **Formatting reach (post-V1)** — the touch accessory bar and keymap shortcuts
  for `strike` / `code` / `link` (only `Mod-b`/`i`/`u` bind today). The popover's
  `anchor` button ships (§Formatting): it mints a unique id and toggles an identity
  handle over the selection through `FieldController.insertAnchor`. The chrome that
  makes an anchor *useful* — comment-thread UX bound to the handle — is post-V1.
