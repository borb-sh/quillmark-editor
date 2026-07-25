# Theming API rework

> **Plan tier** — the target shape, not what ships. `THEMING.md` and
> `prose/canon/` describe the API as built; this describes what replaces it.
> Retire this file when the last item lands.
>
> Accurate as of `66fc34e`. Every mechanism in §Probed was run in Chromium 141 /
> Svelte 5.56.5 against this repo, not reasoned about.

## TL;DR

The derivation math is right and stays. Everything wrong with the theming API
traces to one choice — **the scale is a JS string applied as an inline `style`
attribute** (`core/theme.ts` → `QM_THEME`) — and replacing that transport with a
stylesheet the library imports itself unlocks four fixes at once: a shipped dark
default, `@layer` precedence so consumer CSS wins without `!important`,
`font-family` and `color-scheme` reaching every root, and the freed `style`
attribute.

Three things the transport does not reach land as their own items: ProseMirror's
un-imported base stylesheet, the two portaled surfaces that never see a
pane-scoped dial, and a lint suite split three ways.

## Evidence

| Finding | Where |
|---|---|
| The transport cannot express `@media` or `@layer`, so `THEMING.md` hands dark mode to the consumer as homework. | `core/theme.ts` header |
| `--qm-font` is one of ten dials and reaches one of five roots. The preview, the source view, and the two portaled surfaces set no family. | `VisualEditor.svelte:577` is the only `font-family: var(--qm-font, …)` |
| Four `ui-monospace, monospace` literals are un-tokenized, and `check:type` cannot see them — `font-family` is out of its scope by its own header. | `Card.svelte`, `TipsCard.svelte`, `ArrayField.svelte`, `SourceView.svelte` |
| Nothing sets `color-scheme`, so a dark editor keeps light native scrollbars, date picker, and caret. | absent from `SCALE` |
| `prosemirror-view/style/prosemirror.css` is never imported; two of its rules are hand-copied into the leaves, dropping `li { position: relative }` — which the list schema needs — plus the selection-hiding, ligature, and separator-img rules. Its `.ProseMirror-selectednode` outline is a hard `#8cf`. | `ProseField.svelte`, `ProseArrayElement.svelte`, `codec/schema.ts` `list_item` |
| The dial census scans only `THEMING.md`, so nothing stops canon drifting to dead token names. Canon is clean today; the hole is what lets it rot again. | `check-theme.mjs` rule 2 |
| The rungs are inline styles, near the top of the cascade — a consumer override needs `!important`. | `QM_THEME`, 37 rungs restamped on five roots |
| The roots take no `class`/`style` passthrough, because `style` is occupied. | `Preview.svelte` `Props` |
| A dial scoped to a wrapper around the editor never reaches the two portaled surfaces, which inherit from `<body>`. `THEMING.md`'s "set them on any ancestor" is false for two of five roots. | probed live — §Probed |

## Target shape

### Transport — `core/theme.css`, side-effect imported

`src/lib/core/theme.css` holds the whole derivation; `core/index.ts` opens with
`import './theme.css';`. Every subpath already imports `core`, `package.json`
already declares `"sideEffects": ["**/*.css"]`, and `svelte-package` copies the
file into `dist/`. The consumer cannot forget an import it never writes — which
inverts the failure mode `theme.ts`'s header rejects a CSS file over.

Roots carry `data-qm-root` in place of `style={QM_THEME}`. The rule keys on the
attribute, so the stylesheet never enumerates the five root classes and a new root
adds one attribute instead of importing and restamping 2060 bytes. `QM_THEME` is
deleted rather than deprecated — documented-internal, `0.0.0`, no consumers.

