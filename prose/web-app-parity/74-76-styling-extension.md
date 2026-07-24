# Styling extension — #74 tokens, #76 controls

The two issues are one question: **how far past the baseline can a consumer
reach, and through what.** Deciding them apart yields two extension APIs, which
is what the #74 comment warns against. One answer, in two halves:

> **Tokens own appearance. Slots own structure. There is no third mechanism.**

`part`/class hooks — #74's "hooks beyond tokens", and the reason the `qm-*`
classes are "built on sand" in #76 — are **declined** under this. A class
contract freezes internal DOM shape; the slot is the supported way to own pixels
the tokens can't reach.

## The finding that reframes #74

The house doctrine already exists and is already enforced — for two of three
axes. SURFACES §"Preventing drift": *a component reads a token, it does not mint
a value.*

| Axis | Public dials | Derived private scale | Gate |
|---|---|---|---|
| Geometry | `--qm-radius`, `--qm-space` | `--_qm-radius*`, `--_qm-space-*` | `check:geometry` |
| Type | `--qm-font-size`, `--qm-font-scale` | `--_qm-text-*`, `--_qm-weight-*` | `check:type` |
| **Color** | **~15 flat literals** | **none** | **none** |

Color is the unguarded third axis. That is why geometry and type mint zero bare
literals and color mints ten. #74 is not "invent a theming system" — it is
**extend the existing doctrine to color**, with the same shape and the same kind
of gate.

The asymmetry is also what makes dark mode expensive today: fifteen independent
color literals means a consumer writes fifteen values, twice. A derived scale
means it writes the rungs.

## #74 — measured state

### Token completeness: the gap is ten literals

Everything else already reads `var(--qm-…, fallback)`. Bare literals in
`src/lib/visual/**` `<style>`:

| Where | Value | What |
|---|---|---|
| `Card.svelte:404` | `#fff` | background |
| `Card.svelte:415` | `#555` | text |
| `CardControls.svelte:77` | `#444` | control glyph |
| `CardControls.svelte:84` | `#b23838` | **delete glyph** |
| `ObjectField.svelte:121` | `#999` | secondary text |
| `VisualEditor.svelte:593` | `#555` | text |
| `VisualEditor.svelte:621` | `#9a9a9a` | control edge |
| `VisualEditor.svelte:622` | `#222` | text |
| `FormatPopover.svelte:337` | `82%` | translucency ratio (color is tokenized) |
| `FormatPopover.svelte:342` | `rgba(0,0,0,0.14)` | **popover shadow** |

Small, and it matches the issue's "a handful". The tokenizing is mechanical; the
gate below is what keeps it at zero.

### Mode-fragility: the actual work

Four classes, in descending order of how badly they break inverted:

1. **Shadows.** Two exist. `FormatPopover:342` is bare black-on-light;
   `--qm-page-shadow` (`paint.ts:77`) is tokenized but its *default* is
   `rgba(0,0,0,0.2)`. A black shadow on a dark surface is invisible — dark needs
   a lighter halo or a border, not a darker shadow. Both need mode-neutral
   defaults, and the bare one needs a token.
2. **Blur + translucency.** `backdrop-filter: blur(8px)` (×2, untokenized) and
   the 82% `color-mix` toward transparent. A translucent light pill over dark
   content reads as haze; the ratio has to be retunable.
3. **Opacity-receded affordances.** Eleven bare values on a `0.3 / 0.35 / 0.5`
   ladder (hover-reveal controls, disabled states, ghosting). Subtler than it
   looks: opacity recedes an element toward *whatever is behind it*, so these
   invert correctly **only if the element's own color is a token** — which it
   mostly is. The residual hazard is perceptual, not structural: equal opacity
   is not equal contrast in both modes. Tokenize the ladder as rungs so a
   consumer can retune, rather than treating each as a magic number.
4. **Nothing else.** No gradients, no `filter`, no fixed image assets. The
   surface is genuinely thin — the reason this is tractable at all.

### Docs drift, unguarded

