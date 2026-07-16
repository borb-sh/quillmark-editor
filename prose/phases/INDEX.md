# Implementation Phases

Scope: the sequenced, high-level plan for building `@quillmark/editor` from the
settled [designs](../designs/INDEX.md). Each phase doc is a **direction brief for
a SWE team** — goal, scope boundary, the data-flow shape, the decisions it forces,
and verifiable exit criteria. It is deliberately **flow-level, not implementation
detail**: it says what a phase delivers and how the pieces connect, not how to
write them. The designs own the *what*; these own the *order and the seams*.

## The spine

Phase 0 (preflight tooling for `@quillmark/wasm` 0.94.0) is already merged. The
build proper is five phases:

```
        ┌────────────────────────────────────────────────┐
        │  Phase 1 — Substrate & packaging                │
        │  (WASM lifecycle, subpath exports, fixtures,    │
        │   Engine wiring, build + test tooling)          │
        └───────────────┬───────────────┬────────────────┘
                        │               │
          ┌─────────────▼──┐   ┌────────▼──────────────┐
          │ Phase 2        │   │ Phase 3               │
          │ Preview        │   │ Codec                 │
          │ (LiveSession   │   │ (corpus ↔ ProseMirror,│
          │  paint loop)   │   │  the correctness core)│
          └─────────────┬──┘   └────────┬──────────────┘
                        │               │
                        │      ┌────────▼──────────────┐
                        │      │ Phase 4               │
                        │      │ VisualEditor          │
                        │      │ (federated field tree)│
                        │      └────────┬──────────────┘
                        │               │
                     ┌──▼───────────────▼──┐
                     │ Phase 5             │
                     │ Integration, bridges │
                     │ & hardening          │
                     └──────────────────────┘
```

**Phases 2 (Preview) and 3 (Codec) are independent** once Phase 1 lands — Preview
wraps `LiveSession` and needs no ProseMirror; Codec is pure corpus↔PM and needs no
canvas. They can land in either order. Phase 4 needs the Codec; Phase 5 needs
everything.

| Phase | Doc | Implements (design) |
| --- | --- | --- |
| 1 | [PHASE_1_SUBSTRATE.md](PHASE_1_SUBSTRATE.md) | [ARCHITECTURE](../designs/ARCHITECTURE.md), [DOCUMENT_MODEL](../designs/DOCUMENT_MODEL.md) |
| 2 | [PHASE_2_PREVIEW.md](PHASE_2_PREVIEW.md) | [PREVIEW](../designs/PREVIEW.md) |
| 3 | [PHASE_3_CODEC.md](PHASE_3_CODEC.md) | [CODEC](../designs/CODEC.md) |
| 4 | [PHASE_4_VISUAL_EDITOR.md](PHASE_4_VISUAL_EDITOR.md) | [VISUAL_EDITOR](../designs/VISUAL_EDITOR.md), [VISUAL_EDITOR_UIUX](../designs/VISUAL_EDITOR_UIUX.md) |
| 5 | [PHASE_5_INTEGRATION.md](PHASE_5_INTEGRATION.md) | [ARCHITECTURE](../designs/ARCHITECTURE.md) (playground, public API) |

## Why this order

Phase 1 front-loads the riskiest integration — the WASM boundary, the canvas seam,
and the packaging — behind the smallest possible surface, so Phases 2–4 build on
proven ground. Phase 2 (Preview) is sequenced next because it is the most
self-contained headline surface and turns the substrate into a **running, visible
artifact** at the earliest point: seed the reference quill → paint it. Codec and
VisualEditor are the deeper build; they land against a substrate and a preview that
already work.

**The Phase 1 + Phase 2 pair is the vertical slice** — scaffold, WASM lifecycle,
and a live paint of a real document — that de-risks everything downstream.

## Cross-cutting policies

- **Dependencies, added per phase.** Only `@quillmark/wasm` + `bits-ui` are
  installed today. New deps land pinned, in the phase that first needs them: the
  ProseMirror stack in Phase 3, `prosemirror-tables` in Phase 4, CodeMirror (debug
  source view) and any theming tokens in Phase 5, **Vitest** in Phase 1. No
  speculative additions.
- **Testing has two tiers.** Pure/core logic — the codec above all — is
  Vitest-covered, including round-trip and position-map property tests. What unit
  tests cannot reach (canvas paint, scroll virtualization, DPR, the click
  round-trip) is exercised in the **playground**, the harness the architecture
  already calls for — driven in a real browser, headless included; scripted
  browser checks stand in for a human pass. `svelte-check` + `prettier` stay CI
  gates.
- **One reference quill.** All development and manual verification run against
  [`fixtures/quills/usaf_memo/0.2.0`](../../fixtures/quills/usaf_memo/0.2.0) — a
  real Typst quill that exercises every field type (`array`, inline `richtext`,
  `string`, `enum`, `number`, `datetime`, `array`-of-`richtext`), a composable
  `indorsement` card kind, `ui.groups` sectioning, and `compact` layout. It is a
  dev fixture only — it lives outside `src/lib`, so it is never published.
- **Public API discipline.** The playground consumes **only** the public subpath
  API; a needed internal is an API gap to fix, not a reach-in. This is how each
  phase proves its seams are clean.
- **Open questions are decisions, not guesses.** Each phase names the design
  open-questions it settles and records the **settled decision** (Phases 1–4 are
  ratified; Phase 5's carry recommended defaults until it starts). The
  implementer follows them; a deviation forced by implementation reality is
  recorded in the phase doc, not silently taken. Items the designs defer past V1
  (the insert surface / table authoring, the full theming contract) stay deferred
  and are named where they land.

The [DOCUMENT_MODEL](../designs/DOCUMENT_MODEL.md) ledger is the single home for the
`@quillmark/wasm` boundary; each phase carries only the one or two boundary details
it consumes, where it consumes them. The 0.94.0 surface was verified against the
ledger and matches; the two typing seams it carries (`Island.props: unknown`,
`QuillCardUi` narrower than the schema JSON) are recorded in the ledger's
stability seams.
