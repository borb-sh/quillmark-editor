# Quillmark Editor Designs

In-flight design docs — proposed direction and open questions, not yet settled.
The V1 surfaces have shipped and their designs are promoted to
[`canon/`](../canon/INDEX.md); what remains here is the work deferred past V1,
named but not yet designed.

No design docs are open right now. The deferred surfaces, each named in the canon
that borders it:

- **Insert surface (post-V1)** — the position anchor the formatting split leaves a
  place for: a gutter insert affordance, its menu, a slash command, and table /
  island authoring (canon VISUAL_EDITOR_UIUX §Open, §Formatting). Editing a table
  already present in an imported document is a separate concern, not gated by this.
- **`/form` metadata subpath** — the reserved schema-driven metadata form as its
  own subpath (canon ARCHITECTURE §Packaging).
- **Broad theming system** — semantic scales, class-vs-part hooks, and dark mode
  over the shipped `--qm-*` baseline (canon VISUAL_EDITOR_UIUX §Open;
  [`THEMING.md`](../../THEMING.md)).
- **Cross-leaf coordination** — a structural keymap over `activeAddr` and a
  document-level undo spanning a structural op plus a prose edit (canon
  VISUAL_EDITOR §"Settled and deferred").

A doc lands here when one of these is picked up, and moves to `canon/` once it
ships.
