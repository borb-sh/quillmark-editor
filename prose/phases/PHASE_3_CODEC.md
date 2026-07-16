# Phase 3 — Codec

**Goal:** the bidirectional codec between **one** corpus field (`RichText`) and
**one** ProseMirror document — decode (corpus → PM), transaction lowering (PM → a
`ChangeBundle` for `applyChange`), and the USV↔PM position map that carries the
caret. This is the correctness core of the whole editor; it is where the prior
art accreted its weight, so it earns the heaviest test coverage.

**Implements:** [CODEC](../designs/CODEC.md).

**Depends on:** Phase 1. **Independent of Phase 2** — runs in parallel with
Preview. **Unblocks Phase 4.**

## In scope — one field, one PM doc

- **Decode.** Fold the flat `RichText` (`text` + `lines` + `marks` + `islands`)
  into a PM tree: group lines by shared `containers`, join `continues` runs,
  select the block node by `LineKind`, apply marks over their ranges, lower island
  slots to PM leaf nodes.
- **Encode (lowering).** Lower each PM transaction to `ChangeBundle { delta?,
  lineOps?, markOps? }` in `applyChange`'s application order (delta → lineOps →
  markOps, ranges in post-delta coordinates) and call `doc.applyChange(addr,
  bundle)`. Op-based, so identity anchors rebase — **not** an `install` re-write.
- **Position map.** `corpusToPM` / `pmToCorpus`, walking the line structure,
  rebuilt on structural change — **UTF-16-safe** (JS/PM offsets are UTF-16, corpus
  offsets are USV). This is the function `CorpusHit.pos` and `FieldRegion.span`
  pass through to reach a PM caret, and its inverse feeds the preview overlay.
- **Marks.** Two algebra classes to two mechanisms: **formatting**
  (`strong`/`emph`/`underline`/`strike`/`code`/`link`) ↔ PM marks; **identity**
  (`anchor{id}`, zero-width) ↔ PM decorations lowered to `anchor` mark ops;
  **unknown** (`{tag, attrs}`) ↔ an inert round-trip-preserving PM mark.
- **Islands.** One `U+FFFC` slot + one `Island` ↔ one PM leaf node (block or
  inline by the slot's line), id preserved; typed props for known types
  (`table`, `image`), opaque otherwise.
- **Inline mode.** A constrained PM schema (one textblock, no block split, Enter
  suppressed) for `richtext(inline)` and `plaintext` (marks/islands stripped).
- **Markdown edges.** Paste (`rebase` → splice the delta), copy
  (`exportMarkdown`, lossy — warn before dropping identity), debug source
  (`toMarkdown`, read-only). Markdown is never the edit representation.
- **Reconciliation.** Re-hydrate a field only on an **external** corpus change,
  gated by canonical-corpus equality scoped to that field.

## Out of scope

The multi-field composition, card operations, focus (Phase 4); geometry and the
preview half of the caret bridge (Phase 2); the document model and mutators
(quillmark).

## The flow

```
decode:  RichText ──(fold lines, apply marks, lower islands)──► PM doc
edit:    PM transaction ──(lower steps)──► ChangeBundle ──► doc.applyChange(addr, bundle)
caret:   CorpusHit.pos / FieldRegion.span ──corpusToPM──► PM caret
                                    PM caret ──pmToCorpus──► preview focus
```

## Settled decisions

These settle the design's own open questions:

- **The PM node/mark schema and the input-rule set.** The node/mark schema is
  defined **here** — it is what decode/lower target; the input-rule set (`**`,
  `#`, `- `, `1. `, `> `, table entry) ships as a plugin the VisualEditor
  mounts. The codec owns the schema, Phase 4 owns which rules are on.
- **Anchors.** Decorations, per the design; revisit only if comment-thread UX
  wants them in the document proper.
- **The `install` fallback boundary.** Lowering-only plus a narrow, explicit
  paste fallback (`install(addr, rt)` pays that field's anchors); widen only
  against a real failing transaction.
- **Island props typing.** The codec owns local table/image prop schemas for
  V1; the candidate upstream typed-island surface stays noted, not a blocker.

## Exit criteria

- A standalone prose leaf (built on the Phase 1 core seam, no VisualEditor) edits a
  real `usaf_memo` field — the `subject` inline richtext and the body — via
  `applyChange`; the caret survives own-edits through the PM `StepMap`.
- **Round-trip property tests (Vitest):** `decode` then re-`decode`-after-normalize
  agree; `lower` then apply then `decode` matches the optimistic PM state up to
  corpus normalization; the position map holds across astral characters and
  structural edits.
- Formatting, identity anchors, unknown marks, and one island type each survive a
  round-trip; inline/plaintext constraints hold.
- The external-change reconciliation gate re-hydrates on a foreign edit and does
  **not** on the leaf's own edits.

## New dependencies

The ProseMirror stack — `prosemirror-model` / `-state` / `-view` / `-transform` /
`-commands` / `-history` / `-inputrules` / `-keymap` / `-schema-list`. (Tables land
with Phase 4.) Pinned.

## Risks / watch-items

- The UTF-16↔USV conversion is the highest-value, easiest-to-get-wrong seam — a
  skipped conversion drifts one unit per astral char. Property-test it first.
- `applyChange` throws on an op that applies out of bounds and leaves the value
  unchanged; the lowering must produce in-bounds post-delta coordinates or the edit
  silently no-ops from the user's view.
- Corpus normalization means round-trips are idempotent *only up to normalize* —
  tests must assert post-normalize equality, not byte equality.
