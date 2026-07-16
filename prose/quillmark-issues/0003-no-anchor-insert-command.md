# The codec has no "add an anchor at this selection" command

**Package:** `@quillmark/editor` internal (the codec, `src/lib/core/codec/`)
**Severity:** friction (worked around downstream by disabling the affordance)
**Filed by:** @quillmark/editor Phase 4b (the formatting selection popover)

## What

The formatting selection popover (VISUAL_EDITOR_UIUX §Formatting) lists seven
buttons over a selection: the six formatting marks (`strong`/`emph`/`underline`/
`strike`/`code`/`link`) plus `anchor` identity. The six formatting marks toggle
through `toggleMark(view.state.schema.marks[name])(state, dispatch)` — an
ordinary PM command the codec's `dispatchTransaction` (`field.ts`) already lowers
to `markOps` via `lower()`/lower's mark diff.

`anchor` cannot follow the same path. Per `marks.ts`, an anchor is NOT a PM mark
at all — it is modeled as a **decoration**, seeded once at `createField` time
from `anchorsFromRichText(rt)` and threaded through `StepMap`s by the field's
`anchorPlugin`. There is no PM command that *creates* a new anchor decoration at
an arbitrary selection from outside `field.ts` — the plugin only maps EXISTING
anchor positions through edits, it has no "insert one here" verb, and no
`FieldController` method exposes one either (`setCaret` / `applyExternal` /
`focus` / `getCorpus` / `destroy` — nothing selection-scoped).

## Why it matters

A user selecting text and clicking "anchor" in the popover is the natural way to
stamp an identity mark at that range (e.g. a cross-reference target). Without a
codec seam, the popover cannot do this without reaching into `field.ts` — which
Phase 4b's mandate explicitly keeps read-only (`src/lib/core/**`), correctly:
inventing an ad hoc anchor-insertion path in the chrome layer would duplicate the
plugin's own position bookkeeping and risk drifting from the `StepMap` mapping
`field.ts` already owns.

## Workaround in use

The popover renders the `anchor` button (so the seven-mark vocabulary is visibly
complete, per VISUAL_EDITOR_UIUX §Formatting) but ships it **disabled**, with a
`title` pointing at this note. The six formatting marks are fully wired; anchor
insertion is deferred.

## Requested fix

A small addition to `FieldController` (or a new `createField` option) — e.g.
`insertAnchor(id: string, pos: number): void` — that adds a new entry to the
plugin's anchor-position `Plugin<AnchorPos[]>` state at the given PM position and
folds it into the next commit's `newAnchors` set (`readAnchorsUsv`), so it lowers
through the existing mark-diff/`markOps` path the same way a toggled formatting
mark does. The id-minting policy (caller-supplied vs. codec-generated) is an open
question the fix should settle.
