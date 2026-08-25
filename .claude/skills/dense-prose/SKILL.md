---
name: dense-prose
description: Write comments and docs at high semantic density: most comments should not exist, and the ones that do are terse, present-tense, and unsold. Use when writing or reviewing code comments, prose/canon/, or any doc, or when a comment restates the code or narrates change ("used to", "no longer", "renamed", "as of 0.x") instead of stating what is.
---

## The measure

Density is facts per word, and the default word count is zero. A comment exists only where it states a fact the reader cannot get faster from the code; what survives says it in the fewest words that stay correct.

**Wrong is worse than missing.** Only true facts count: an unsaid fact costs a lookup, a wrong one is believed. Bloat and rot are one material — claims that outran verification: the sentence nobody checked, the hand-kept list, the copied number. Verify against the code or leave it unsaid; uncertainty licenses a claim no more than it licenses a cut that shifts one. Delete freely, rewrite reluctantly: a line already carrying its fact is churn-bait, not work.

This skill owns comment and doc *content*. Canon *structure* — a title, an `> **Implementation**:` anchor naming folders or modules, a `## TL;DR`, one concept per page — is convention the existing pages carry, defended in review rather than gated.

## 1. Most comments should not exist

The code is the primary documentation. Write none by default; keep one only where deleting it costs the reader a fact.

- **Echo** (`// increment i`): delete, and let a clearer identifier carry it.
- **Hand-list**: a header enumerating the module's public items rots, and the tooling already lists them — describe the module's job instead.
- **Census**: a count of what another file declares ("three Enter cases", "five members") rots the moment the declaration gains one, and the diff that adds it never touches the sentence — say what the set is about and leave the number to the declaration. A count whose members are named in the same breath is review's.
- **Copy**: a fact with a home elsewhere gets a cross-reference, since copied twice it drifts.
- **Scaffolding**: the padding around the one real paragraph and one runnable example; "see X for comprehensive coverage".
- **Earned**: the invariant, the constraint enforced in another file, the reason a plainly readable line is the way it is. Length tracks surprise — the unobvious gets the words, the obvious gets none.

## 2. No sell

Cut praise (*powerful, seamless, battle-tested*) and ease (*simply, easily*); state the capability plainly: "Partial documents are first-class citizens" → "A document need not be complete." The word is not the violation, the sell is: keep *just / simply / only* when load-bearing.

## 3. Present tense: what is, not how it got here

Narration ("we used to X, now Y") makes the reader reconstruct history to learn the present, then ages badly. Triage every mention of the past:

1. **Pure narration**: delete or restate. "used to X, now Y" → assert Y; "as of 0.x" → the current rule, no version; a regression-test comment states the invariant guarded, not the bug.
2. **Current behavior in costume**: keep the fact, drop the framing. "No longer / previously / formerly Z" → "is not Z", or drop. A still-accepted compat alias *is* current behavior: "still accepted but no longer canonical" → "also accepted as a non-canonical alias."
3. **Legacy load-bearing for the present**: keep. When the old pattern is required to read the current one — a versioned envelope whose job is decoding stored old formats — the history is the documentation.

Caution: `used to` often means "used **in order to**"; read before cutting.

## 4. The design, not the deliberation

Keep the resulting fact, and the rationale where it explains a present choice; drop the "we tried / earlier draft / deferred" framing. "Investigated as a spike but deferred; not needed" → "Not supported; nothing requires it." Issue and PR numbers (`(#293)`, `tracked in #736`) claim work is in motion, which settled prose does not carry, and they date the sentence around them: state the shape, drop the number.

## 5. Compress what survives

- **Losable test**: cut any sentence whose removal costs no fact.
- **No throat-clearing**: no "Note that", and no first line restating its own heading.
- **No empty hedges**: hedge only where the uncertainty is real and calibrated.
- **Fold, don't append**: a second sentence qualifying the first becomes a clause of it.
- **Name the thing**: the specific noun beats a category plus an example; the measured number beats a vague *several*.
- **Compression is not density**: one claim per sentence. A bullet needing three clauses is three bullets or a nested list; a set of per-case rules is a table, and a table row is a record, not a sentence.

## Voice

Lead with the invariant or contract, then the mechanism; reuse the codebase's terms-of-art rather than inventing a synonym for a thing already named. A paragraph is one line: a line break in markdown means a new paragraph, list item, or table row, never a wrap at a column. Comments wrap to the code's line budget.

## Scope

| Surface | Rule |
|---|---|
| Code and test comments, `packages/*/prose/canon/`, package READMEs | Apply in full. |
| Era-stamped records (`packages/*/CHANGELOG.md`) | **Repair only.** Fix what was wrong when written; leave what was right in its era's vocabulary. |
| Identifiers (fn / test / var names) | Never rename: churn. |

## Workflow

Sweep for sells; history markers (`used to`, `no longer`, `previously`, `formerly`, `as of`, `removed in`, `renamed`, `we switched`, `legacy`, `deprecated`); deliberation markers (`spike`, `deferred`, `considered`, `for now`, `eventually`, `we tried`); status markers (`#\d+`, issue and PR links); censuses (a number word or digit before a plural another file declares). Each hit is a violation or a load-bearing fact in costume. Rewrite in place — a comment contradicting the code gets fixed, not deleted — then confirm no test asserted the old wording. `npm run check:docs` catches a renamed heading stranding its references; the whole gate is `npm run gate`.
