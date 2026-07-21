# prose/

Long-form project documentation, in tiers by maturity:

- **`canon/`** — canonical documentation: settled, high-level captures of the
  package's systems and intent. Describes *what is* and points into the code.
  Start at [`canon/INDEX.md`](canon/INDEX.md).
- **`designs/`** — in-flight design docs: proposed direction and open questions,
  not yet settled. Promoted into `canon/` once implemented and stable.
- **`phases/`** — the sequenced, high-level implementation plan that turns the
  settled designs into shipped code: one direction brief per phase. Start at
  [`phases/INDEX.md`](phases/INDEX.md).

Phases 1–5 have shipped; the V1 surfaces are described in `canon/`, with deferred
work named in `designs/`.
