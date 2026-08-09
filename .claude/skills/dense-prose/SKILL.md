---
name: dense-prose
description: Write comments and docs at high semantic density: terse, present-tense, unsold, mostly self-documenting. Use when writing or reviewing code comments, prose/canon/, or any doc for density and house voice, or when comments narrate change ("used to", "no longer", "renamed", "as of 0.x") instead of stating what is.
---

## The measure

Density is facts per word. Cut words that carry no fact: the sell, the echo, the history, the deliberation (rules 1–4). Pack more fact into what survives (rule 5). A comment or doc earns its bytes when it states a fact the reader cannot get faster from the code, in the fewest words that stay correct.

This skill is the house voice (dense, present-tense, declarative, unsold) and owns comment and doc *content*. Canon *structure* — a title, an `> **Implementation**:` anchor naming folders or modules, a `## TL;DR`, one concept per page — is convention the existing pages carry; nothing gates it, so a page departs from it by being written that way and defends the departure in review.

## Prime directive: wrong is worse than missing

Density has a numerator, and only true facts count toward it. Something left unsaid is better than something said wrong: an unsaid fact costs the reader a lookup; a wrong one is believed. Bloat and rot are both made of claims that outran verification: the sentence nobody checked, the hand-kept list, the copied number. A claim is verified against the code or left unsaid.

The bar cuts both ways. A cut that drops a fact, or shifts a claim unverified against the code, is dilution, not compression. Unsure a statement still holds? Verify, or leave it: uncertainty licenses a cut no more than it licenses a claim. Edits are surgical: touch a line only when it breaks a rule. Prose already dense and correct is done; over-editing is the main failure mode.

## 1. No marketing or persuasion

A sell spends words on the reader's opinion instead of their knowledge. Cut praise (*powerful, seamless, battle-tested*) and ease (*simply, easily*) when they only sell. State the capability plainly: "Partial documents are first-class citizens" → "A document need not be complete."

Keep *just / simply / only* when load-bearing ("just sugar for the `raw` element", "three or more tildes"). The word is not the violation; the sell is.

## 2. Self-documenting first

The code is the primary documentation; a comment restating it is noise.

- Delete echoes (`// increment i`; `/** The name */` on a field named `name`); a clearer name beats the comment.
- Collapse padded scaffolding to one tight paragraph and at most one runnable example.
- Never enumerate a module's public items in its header; the tooling lists them and the hand-list rots. Describe the module's job.
- One good example beats three; "see X for comprehensive coverage" is filler.
- One fact, one home. Cross-reference rather than restate; a fact copied twice drifts.

## 3. Present tense: what is, not how it got here

Evolutionary narration ("we used to X, now Y") makes the reader reconstruct history to learn the present, then ages badly. Triage every mention of the past:

1. **Pure narration: delete or restate.** "the heuristics that used to live here couldn't keep pace", "removed in 0.87.0", "we switched to X" carry no present-state value beyond the current description.
2. **Current behavior in a historical costume: keep the fact, drop the framing.** A still-accepted compat alias *is* current behavior: "the legacy `~~~card-yaml` opener is still accepted but no longer canonical" → "`~~~card-yaml` is also accepted as a non-canonical alias."
3. **Legacy load-bearing for the present: keep.** When the old pattern is required to read the current one (a versioned envelope whose job is decoding stored old formats), the history is the documentation.

Reframing moves: "used to X, now Y" → assert Y; "no longer / previously / formerly Z" → "is not Z", or drop; "as of 0.x / removed in 0.x" → state the current rule, no version; a regression-test comment states the invariant guarded ("X must not happen; would cause Y"), not the bug's history.

Caution: `used to` often means "used **in order to**"; read before cutting. History a reader needs to *use* the thing (an accepted alias, a tolerated input) gets reframed, not deleted.

## 4. State the design, not the deliberation

Cut spike/deferred/rejected narration; keep the resulting fact, plus the rationale when it explains a present choice, minus the "we tried / earlier draft" framing.

- "Investigated as a spike but deferred; not needed" → "Not supported; the preview does not require it."
- "X was the deferred half and stays deferred by design" → "X is not carried, by design: <reason>."
- Rejected-alternative rationale keeps the *why*, sheds the *when*: "A sub-handle would be justified only if paint shipped with `click()`."
- Issue and PR numbers (`(#293)`, `tracked in #736`) are status markers: they say work is in motion, which settled prose does not carry, and they date the sentence around them. State the shape instead ("quillkit resolves the loader from the collection and carries none") and drop the number. Unsettled work lives in the issue; a comment or doc carries none.

## 5. Compress what survives

Deleting whole sentences is half the work; the other half is more fact per word.

- **Losable test**: cut any sentence whose removal costs no fact. Length tracks surprise: the unobvious invariant gets the words, the obvious call gets none.
- **No throat-clearing**: no "Note that", and no first line restating the section's own heading.
- **No empty hedges**: hedge only when the uncertainty is real and calibrated.
- **Fold, don't append**: a second sentence qualifying the first becomes a clause of it.
- **Name the thing**: the specific noun beats a category plus an example; the measured number beats a vague *several*.
- **Compression is not density**: one claim per sentence. A sentence carrying seven clauses and three parentheticals is maximally compressed and unreadable, because the reader has to decompress it to reach the one fact they came for. A bullet needing three clauses is three bullets, a nested list, or a table; a set of per-case rules (per package, per format, per surface) is a table, and a table row is a record, not a sentence.

## Voice

Present tense. Lead with the invariant or contract, then the mechanism. Reuse the codebase's terms-of-art (*quill, quiver, plate, seam, leaf, island, field box*). Match the density of the exemplars: `packages/svelte/src/lib/preview/paint.ts`, `packages/svelte/src/lib/core/codec/field.ts`, `packages/svelte/prose/canon/PREVIEW.md`.

A paragraph is one line: never hard-wrap prose at a column. A line break in markdown means a new paragraph, list item, or table row; nothing else. Comments wrap to the code's line budget.

## Scope

| Surface | Rule |
|---|---|
| Code and test comments, `packages/*/prose/canon/`, package READMEs | Apply in full. |
| Era-stamped records (`packages/*/CHANGELOG.md`) | **Repair only.** Accurate to their moment: fix what was wrong when written, leave what was right in its era's vocabulary. |
| Identifiers (fn / test / var names) | Never rename; out of scope, churn. |

## Workflow

1. **Sweep**: grep for sells; history markers (`used to`, `no longer`, `previously`, `formerly`, `as of`, `removed in`, `renamed`, `we switched`, `legacy`, `deprecated`); deliberation markers (`spike`, `deferred`, `considered`, `for now`, `eventually`, `we tried`); and status markers (`#\d+`, issue and PR links).
2. **Triage**: each hit is a violation or a load-bearing fact in costume.
3. **Rewrite in place**: present tense, minimal, fact preserved. A comment contradicting the code gets fixed, not deleted. Identifiers stay.
4. **Verify**: tests pass; no test asserted the old wording; `npm run check:pointers` passes, since a renamed heading strands every reference to it. The whole gate is `npm run gate`.

## Done when

Comments and docs state what is, in the house voice: dense, present-tense, unsold. Nothing restates code, nothing outruns what was verified, no header carries a rotting list, no prose narrates history or deliberation, and no surviving sentence sheds a word without shedding a fact. Backward-compat facts survive as current-state statements.
