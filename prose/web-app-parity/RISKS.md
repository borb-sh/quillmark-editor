# Risk register — remaining scheduled work

What could invalidate the plan for each open issue, what is retired and by what
evidence, and how the rest is answered. Probed against the installed boundary and
a green suite (180 tests), not inferred from issue bodies. Nothing here is left
as a proposal — each live risk carries a settled mitigation, so an issue starts
by implementing rather than deciding.

| Issue | Risk | State |
|---|---|---|
| 74 | Rungs unreachable in `preview/` + `source/` | Retired — one derivation in `core/`, set on four roots |
| 71 | Clearing tips destroys card titles | Retired — merge-write shipped, hazard tested |
| 57 | Needs a WASM undo primitive | Retired — `toJson` / `loadJson` / `clone` |
| 70 | Codec loses nesting on indent/outdent | Retired — 8 shapes round-trip, now tested |
| 76 | Styled variants owe a11y from scratch | Retired — bits-ui covers the three UA-owned kinds |
| 16 | Island authoring unscoped | Open by design; the tail |

## #74 — the settled design breaks on two surfaces

**Risk, live.** The `74-76` note has flat tokens defaulting to their rung
(`--qm-page-bg: var(--_qm-surface)`). The private scale is minted in exactly two
places — `VisualEditor.svelte` (13 declarations) and `FormatPopover.svelte` (6) —
and **`preview/` and `source/` consume only public `--qm-*`; neither sees a
`--_qm-*`**. Preview is not a descendant of the editor's root element, so it
inherits nothing. Under the design as written, `--_qm-surface` resolves to
nothing there and the page loses its background.

That lands on the worst possible surface: `--qm-page-bg` and `--qm-page-shadow`
are the painted page (`preview/paint.ts:76-77`) — a white page under a black
shadow is the most conspicuous thing on screen. Dark mode would ship visibly
broken exactly where a viewer looks first.

**Why the obvious fixes don't apply.** The package ships **no CSS files** — every
style is a scoped Svelte `<style>`. `/preview` imports no editor-side code, so it
cannot reach a block owned by `visual/`. `core/` is the one module both already
import, but it is pure logic and carries no styling today.

**Retired — one derivation, four call sites.** Duplicating the block across four
roots and asserting the copies byte-identical was the answer while the derivation
had to live in a `<style>` block; it is one prettier reflow from a false failure.
`core/` is the module both `preview/` and `visual/` already import and it can hold
the derivation as a plain declaration STRING, which each root sets as a `style`
attribute — one copy, no CSS file, and the emitted `var(--qm-…)` references still
resolve through the cascade at each root, so a consumer's ancestor rule and
`prefers-color-scheme` work with no JS. A `style` attribute rather than an action:
an action runs at hydration, so an SSR'd first paint would resolve no rungs.
`check:theme` rule 3 asserts `core/theme.ts` is the only definer, which subsumes
`check-geometry`'s mint rule for all three axes.

## #57 — the boundary ask is unnecessary

**Retired.** The open question was whether document-level history forces a
`Document`/`DocumentWriter` primitive — an upstream ask with its own lead time.
It does not. The published boundary already carries the whole mechanism:

| Verb | Property that matters |
|---|---|
| `toJson(): string` | **Byte-deterministic** within a schema version — equal documents give byte-equal output, so snapshot equality is a cheap no-op check. |
| `loadJson(json): void` | Reconstructs **in place** — "update a live handle … without the caller re-binding its variable". Restore invalidates no reference and remounts nothing. |
| `clone(): Document` | A cheaper snapshot path if whole-document JSON proves heavy. |

`loadJson` also throws leaving the document unchanged on an invalid DTO, so a
failed restore cannot corrupt state. No undo/redo/history verb exists — and none
is needed.

**What is left is #57's own design, not a risk to it:** snapshot granularity (a
whole-document snapshot per structural op — coarse but correct, and fine at memo
scale) and how a structural stack interleaves with the per-leaf PM histories so
Ctrl-Z keeps one meaning. Both are editor-side and settle when #57 is taken up;
neither can invalidate the approach the way a missing primitive would have.

**Settled — #57 stays last in the chain.** It sat there partly for boundary lead
time, and that reason is gone. It stays on file contention alone: it rewrites the
structure mutators #71 and #76 build on, so going earlier means the other two
rebase onto a moved floor. The position is unchanged; only its justification is.

## #70 — retired empirically

