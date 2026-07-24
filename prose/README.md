# prose/

Long-form project documentation, in tiers by maturity:

- **`canon/`** — canonical documentation: settled, high-level captures of the
  package's systems and intent. Describes *what is* and points into the code.
  Start at [`canon/INDEX.md`](canon/INDEX.md).
- **`inspiration/`** — prior-art studies and source material that steer the
  editor's direction; not canon and not a plan. Start at
  [`inspiration/INDEX.md`](inspiration/INDEX.md).

Deferred and not-yet-designed work is tracked as GitHub issues, not a docs tier —
each proposal is designed fresh when scheduled, then promoted to `canon/` on ship.

V1 shipped (Phases 1–5); the surfaces are described in `canon/`, with deferred
work tracked as GitHub issues. The build-order phase briefs were retired once
implemented — their settled decisions and recorded deviations live in `canon/`.

## The canon doc spine

Every `canon/*.md` (INDEX excepted) follows one shape, so the set stays scannable
and its concept→code hooks stay honest:

```
# Title

> **Implementation**: `folder/`

## TL;DR

<what it is, then the boundary it draws against its neighbours, cross-linked>

<body…>
```

- **Title, anchor, and TL;DR are mandatory.** The `> **Implementation**:`
  blockquote is the one navigational hook from concept to code; it anchors a
  **folder or module, never a source file or line** — files move and rot (the
  pre-spine codec anchor named `positions.ts` / `reconcile.ts`, neither of which
  exists). The `## TL;DR` leads with what the doc is and draws its border against
  sibling docs.
- **Canon describes what is.** It points into the code; it does not re-document
  implementation detail the code already carries, and it never links into a plan
  tier (deferred work is tracked as GitHub issues, referenced only from indexes).
- **Enforced.** `npm run check:canon` (a CI gate) checks the shape: the anchor at
  line 3, a folder-not-file anchor, a `## TL;DR`, and no `phases/` links.

Voice follows the `dense-prose` skill (in the sibling `quillmark` checkout's
`.claude/skills/`): dense, present-tense, unsold.