```css
@layer qm.scale, qm.chrome;

@layer qm.scale {
  :where([data-qm-root]) {
    /* Resolved poles — each dial's default stated ONCE. */
    --_qm-bg: var(--qm-bg, #fff);
    --_qm-fg: var(--qm-fg, #1a1a1a);
    /* …accent, danger, warning, font, font-mono… */

    /* The rungs, derived from the poles — the oklab math is unchanged. */
    --_qm-surface: var(--_qm-bg);
    --_qm-border: color-mix(in oklab, var(--_qm-bg), var(--_qm-fg) 17%);
    /* …the remaining 35… */

    /* The root rule carries REAL properties, not only custom ones. */
    font-family: var(--_qm-font);
    font-size: var(--_qm-text-body);
    color: var(--_qm-ink);
    color-scheme: var(--qm-color-scheme, light dark);
  }

  @media (prefers-color-scheme: dark) {
    :where([data-qm-root]) {
      --_qm-bg: var(--qm-bg, #14171c);
      --_qm-fg: var(--qm-fg, #e8eaed);
    }
  }
}
```

Two moves in that sketch are load-bearing and easy to lose:

**Resolved poles.** `theme.ts` already collapses the poles — `BG` and `FG` are TS
constants — but a constant cannot survive into a stylesheet, and the *emitted* CSS
inlines `var(--qm-bg, #fff)` into all nine rungs that mix from it and
`var(--qm-fg, #1a1a1a)` into all eleven. `--_qm-bg` / `--_qm-fg` are the CSS
equivalent of what `BG`/`FG` do in TS, so this is continuity, not a new idea.

What is new is the payoff: the dark block retunes **two declarations** instead of
twenty. It is also the correctness mechanism — a `@media` block setting `--qm-bg`
*on the root element* would beat a consumer's inherited value and silently break
the contract, because an element's own declaration always wins over inheritance.
Deriving the rungs from `--_qm-bg` instead is what keeps the consumer winning in
both schemes.

**The root rule carrying real properties.** This is what fixes `--qm-font`
structurally — `font-family` on `[data-qm-root]` reaches all five roots at once,
with no component remembering a line.

### Dials — eleven

Drop **`--qm-font-scale`**: a typographic ratio no consumer turns, read three times
and only inside the derivation. It becomes a private constant. Add
**`--qm-font-mono`** (four sites already hard-code the family) and
**`--qm-color-scheme`** (the native-UI hole, defaulting to `light dark`).

Final set: `bg`, `fg`, `accent`, `danger`, `warning`, `color-scheme`, `font`,
`font-mono`, `font-size`, `radius`, `space` — five hues, one scheme, two families,
one size anchor, two geometry.

The preview page's fill reads `var(--_qm-surface)` directly (`paint.ts`). Promoting
it to its own rung — so a consumer could put a light page under dark chrome — is a
plausible next step and explicitly not part of this rework.

### Layering

`@layer qm.scale, qm.chrome`, component styles inside `qm.chrome`. Unlayered
consumer CSS then wins with no `!important` and no specificity contest.

Layering does **not** open the rungs to an ancestor override, and canon must not
imply it does. `:where([data-qm-root])` declares each rung *on the root element*,
so a consumer's `.my-app { --_qm-border: … }` is ignored. The escape hatch is
targeting the root itself (`.my-app [data-qm-root] { … }`), which is unlayered and
does win. That is the right shape: rungs stay non-contractual, and reaching them
takes deliberate aim rather than a stray ancestor declaration.

### Decided against: `@property`

`@property` requires a **computationally independent** `initial-value`. `rem` and
`em` are not, so `@property --qm-space { syntax: "<length>"; initial-value: 0.25rem }`
is invalid and the rule is dropped **silently** — no console error, no partial
effect. Two of the three dials worth registering (`--qm-space`, `--qm-font-size`)
default in `rem` deliberately, so they scale with the user's font-size preference;
trading that for `px` to buy type-checking is an accessibility regression for a
lint-shaped benefit. Only `--qm-radius` is registrable, and one registered dial out
of eleven is worse than none — changing its default to `0.5rem` later would kill
the registration with no signal.

So `var(--qm-space, 0.25rem)` is used uniformly, resolved once into a pole. The
residual risk is **accepted**: `--qm-space: 4` poisons the `calc()` chain and
collapses every padding to `0px`, silently. Document it; there is no CSS guard.

## Work items

