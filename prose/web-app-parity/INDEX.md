# web-app-parity — working notes

Bench notes for the `web-app-parity` branch (PR #77), which integrates the 70+
issue set. Holds the schedule, the design forks, and the open questions until
each lands; a shipped decision promotes into `canon/` and its entry here goes.
Retired with the branch.

Not a durable tier. `prose/README.md` names two (`canon/`, `inspiration/`) and
tracks deferred work as GitHub issues; these notes sit between the issue and the
canon amendment, and `npm run check:canon` does not scan them — no spine
required.

## Ledger

`web-app-parity` is the trunk. Each issue branches off it and integrates back,
never onto the default branch.

| # | Scope | Axis | Boundary | Canon | State |
|---|---|---|---|---|---|
| 73 | consumer enum-option policy hook | projection | no | — | landed |
| 72 | recovery shell for un-schemable cards | projection | no | — | landed |
| 75 | per-field guidance (required marker, description) | projection | no | amended | landed |
| 70 | list-editing commands | codec | no | no | open |
| 71 | ephemeral tips card (`$ext.editor.tips`) | projection | no | reopened + amended | landed |
| 74 | unified light/dark token surface | style | no | rewrote `THEMING.md` | landed as #79 |
| 76 | styled control variants / control-slot hooks | projection | no | amended | landed as #79 (slots deferred) |
| 57 | document-level history (card-delete undo) | projection | no | amends | open |
| 16 | island/table editing | codec + projection | maybe | no | open |

**Axis** is the file cluster a change contends for, and it drives the schedule
more than size does:

- **codec** — `src/lib/core/codec/` (`field.ts` keymap, `inputrules.ts`, `schema.ts`)
- **projection** — `src/lib/visual/` (`VisualEditor.svelte`, `Field.svelte`, `structure.ts`)
- **style** — `THEMING.md` plus the surfaces' CSS

## Landed in #77

#73, #72, #75 — chrome and projection only, no boundary change. They share a new
`FieldLabel.svelte`, un-gate the card loop, and thread an `enumOptionAllowed`
predicate through the `CardOps` bundle. Everything below stacks on that.

#71 lands on top: `tips.ts` (channel narrowing + the markdown render), a
`TipsCard.svelte` in a fixed slot after `main`, `model.tips` at the derive's root,
and `ext.ts` — the one `$ext.editor` write verb both the rename and the dismissal
go through. Canon reopened as scheduled: VISUAL_EDITOR §"Card operations" carries
the channel, VISUAL_EDITOR_UIUX gains §"Tips card", and both guidance paragraphs
are rewritten whole rather than patched around #75. Four forks settle — placement
(document-level, off `main`'s `$ext`), authoring (seed-only; the editor never adds
a tip), position (a fixed slot after `main`), and the cursor (local, so exactly one
write happens, at dismissal). No new `--qm-*` token, so #74 inherits nothing.

**`patchEditorExt` is the reusable half.** #76 and #57 both add editor-side state,
and the namespace-replacing hazard is now unexpressible rather than documented: a
new `$ext.editor` key inherits the merge. The codec also gains `renderContent`
(content → read-only DOM), the door the deferred insert surface and any ghost
preview would otherwise each re-open with a local serializer.

## Schedule

Two isolated axes run alongside one serialized chain:

```
web-app-parity (#77, trunk)
 ├─ #70  list editing         ┐ isolated axes — concurrent with the chain
 ├─ #74  theming / dark tokens┘
 └─ chain (all contend for VisualEditor / Field / structure — serialize)
      #71  tips card  →  #76  control-slot hooks  →  #57  document undo
 #16  island/table editing — tail
```

- **#70 and #74 are isolated.** #70 lives in the leaf keymap and input rules;
  #74 in tokens and CSS. Neither touches the projection layer, so both run
  concurrently with the chain and with each other.
- **#71 → #76 → #57 serialize.** All three edit the same three projection files,
  two of which #77 just rewrote. Running them concurrently buys nothing and
  costs merge conflicts on fresh code.
- **#74 gates #76's design, not its code.** The two must resolve to one
  styling-extension story (per the #74 comment), so #74's hook decision precedes
  #76's build. Their files never collide.
- **#57 last in the chain.** It rewrites the structure mutators the other two
  build on, and may carry a WASM-boundary ask that lengthens its lead time.
- **#16 is the tail.** Most deferrable; the only item that plausibly slips past
  V1.

**Ordering — settled: quick-wins-first**, as drawn. Parity-first (#74/#76 lead)
was the alternative; it front-loads the largest design surface before any easy
win lands. The isolated axes mean #74 starts concurrently regardless, so leading
with it buys little.

## Settled questions

Nothing is open. Every fork is decided and every risk either retired by evidence
or carrying a settled mitigation — per-issue in
[`74-76-styling-extension.md`](74-76-styling-extension.md) and
[`RISKS.md`](RISKS.md), cross-cutting below. Each issue starts from a decision,
not a deliberation.

- **One styling-extension story — settled.** #74's "hooks beyond tokens" and
  #76's control-slot mechanism were the same question, answered jointly in
  [`74-76-styling-extension.md`](74-76-styling-extension.md): tokens own
  appearance, slots own structure, `part`/class hooks declined. Colour derives
  from five dials by `color-mix` in oklab, so dark mode is a two-value swap;
  `check:theme` gates the drift; `boolean` → Switch ships as the one styled
  variant. No calls open.
- **Canon reopenings — one voice.** Done: #71 reopened the "no tips surface in V1"
  stance where #75 had just amended the must_fill-as-diagnostic-only one. Both
  paragraphs were rewritten whole, landing on one line — guidance is per-field or
  document-level, and a field never carries a tips surface.
- **Boundary asks — none.** #57 was the only candidate; `toJson` / `loadJson` /
  `clone` already carry snapshot-and-restore, so no upstream ask is needed
  ([`RISKS.md`](RISKS.md)). Nothing in the remaining set touches the WASM
  boundary.

## Issue hygiene

Found while scheduling; the issue bodies are stale on these points.

- **#16** — `prosemirror-tables` is no longer in `package.json`, so the "drop the
  pin until it's consumed" rider is already satisfied. The dead-dependency
  framing in the body no longer holds.
- **#57** — references `prose/designs/INDEX.md`. No such tier exists;
  `prose/README.md` retired the plan tiers, and deferred designs are GitHub
  issues. Its "Cross-leaf coordination" pointer needs rehoming.
- **#72** — the body's case (A) predicted a throw from the ungated
  `cardSchema.fields` read; the landed fix un-gates the card loop instead, so
  #21's whole-region gate is superseded rather than guarded.
- **#75 (landed here)** — introduced `--qm-required` (`FieldLabel.svelte:60`)
  without a THEMING.md entry. Folded into #74's scope; the proposed `check:theme`
  is what stops the next one.

## Findings

- **`bits-ui` covers three of the five scalar kinds, not all five** — and that is
  the right number. It ships `Select`, `Switch`/`Checkbox`, and `DateField`/
  `DatePicker`, but NO text or number primitive, because there is nothing headless
  to supply: `<input type="text">` and `<input type="number">` are already fully
  styleable. The holes a palette cannot reach are the UA-owned ones — the checkbox
  box, the dropdown list, the calendar popup — so #79 moves exactly `enum`,
  `boolean`, and `date`, and leaves text/number native and already themed. The
  a11y burden #76 weighed comes with each primitive.
- **#70's groundwork holds**: `prosemirror-schema-list` is a live dependency and
  `list_item` is `block+`, so nesting is representable without a schema change.
- **Color was the unguarded axis.** Geometry and type each paired public dials
  with a derived private scale and a lint (`check:geometry`, `check:type`); color
  had flat literals and no gate. That asymmetry — not dark mode as such — is what
  #74 was really about, and `check:theme` closes it.
