# Field Provenance

> **Status**: proposed, unscheduled. Resolves the [#51](https://github.com/borb-sh/quillmark-editor/issues/51)
> read-model decision; on promotion amends [VISUAL_EDITOR.md](../canon/VISUAL_EDITOR.md)
> §"the commitment ladder".

## TL;DR

`quill.resolve(doc)` is adopted as the editor's **provenance** source — the
per-field `authored | default | zero` rung (`FieldSource`) and the resolved
`default:` value — and **not** as the form's read-model. The controls keep
reading authored-raw values (`CardModel.values`, absent-when-unset); provenance
is a parallel channel that feeds chrome only. This settles [#51](https://github.com/borb-sh/quillmark-editor/issues/51)
on the "keep raw reads" branch and is the data mechanism the visual layer in
[RESTING_FIELDS.md](RESTING_FIELDS.md) reads from.

## The decision (#51)

#51 asked whether `resolve` becomes the editor's read surface, phasing out the
raw `doc.get` / `payloadItems`-walk reads. It does not. Three facts hold the read
paths raw:

- **The controls want the value they wrote.** `resolve.value` is filled
  (`authored → default → zero`) and render-time *coerced* (`compile_data conforms
  once`); a control wants the verbatim authored value, absent when unset. Feeding
  `resolve` into a control bakes the default in as authored — the exact thing the
  commitment ladder forbids (VISUAL_EDITOR §ladder: "the engine never persists a
  default, nor does the editor").
- **The prose leaf wants the `Content` object.** `field.ts` decodes raw `Content`
  into ProseMirror; `resolve.value` for a richtext field is a projected form
  (markdown / lowered), not that object.
- **The render-time ladder is the engine's.** `resolve` *exposes* the engine's
  authored›default›zero resolution; it was never the editor's to reimplement, so
  there is nothing to offload on the read path.

So the raw reads stay, [#48](https://github.com/borb-sh/quillmark-editor/issues/48)
item 6 (collapsing `field.ts`'s reads onto `doc.get(addr)`) is unblocked to land,
and `resolve` is adopted for the one thing the raw reads cannot express:
provenance.

## The mechanism

A `provenance` map, **parallel** to `CardModel.values` and keyed the same way
(field name → rung), derived from `quill.resolve(doc)` in the same `$derived`
that builds `model`. `quill` is already threaded there (the derive reads
`quill.schema`), so `resolve` rides the same handle — no new prop.

```
provenance[name] = { source: FieldSource, default?: <resolved default value> }
```

The invariant that keeps the ladder intact:

> **Provenance never feeds the control value.** `values[name]` (authored-raw,
> absent when unset) stays the sole input to `syncedLocal`. `provenance[name]`
> feeds chrome only — the ghosted `default:`, and any authored/default/zero
> affordance.

A `source === 'default'` field still reads *absent* in `values`, so its control
is still empty and still commits `doc.removeField(addr)` on clear. The two
channels share a key space but never cross: one is what the field holds, the
other is why it renders what it renders.

## Why this is clean

- **The richtext-shape blocker (#51 blocker 3) is moot here.** The ghost is a
  *text render* of the default, not a decode into ProseMirror. Even if
  `resolve.value` for a richtext field is lowered to markdown, that is the correct
  thing to *display* as placeholder text. The shape uncertainty that would block a
  read-model swap does not touch provenance.
- **No conflict with #48 item 6.** Item 6 collapses the *authored-raw* reads onto
  `doc.get(addr)`; provenance is a separate derive. They coexist — item 6 lands,
  provenance adds a parallel channel.
- **Diagnostics untouched.** `resolve` deliberately leaves diagnostics to
  `validate`; `diagByKey` routing (VISUAL_EDITOR §Diagnostics) is unchanged.

## What provenance buys the ghost

Today the editor ghosts the default by reading the schema's static `default:`
(VISUAL_EDITOR §ladder: "it lives in the schema") and decides authored-vs-ghost
from a presence check (`leafPresent` / an absent key in `values`). `resolve`
consolidates both into one `source` read and upgrades the ghost to the
*resolved* default — correct when a default is dynamic / interpolated rather than
a static literal. That is the [RESTING_FIELDS.md](RESTING_FIELDS.md)
empty-affordance, sourced truthfully.

It also disambiguates `EnumField`'s ghosted default, which today renders as the
*selected* option — indistinguishable from an authored pick ([#21](https://github.com/borb-sh/quillmark-editor/issues/21),
relates [#12](https://github.com/borb-sh/quillmark-editor/issues/12)).
`source === 'default'` is exactly the signal that styles / announces the sentinel
as default-not-authored.

## Cost, and gating it

`resolve` computes whole-document resolution per call — heavier than the local
`payloadItems` walk `values` is built from. So it is **gated behind a provenance
consumer**: computed only when RESTING_FIELDS (or another affordance) is engaged,
never on V1's hot path. When it does run it re-derives on the same `revision`
bump as `model` — one extra whole-doc pass per scalar/structure mutation, not per
keystroke (prose leaves commit without bumping `revision`). Until a consumer
ships, nothing calls `resolve` and the read paths are exactly as they are today.

## Open questions

- **Keying body + arbitrary `Addr`.** `resolve` returns declaration-ordered rows
  per card (main + each card, body under `$body`); the codec's `Addr`-keyed reads
  need a small translation to those rows (#51 blocker 4). Confirm the `$body` /
  `{card}` body keys against `runtime.d.ts` when scheduled.
- **When to compute.** One gated whole-doc `resolve` per derive for now; a
  narrower single-field query if the boundary later exposes one.
- **Affordance scope.** The RESTING_FIELDS ghost is the first consumer; a full
  authored/default/zero indicator (provenance dots) is a superset — design it
  with RESTING_FIELDS, not ahead of it.

Cross-refs: [#51](https://github.com/borb-sh/quillmark-editor/issues/51),
[#48](https://github.com/borb-sh/quillmark-editor/issues/48) (item 6),
[RESTING_FIELDS.md](RESTING_FIELDS.md),
[DOCUMENT_MODEL.md](../canon/DOCUMENT_MODEL.md) (boundary ledger — `resolve` row),
VISUAL_EDITOR.md §"the commitment ladder".