**A lands first and alone.** B–D are the core and land together. E–G are
independent, any order. Canon lands in the **same commit** as the code that
falsifies it (`CLAUDE.md`) — each item below names the docs it touches; none of
them is a separate documentation pass.

**A — Collapse before extending.** Three subtractions, each independent of the
rework and landable today. They exist because the rework would otherwise pay a
duplication cost instead of removing it.

- **One gate, not three.** `check-geometry` (28 lines), `check-type` (35), and
  `check-theme` (85) are the same rule — *read a rung, do not mint a value* —
  split by CSS property category, already sharing `style-lint.mjs` (92 lines).
  That split is chronological, not principled: geometry landed with #46, type with
  #61, colour with #79. Merge into one `check:style` driven by a property→axis
  table. 240 lines guarding 815 lines of component CSS is the ratio to bring down,
  and afterwards item D is one edit rather than a choice about which script owns
  the canon scan.
- **State the dial count once.** It is asserted in five files — `THEMING.md`
  (twice), `ARCHITECTURE.md`, `VISUAL_EDITOR_UIUX.md`, `AESTHETIC.md`,
  `SURFACES.md`. `THEMING.md` owns it; the others reference the contract without
  restating its size. Canon naming *individual* dials stays — `SURFACES.md`
  §Rhythm saying which dials feed which axis is load-bearing, and item D keeps
  those names honest. It is the number that is duplicated, and the number is why a
  dial change costs five prose edits.
- **Drop the permanence framing.** `THEMING.md` and `SURFACES.md` §"Preventing
  drift" justify the minimal surface with "a public token is a permanent promise."
  At `0.0.0` with no consumers that cost is not yet real. Keep the small surface —
  it is right on its own merits — and state the reason as design economy. Both
  sites, including the one inside §"What is deliberately not public".

*Acceptance*: `check:style` replaces three scripts with no loss of coverage (every
current violation still fails); the count appears in one file; `permanent promise`
greps to nothing.

**B — Transport.** Port `SCALE` to `core/theme.css` with resolved poles,
`@layer qm.scale`, the root property block, and the dark default. Delete
`core/theme.ts` and the `QM_THEME` export. Swap `style={QM_THEME}` for
`data-qm-root` on `VisualEditor`, `Preview`, `SourceView`, `FormatPopover`, and
`EnumField`'s listbox. Drop the now-redundant `font-family` from
`VisualEditor.svelte`.
*Canon*: `ARCHITECTURE.md` §Theming and `SURFACES.md` §"The scale in code" both
name `core/theme.ts` applied as a `style` attribute, and are false the moment this
lands. `THEMING.md` §"What is deliberately not public" documents `QM_THEME`.
*Acceptance*: `e2e/editor.spec.ts` test (g)'s root walk passes unchanged; the two
portaled surfaces resolve `--_qm-ink` **and** a non-`body` `font-family`.

**C — Dials.** Add `--qm-font-mono` and `--qm-color-scheme`, retire
`--qm-font-scale` to a constant, tokenize the four mono literals. Rewrite
`THEMING.md`'s dial table to the eleven.
*Canon*: `SURFACES.md` §"The scale in code" names `--qm-font-scale` in the type
axis. *Acceptance*: the dial census passes in both directions against the new
table.

**D — Gate rules.** Three rules on the single gate A leaves behind:

- The dial census scans `prose/canon/**` as well as `THEMING.md`, so a dead token
  name in canon fails CI. This is what prevents the rot recurring.
- `font-family` enters the type axis, closing the mono literals for good.
- Moving to CSS loses the `SCALE` object's duplicate-key-is-an-error property.
  Replace it with a duplicate-`--_qm-x`-definition check over `theme.css`. A real
  cost of the move, cheaply mitigated; do not skip it.

**E — ProseMirror base stylesheet.** Import
`prosemirror-view/style/prosemirror.css` from `visual/index.ts`; override
`.ProseMirror-selectednode`'s `#8cf` outline with `--_qm-accent` in `qm.chrome`;
remove the hand-copied `white-space`/`word-wrap` rules from `ProseField.svelte`
and `ProseArrayElement.svelte`. *Acceptance*: list markers position correctly (the
dropped `li { position: relative }`), node selection reads in the theme hue.