Nesting was *decodable* (one two-level case in the existing suite), but
indent/outdent only works if the shapes it produces **round-trip**. Eight now do,
locked in `tests/codec/list-shapes.test.ts`: three-level bullets, ordered-in-
bullet and bullet-in-ordered, multi-paragraph items, an item carrying a nested
list plus a trailing paragraph, sibling splits from outdenting a middle item,
ordinal resets, and a deep mixed shape. All pass unchanged.

The codec needs no work for #70.

**Settled — Tab precedence.** In a list item, `Tab`/`Shift-Tab` indent and
outdent; everywhere else Tab is unbound and stays available to the deferred
structural keymap. The list binding returns false when the selection is not in a
list, so ProseMirror falls through — the later field-navigation Tab layers over
it without either side knowing about the other, which is what keeps #70 additive.

## #71 — a namespace hazard that destroys card titles

**Placement fork unblocked.** `getExtNamespace(addr: CardAddr, ns)` documents
`addr` absent as main, so `$ext` on `main` and per-card are both expressible.

**Hazard, live.** `removeExtNamespace` exists and is the natural-looking verb for
"dismissing the last tip clears the channel". It is the wrong one: `tips` is a
**sibling key of `title`** inside the same `editor` namespace, and card rename
stores `$ext.editor.title` there (`VisualEditor.svelte:269`). Removing the
namespace silently destroys every renamed card's title.

**Retired — and structurally, not by convention.** Dismissal patches the `editor`
namespace: read, drop the `tips` key, store the remainder. `removeExtNamespace` is
not used for tips at any point. The merge lives in ONE verb — `patchEditorExt`
(`visual/ext.ts`) — that the rename, the dismissal, and a consumer seeding the
namespace all call, so a writer cannot express the destroying shape by copying the
wrong pattern, and key N+1 inherits the rule.

The write semantics the mitigation rests on were probed against 0.97.0 rather than
inferred: `storeExtNamespace` **replaces** the namespace it targets — storing the
remainder is therefore what clears the channel, not a no-op merge — while
preserving sibling namespaces, so another consumer's `$ext` slot is not collateral.
`doc.main.ext` / `doc.cards[i].ext` expose the whole `$ext` map, which is why the
derive's read needs no boundary call of its own. Guarded at both tiers, and against
the shipped function rather than a restatement of it: `tests/visual/tips.test.ts`
calls `patchEditorExt` and asserts the surviving title on the main *and* card
addresses, and `e2e/visual.spec.ts` (m) proves it through the real chrome — this
fails silently and only on documents carrying both keys.

## #76 — retired

`bits-ui@2.18.1` is already installed and ships `Switch`, `Checkbox`, `Select`,
`DatePicker`, `DateField`, and `Combobox`. It ships **no** text or number
primitive — correctly, since those natives are fully styleable and there is no
ARIA pattern to supply. So the styled path covers `enum`, `boolean`, and `date`
(the kinds whose faces are UA-owned shadow DOM) and leaves `text`/`number` native;
it costs no new dependency and inherits each primitive's a11y.

**Costs.** The primitive speaks `CalendarDate`
(`@internationalized/date`, promoted from a transitive dep to a direct one) while
the document speaks `YYYY-MM-DD`; `CalendarDate` carries no time and no zone, so
the round-trip is lossless. Two hazards only the browser tier sees: bits reports a
DESELECT as `''`, indistinguishable from picking the empty-string enum member the
reference quill declares — `allowDeselect={false}` is what keeps the UNSET
sentinel the only clear affordance; and every primitive is driven CONTROLLED
(`value` + `onValueChange`, never `bind:`), because a two-way bind hands it a lane
around `syncedLocal`.

**Residual:** the `syncedLocal` contract — a slot handing out a raw `value`
reintroduces the #48 caret reset in consumer code. Slots stay deferred, so this is
recorded rather than live.

## #16 — unchanged; the largest unknown

Confirmed entirely unstarted: no `CellSelection` or table import anywhere in
`src/`. Islands exist as codec atoms (`island_block` / `island_inline` node
specs) with id-preserving round-trip coverage, so the *representation* is settled
and only authoring is missing. `prosemirror-tables` would have to be re-added —
it is no longer a dependency. Appropriate as the tail.

## Environment

A fresh container starts with **no `node_modules`**, and `vitest` fails to
transform every file until `svelte-kit sync` generates `.svelte-kit/tsconfig.json`
(`tsconfig.json` extends it). Install, then sync, then test. `npm run lint` is
prettier over the repo including markdown; it reports a missing
`prettier-plugin-svelte` rather than a formatting result when dependencies are
absent.
