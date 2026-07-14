# Visual Editor — UI/UX

Scope: the interaction and visual patterns of the VisualEditor — the card-stack
metaphor, per-field affordances, the formatting chrome, the editor↔preview feel,
and guidance/empty states. The architectural composition (what owns what, the
address spine, the edit ops) is [VISUAL_EDITOR.md](VISUAL_EDITOR.md); this doc is
the surface a user touches. Prior art is web-app.

This is an early sketch: it fixes the two principles that are settled and
catalogues the patterns in play. It deliberately does **not** decide the open
forks (§Open) — those are left for later discussion with more thought.

## Two settled principles

**Vertical rhythm.** The UI is a single vertical stack, carried from web-app: the
`main` card, then composable `cards[]` in order, each a block of its fields and
body, with an add affordance between blocks. Reading and editing move top-to-bottom
down one column; the document's structure is the page's structure.

**Complex UX, minimal UI.** The editor ships rich *behavior* and a nearly bare
*skin*. Interaction is dense — direct manipulation, the caret bridge, per-field
state — but the built-in visual opinion is thin, so a consumer restyles it to
their own brand without fighting baked-in design. Concretely, the direction is:
structure and behavior in the primitives (leaning on bits-ui's headless base),
appearance addressed through a themeable surface — CSS custom properties and
semantic hooks — with the package's own styles a neutral, overridable baseline.
The exact theming contract is open (§Open).

## Pattern vocabulary

The patterns in scope, named neutrally as carry-forward candidates — how each is
built and how far its web-app form survives is for later:

- **Card stack** — the vertical blocks: `main` (typically headerless) and titled
  composable cards, each with a header, its field list, and its body.
- **Card controls** — reorder, delete, and per-instance rename on a card. A drag
  handle is the current lean for reorder; not locked.
- **Add-card affordance** — an insertion point between blocks that chooses a card
  kind and adds a seeded card.
- **Field form** — the schema's fields as controls (inputs, selects, toggles,
  repeaters), grouped and laid out from `ui` hints.
- **Prose leaf** — the body and each rich field as an inline WYSIWYG surface.
- **Per-field state** — the visual language for a field's condition: focus,
  inline diagnostics, a ghosted `default:`, `example:` guidance, a `must_fill`
  nudge.
- **Formatting chrome** — the selection-time affordance for marks (bold, link, …)
  and structural commands.
- **Table / island controls** — the affordances for editing a table or other
  island within a prose leaf.
- **Editor↔preview bridge** — click a spot in the preview to focus the matching
  field/caret; highlight a field's box when it is active; scroll one to the other.
- **Split shell** — the editor|preview arrangement and its responsive/mobile form
  (mostly the consumer's; here for completeness).

## Open

Deferred to later discussion — recorded so the sketch stays honest about what it
hasn't decided:

- **Reorder affordance** — drag handle (current lean), up/down controls, or both;
  keyboard and touch behavior.
- **Formatting UI** — floating selection popover, a persistent toolbar, an inline
  affordance, or a mix by input modality.
- **Guidance / onboarding** — whether to keep a tips surface, rely on per-field
  `example`/`must_fill` alone, or something else.
- **Layout density** — how strongly `ui.group`/`ui.compact` dictate columns vs. a
  uniform single-column-first policy that treats hints as soft input.
- **Source view** — debug-only (per [ARCHITECTURE.md](ARCHITECTURE.md)) or a real
  dual rich/source mode.
- **Coupling strength** — scroll-sync editor↔preview, or click-to-focus plus
  active-field highlight only.
- **Theming contract** — the exact themeable surface (custom-property names, class
  vs. part hooks, what is overridable) that delivers "minimal, tunable UI".