**F — Portal targets.** A live bug, independent of the transport and not fixed by
it: `FormatPopover` and `EnumField`'s listbox mount at `document.body`, so they
inherit dials from `<body>` rather than from the consumer's wrapper. Theme one
pane and you get a light popover over a dark editor.

Fix: pass the editor root as the portal target — `bits-ui`'s `Portal` takes
`to?: Element | string` — so the content descends from `[data-qm-root]`. Resolve
the target from the trigger (`closest('[data-qm-root]')`) rather than hard-coding
`'.qm-editor'`, so a surface mounted outside the editor still lands somewhere
themed, and fall back to `body` when there is no root ancestor.
*Canon*: `THEMING.md`'s "One exception, for now" caveat retires here.
*Acceptance*: a dial set on the editor's wrapper reaches both portaled surfaces;
both stay unclipped inside the split pane, at narrow widths, and near the viewport
edge. Worth an e2e test — test (g) asserts each root resolves *some* scale, which
passes today precisely because the portaled roots resolve the **default** one.

**G — Root passthrough.** With `style` freed, give the three mounted roots `class`
and `style` props. Small, and the reason B is worth doing beyond theming.

## Probed

Chromium 141.0.7390.37 (the preinstalled browser), Svelte 5.56.5, this repo's
`svelte-package`. Probes were run against the playground and discarded; nothing
from them is committed.

| Assumption | Result |
|---|---|
| `@layer` survives Svelte's scoped `<style>` | **Holds.** The hash lands on selectors *inside* the at-rule, and unused-selector detection still works within the layer. `qm.chrome` is safe. |
| `svelte-package` carries a side-effect CSS import | **Holds.** `dist/core/theme.css` is copied, the import survives at the head of `dist/core/index.js`, `publint` clean. |
| Consumer's ancestor dial beats the shipped dark default | **Holds, in both schemes.** No consumer value: `#fff` light, `#14171c` dark. With `--qm-bg` on an ancestor: the consumer's value in *both*. Resolved poles are what make this work. |
| Unlayered consumer CSS beats `@layer qm.chrome` | **Holds.** No `!important`, no specificity contest. |
| `@property` type-checks the `<length>` dials | **Fails.** `rem`/`em` initial values are not computationally independent; the at-rule is dropped silently. |
| A rung can be overridden from an ancestor | **Fails, by design.** The root's own declaration beats inheritance; only `[data-qm-root]`-targeted rules land. |
| Portaled surfaces inherit a scoped dial | **Fails — a live bug.** Editor root resolved `rgb(0,0,40)`; the listbox, mounted at `BODY`, resolved `#fff`. Item F. |
| Portaling to the editor root fixes it without clipping | **Holds.** Listbox resolves the consumer's dial, lands over its trigger, no ancestor clips it inside the split pane. |

## What does not change

The oklab `bg → fg` / `fg → bg` derivation and its calibrated percentages; the
rung vocabulary and names; per-root re-derivation (the reason a root marker exists
at all — rungs minted at `:root` would compute against `:root`'s dials and defeat
both per-pane theming and an ancestor dark class); the gate discipline, one script
after A with the same rules; the e2e root walk. This is a transport-and-composition
change, not a redesign.

## Costs to accept

- **The browser floor becomes explicit**: `@layer` (2022) and `color-mix` (2023),
  both Baseline. State it in `THEMING.md` rather than letting a consumer find it.
- **A unitless dial still fails silently**, since `@property` cannot guard the two
  `rem`-defaulted dials. Documented, not fixed.
- **Eleven dials is a wider surface than ten**, and item A removes the argument
  that made width automatically expensive. The cost is comprehension, not
  compatibility: every dial is one more thing a reader holds. `--qm-font-mono` pays
  for itself against four existing literals; `--qm-color-scheme` is the weaker case
  — arguably the consumer's job — and is the one to re-argue before C lands.
- **The scale stops being introspectable from JS.** Nothing reads it today.
