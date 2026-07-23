# Field Provenance

> **Status**: partly shipped — the provenance channel and the resolved-default
> ghost land now (`src/lib/visual/`, `src/lib/core/`); the resting-typography
> visual layer stays deferred. Resolves the [#51](https://github.com/borb-sh/quillmark-editor/issues/51)
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

So the raw reads stay — and, the read-model now settled, [#48](https://github.com/borb-sh/quillmark-editor/issues/48)
item 6 lands with this work: `readLeaf` / `leafPresent` collapse their legacy
`payloadItems` walk onto the unified `doc.get(addr)`. `resolve` is adopted for the
one thing the raw reads cannot express: provenance.

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

The editor ghosts the default from the provenance row, not the schema's static
`default:`: `Field.svelte` reads `ghostDefault(provenance)` — the resolved value
when `source === 'default'`, nothing when `'authored'` / `'zero'`. This upgrades
the ghost to the *resolved* default (correct when a default is dynamic /
interpolated rather than the static schema literal) and folds the old
presence-check-plus-schema-read into one `source` read. The controls' `value` is
untouched — still the authored-raw `values[name]`.

The same channel feeds `EnumField`'s unset sentinel (its `fallback` ghost label)
and `BooleanField`'s unset state, so "the default" has one source of truth across
every control. A sharper authored/default/zero affordance — styling or announcing
the sentinel off `source` ([#21](https://github.com/borb-sh/quillmark-editor/issues/21),
[#12](https://github.com/borb-sh/quillmark-editor/issues/12)) — reads off the same
map when RESTING_FIELDS is scheduled.

## Cost

`resolve` computes whole-document resolution per call — heavier than the local
`payloadItems` walk `values` is built from. The ghost is a live consumer, so it
runs in the `model` derive: one whole-doc pass per scalar/structure mutation, not
per keystroke (prose leaves commit without bumping `revision`). That cost is
accepted for a memo-sized document, and the call is **guarded** — a `resolve`
failure logs and degrades to no ghosts, never a blank form (provenance is chrome).
The deferred RESTING_FIELDS visual layer is the next consumer of the same channel:
it reads `source` off the `provenance` map already on `CardModel`, no new derive.

## Open questions

- **Body and nested defaults stay on their own paths.** `resolve` keys the card
  body as a sibling `body: ResolvedField | null` (not a `$body` row — the
  runtime.d.ts prose comment is stale), and object sub-properties / array elements
  are not individual rows. The scalar ghost needs none of these, so the body prose
  leaf keeps its raw read and `ObjectField` keeps its schema-default sub-ghosts;
  wiring provenance into either waits on its own affordance.
- **When to compute.** One whole-doc `resolve` per derive today; a narrower
  single-field query if the boundary later exposes one.
- **Affordance scope.** The ghost is the first consumer; a full
  authored/default/zero indicator (provenance dots) is a superset — design it with
  RESTING_FIELDS, not ahead of it.

Cross-refs: [#51](https://github.com/borb-sh/quillmark-editor/issues/51),
[#48](https://github.com/borb-sh/quillmark-editor/issues/48) (item 6),
[RESTING_FIELDS.md](RESTING_FIELDS.md),
[DOCUMENT_MODEL.md](../canon/DOCUMENT_MODEL.md) (boundary ledger — `resolve` row),
VISUAL_EDITOR.md §"the commitment ladder".