`--qm-required` (`FieldLabel.svelte:60`, landed with #75 **on this branch**) is
consumed but absent from THEMING.md. Nothing catches that.
(`--qm-border-strong` also appears undocumented but is playground-only,
`src/routes/`, not package surface — not drift.)

## #74 — recommendation

1. **Promote a semantic color scale**, mirroring geometry/type: a public rung set
   (surface / text / border / accent / danger) deriving a private `--_qm-*` color
   scale every component reads. Existing flat tokens **keep working** — they
   layer over the rungs as targeted overrides, satisfying THEMING.md's "stable,
   layered over, not replaced" promise. Consumer sets rungs for dark; anyone
   already setting `--qm-label` is unaffected.
2. **Tokenize the ten**, plus the blur radius, the mix ratio, and the opacity
   ladder.
3. **Add `check:theme`** — the missing third gate. Two rules, matching its
   siblings: no bare color/shadow/opacity literal in a `<style>` block outside
   a `var()` fallback; and every consumed `--qm-*` appears in THEMING.md. This
   is what makes the pass durable instead of a one-time cleanup.
4. **No package-owned dark theme** — unchanged from the issue's non-goals. The
   deliverable is a surface complete enough that the consumer's palette decides.

## #76 — the slot contract already exists

The five scalar controls share a near-identical prop shape. This is not an API
to invent, it is one to make public:

```ts
{ value: T | undefined; fallback?: T; label?: string;
  onCommit: (v: T | undefined) => void; testid?: string }
```

`fallback` is the ghosted `default:`; `onCommit(undefined)` is the unset rung of
the commitment ladder. Enum adds `values` + `optionAllowed` (#73's hook, already
landed). Dispatch is a single `{#if field.control === …}` chain in
`Field.svelte:88-156`, keyed by `ControlKind` (`structure.ts:10`) — the natural
slot key, exactly as the issue says.

### `syncedLocal` is the hazard nobody has named

Every control routes its value through `syncedLocal` (`synced.svelte.ts`): the
local reconciles **only external** changes, own-edits stay `untrack`ed. Without
it, every keystroke re-runs the sync and resets the caret — the bug #48 fixed by
consolidating five character-identical copies into one.

A naive slot that hands the consumer a raw `value` prop **reintroduces #48 in
consumer code**, where it is invisible to this repo's tests. So the contract must
be: **the package owns reconciliation and hands the slot an already-reconciled
value.** The consumer paints and calls `onCommit`; it never manages sync. This is
the single non-obvious requirement of the whole design.

### bits-ui changes the build-vs-slot calculus

`bits-ui` is already a dependency, consumed only for `Popover`
(`FormatPopover.svelte:47`). It ships headless `Select`, `Checkbox`, `Switch`,
and date primitives. #76 weighs styled variants against "the a11y burden the
native controls get for free" — but the precedent for consuming a headless
primitive is set, and the a11y comes with the primitive. That burden is
materially smaller than the issue assumes.

## #76 — recommendation

**Option (3), the scoped hybrid** — not (1) as the issue proposes, and the
bits-ui finding is why.

- **Native stays the default.** Zero change for consumers who don't opt in.
- **Slots are the escape hatch**, per `ControlKind`, package-owned
  reconciliation. This is the *only* extension mechanism past tokens.
- **Ship one styled variant — `boolean` → Switch — on bits-ui.** The native
  checkbox is the worst parity offender (fully un-restylable, and the issue notes
  no boolean field even exists in the reference quill, so blast radius is nil).
  It proves the slot contract from inside the package before a consumer depends
  on it, and it costs one primitive from a dep we already ship.

Pure (1) leaves the slot API unexercised until someone outside uses it; pure (2)
takes on a control library. The hybrid validates the contract at one control's
cost.

## Calls for you

1. **Semantic color rungs, or stay flat?** Rungs are the coherent answer and
   match the house pattern, but they are the larger change and the one that most
   shapes what a consumer writes.
2. **`check:theme` in scope for #74, or a follow-up?** Recommend in-scope —
   without it the ten literals come back, and `--qm-required` shows drift is
   already happening.
3. **The one styled variant (boolean → Switch), or slots only?** Recommend
   shipping it, to exercise the contract from inside.
4. **Declining `part`/class hooks** — confirm. It is the load-bearing half of
   "one styling story"; if hooks are wanted after all, #76's slot design changes
   shape.
