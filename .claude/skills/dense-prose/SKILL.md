---
name: dense-prose
description: Write comments and docs at high semantic density: terse, present-tense, unsold, mostly self-documenting. Use when writing or reviewing code comments, prose/canon/, or any doc for density and house voice, or when comments narrate change ("used to", "no longer", "renamed", "as of 0.x") instead of stating what is.
---

## The measure

Density is facts per word. A comment or doc earns its bytes by stating a fact the reader cannot get faster from the code, in the fewest words that stay correct. Cut words carrying no fact: the sell, the echo, the history, the deliberation (rules 1–4). Pack more fact into what survives (rule 5).

This skill owns comment and doc *content*. Canon *structure* — a title, an `> **Implementation**:` anchor naming folders or modules, a `## TL;DR`, one concept per page — is convention the existing pages carry; nothing gates it, so a departure is defended in review, not blocked.

## Prime directive: wrong is worse than missing

Density has a numerator, and only true facts count toward it. An unsaid fact costs the reader a lookup; a wrong one is believed. Bloat and rot are both made of claims that outran verification: the sentence nobody checked, the hand-kept list, the copied number. A claim is verified against the code or left unsaid.

The bar cuts both ways: a cut that drops a fact, or shifts a claim unverified against the code, is dilution, not compression. Uncertainty licenses a cut no more than it licenses a claim. Touch a line only when it breaks a rule; over-editing is the main failure mode.

## 1. No marketing or persuasion

A sell spends words on the reader's opinion instead of their knowledge. Cut praise (*powerful, seamless, battle-tested*) and ease (*simply, easily*); state the capability plainly: "Partial documents are first-class citizens" → "A document need not be complete." The word is not the violation, the sell is: keep *just / simply / only* when load-bearing ("just sugar for the `raw` element", "three or more tildes").

## 2. Self-documenting first

The code is the primary documentation; a comment restating it is noise.

- Delete echoes (`// increment i`; `/** The name */` on a field named `name`); a clearer name beats the comment.
- Collapse padded scaffolding to one tight paragraph and one runnable example; "see X for comprehensive coverage" is filler.
- Never enumerate a module's public items in its header; the tooling lists them and the hand-list rots. Describe the module's job.
- One fact, one home: cross-reference rather than restate, since a fact copied twice drifts.

## 3. Present tense: what is, not how it got here

Evolutionary narration ("we used to X, now Y") makes the reader reconstruct history to learn the present, then ages badly. Triage every mention of the past:

1. **Pure narration: delete or restate.** "used to X, now Y" → assert Y; "as of 0.x / removed in 0.x" → state the current rule, no version; a regression-test comment states the invariant guarded ("X must not happen; would cause Y"), not the bug's history.
2. **Current behavior in a historical costume: keep the fact, drop the framing.** "No longer / previously / formerly Z" → "is not Z", or drop. A still-accepted compat alias *is* current behavior: "the legacy `~~~card-yaml` opener is still accepted but no longer canonical" → "`~~~card-yaml` is also accepted as a non-canonical alias."
3. **Legacy load-bearing for the present: keep.** When the old pattern is required to read the current one (a versioned envelope whose job is decoding stored old formats), the history is the documentation.

Caution: `used to` often means "used **in order to**"; read before cutting.

## 4. State the design, not the deliberation

Cut spike/deferred/rejected narration; keep the resulting fact, plus the rationale when it explains a present choice, minus the "we tried / earlier draft" framing.

- "Investigated as a spike but deferred; not needed" → "Not supported; the preview does not require it."
- Rejected-alternative rationale keeps the *why*, sheds the *when*: "A sub-handle would be justified only if paint shipped with `click()`."
- Issue and PR numbers (`(#293)`, `tracked in #736`) are status markers: they say work is in motion, which settled prose does not carry, and they date the sentence around them. State the shape instead ("quillkit resolves the loader from the collection and carries none") and drop the number.

## 5. Compress what survives

- **Losable test**: cut any sentence whose removal costs no fact. Length tracks surprise: the unobvious invariant gets the words, the obvious call gets none.
- **No throat-clearing**: no "Note that", and no first line restating the section's own heading.
- **No empty hedges**: hedge only when the uncertainty is real and calibrated.
- **Fold, don't append**: a second sentence qualifying the first becomes a clause of it.
- **Name the thing**: the specific noun beats a category plus an example; the measured number beats a vague *several*.
- **Compression is not density**: one claim per sentence, since seven clauses and three parentheticals have to be decompressed to reach the one fact the reader came for. A bullet needing three clauses is three bullets or a nested list; a set of per-case rules (per package, per format, per surface) is a table, and a table row is a record, not a sentence.

## Voice

Lead with the invariant or contract, then the mechanism. Reuse the codebase's terms-of-art (*quill, quiver, plate, seam, leaf, island, field box*). Match the density of the exemplars: `packages/svelte/src/lib/preview/paint.ts`, `packages/svelte/src/lib/core/codec/field.ts`, `packages/svelte/prose/canon/PREVIEW.md`.

A paragraph is one line: a line break in markdown means a new paragraph, list item, or table row, never a wrap at a column. Comments wrap to the code's line budget.

## Scope

| Surface | Rule |
|---|---|
| Code and test comments, `packages/*/prose/canon/`, package READMEs | Apply in full. |
| Era-stamped records (`packages/*/CHANGELOG.md`) | **Repair only.** Accurate to their moment: fix what was wrong when written, leave what was right in its era's vocabulary. |
| Identifiers (fn / test / var names) | Never rename: churn. |

## Workflow

1. **Sweep**: grep for sells; history markers (`used to`, `no longer`, `previously`, `formerly`, `as of`, `removed in`, `renamed`, `we switched`, `legacy`, `deprecated`); deliberation markers (`spike`, `deferred`, `considered`, `for now`, `eventually`, `we tried`); and status markers (`#\d+`, issue and PR links).
2. **Triage**: each hit is a violation or a load-bearing fact in costume.
3. **Rewrite in place**: present tense, minimal, fact preserved. A comment contradicting the code gets fixed, not deleted.
4. **Verify**: tests pass and none asserted the old wording; `npm run check:pointers` catches a renamed heading stranding its references. The whole gate is `npm run gate`.

## Done when

Nothing restates code, nothing outruns what was verified, no prose narrates history or deliberation, and no surviving sentence sheds a word without shedding a fact.
