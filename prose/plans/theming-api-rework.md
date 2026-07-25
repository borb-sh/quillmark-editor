# Theming API rework

> **Plan tier** — the target shape, not what ships. Canon (`prose/canon/`,
> `THEMING.md`) describes the current API; this describes what replaces it and the
> order to build it in. Retire this file when the last work item lands, rewriting
> canon in the same commit.
>
> Every mechanism below is probed in Chromium 141 / Svelte 5.56.5 against this
> repo — §"Probed" records what held and what did not.

## TL;DR

The derivation math is right and stays. Everything wrong with the theming API
traces to one choice — **the scale is a JS string applied as an inline `style`
attribute** (`core/theme.ts`) — and replacing that transport with a real
stylesheet the library imports itself unlocks five fixes at once: a shipped dark
default, `@layer` precedence for consumer overrides, `font-family` and
`color-scheme` reaching every root, the freed `style` attribute, and the collapse
of the repeated `var(--qm-bg, #fff)` fallbacks.

Two dependency-owned surfaces (CodeMirror's highlight style, ProseMirror's base
stylesheet) are themed surfaces the lints structurally cannot see, and the two
portaled surfaces never see a pane-scoped dial at all. Each lands as its own work
item.

## Why

Evidence, all current as of this branch:

| Finding | Evidence |
|---|---|
| The transport cannot express `@media` or `@layer`. `THEMING.md` hands dark mode to the consumer as homework because an inline attribute has no other option. | `core/theme.ts:6-13` |
| `--qm-font` is one of ten dials and reaches one of five roots. The two portaled surfaces render at `document.body`'s font; the preview and source view set no family. | `VisualEditor.svelte:577` is the only `font-family: var(--qm-font, …)` |
| Three mono literals are un-tokenized, and `check:type` cannot see them — `font-family` is explicitly out of its scope. | `Card.svelte:537`, `TipsCard.svelte:101`, `ArrayField.svelte:185` |
| Nothing sets `color-scheme`, so a dark editor keeps light native scrollbars, date picker, and caret. | absent from `SCALE` |
| The source view's syntax colours are CodeMirror's light-tuned defaults (`#708`, `#219`, `#164`, `#a11`, `#e40`, `#00f`, `#404740`), invisible to `check:theme` because they live in `node_modules`. | `source/view.ts:66` |
| `prosemirror-view/style/prosemirror.css` is never imported; two of its rules are hand-copied into the leaves, dropping `li { position: relative }` — which the list schema needs — plus the selection-hiding, ligature, and separator-img rules. Its `.ProseMirror-selectednode` outline is a hard `#8cf`. | `ProseField.svelte:88`, `ProseArrayElement.svelte:78`, `schema.ts:80-94` |
| `check:theme` rule 2 scans only `THEMING.md`, so the canon docs a reader hits first rotted to 11 dead token names across 17 citations. | `check-theme.mjs:68-70` (rewritten in this branch's canon commit; the gate hole remains) |
| The rungs are inline styles, near the top of the cascade — a consumer override needs `!important`. | `QM_THEME`, 37 rungs / 2060 bytes, restamped per root |
| The roots take no `class`/`style` passthrough, because `style` is occupied. | `Preview.svelte:21-28` |
| A dial scoped to a wrapper around the editor never reaches the two portaled surfaces, which inherit from `<body>`. `THEMING.md`'s "set them on any ancestor" is false for two of five roots. | probed live — §Probed, W6 |

## The target shape

### 1. Transport — `core/theme.css`, side-effect imported

`src/lib/core/theme.css` holds the whole derivation. `src/lib/core/index.ts` opens
with `import './theme.css';`. Every subpath already imports `core`, `package.json`
already declares `"sideEffects": ["**/*.css"]`, and `svelte-package` copies the
file into `dist/`. The consumer cannot forget an import it never writes — which
inverts the failure mode `theme.ts:6-13` rejects a CSS file over.

Roots carry `data-qm-root` in place of `style={QM_THEME}`. A new root adds one
attribute instead of importing and applying a 2KB string. The rule keys on the
attribute, not on the five root classes, so the stylesheet never enumerates roots.

`QM_THEME` is deleted from `core/index.ts`. It is a documented-internal export on
a public subpath (`THEMING.md` §"What is deliberately not public"), the package is
`0.0.0`, and it has no consumers — remove it outright rather than deprecating.

```css
@layer qm.scale, qm.chrome;

@layer qm.scale {
  :where([data-qm-root]) {
    /* Resolved poles — each dial's default stated ONCE. */
    --_qm-bg: var(--qm-bg, #fff);
    --_qm-fg: var(--qm-fg, #1a1a1a);
    --_qm-accent: var(--qm-accent, #2563eb);
    --_qm-danger: var(--qm-danger, #c5221f);
    --_qm-warning: var(--qm-warning, #b25000);
    --_qm-font: var(--qm-font, ui-sans-serif, system-ui, sans-serif);
    --_qm-font-mono: var(--qm-font-mono, ui-monospace, monospace);

    /* The rungs, derived from the poles — the oklab math is unchanged. */
    --_qm-surface: var(--_qm-bg);
    --_qm-border: color-mix(in oklab, var(--_qm-bg), var(--_qm-fg) 17%);
    /* …the remaining 35 rungs… */

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

**Resolved poles are the load-bearing move.** `var(--qm-bg, #fff)` appears six
times in the current derivation and `--qm-fg` seven; collapsing them to
`--_qm-bg` / `--_qm-fg` states each default once and lets the dark block retune
two declarations. It also keeps a consumer's ancestor `--qm-bg` winning in both
light and dark — a naive `@media` block setting `--qm-bg` on the root element
would beat the consumer's inherited value and silently break the contract.

**The root rule carrying real properties** is what fixes `--qm-font` structurally.
`font-family` on `[data-qm-root]` reaches all five roots at once; no component has
to remember a line.

### 2. Dials — eleven, differently composed

Drop **`--qm-font-scale`**: a typographic ratio no consumer turns, read three
times and only inside the derivation. It becomes a private constant.

Add two that are load-bearing today:

- **`--qm-font-mono`** — three sites already hard-code `ui-monospace, monospace`.
- **`--qm-color-scheme`** — the native-UI hole above. Defaults to `light dark`.

Final set: `bg`, `fg`, `accent`, `danger`, `warning`, `color-scheme`, `font`,
`font-mono`, `font-size`, `radius`, `space`. Five hues, one scheme, two families,
one size anchor, two geometry.

`--_qm-paper` (the preview page's fill, currently `--_qm-surface` via
`paint.ts:76`) stays a **rung, not a dial** — the first promotion candidate if a
consumer wants a light page under dark chrome, but not a decision to force at v1.

### 3. No `@property` — the idea does not survive probing

`@property` requires an `initial-value` that is **computationally independent**.
`rem` and `em` are not, so `@property --qm-space { syntax: "<length>";
initial-value: 0.25rem }` is invalid and the whole rule is dropped **silently** —
no console error, no partial effect; the dial simply behaves as unregistered.
`CSS.registerProperty` says it out loud where the at-rule does not:
`SyntaxError: The initial value provided is not computationally independent.`

Two of the three dials worth registering (`--qm-space` at `0.25rem`,
`--qm-font-size` at `0.875rem`) default in `rem` deliberately, so they scale with
the user's font-size preference. Trading that for `px` to buy type-checking is an
accessibility regression for a lint-shaped benefit. Only `--qm-radius` (`8px`) is
registrable, and one registered dial out of eleven is not worth the asymmetry —
worse, it is a trap: changing that default to `0.5rem` later kills the
registration with no signal.

So the fallback pattern (`var(--qm-space, 0.25rem)`) is used uniformly, resolved
once into a pole rung. **The residual risk is accepted and unmitigated**: a
consumer writing `--qm-space: 4` (unitless) poisons the `calc()` chain and
collapses every padding to `0px`, silently. Document it in `THEMING.md`; there is
no CSS-level guard.

### 4. Layering

`@layer qm.scale, qm.chrome`, component styles inside `qm.chrome`. Unlayered
consumer CSS then wins with no `!important` and no specificity contest. This is
CodeMirror's `baseTheme`/`theme` precedence split, in its native CSS form; it is
the only idea worth importing from CM6's theming API, which is otherwise a poor
fit (it trades away the cascade, needs a public class contract this project
declines, and injects at runtime).

Layering does **not** open the rungs to an ancestor override, and should not be
described as if it does. `:where([data-qm-root])` declares each rung *on the root
element*, and an element's own declaration beats an inherited value at any
specificity — a consumer's `.my-app { --_qm-border: … }` is simply ignored. The
escape hatch is targeting the root itself (`.my-app [data-qm-root] { --_qm-border:
… }`), which is unlayered and does win. That is the right shape: the rungs stay
non-contractual, and reaching them takes deliberate aim rather than a stray
ancestor declaration.

## Work items

**W0 lands first and alone.** W1–W3 are the core and land together; W4–W8 are
independent and can land in any order.

**W0 — Collapse before extending.** Three subtractive changes, each independent of
the rework and landable today. They exist because the rework's own items would
otherwise pay a duplication cost instead of removing it — W3 adds rules to a lint
suite that is over-split, and W8 edits five files to change one number.

- **One gate, not three.** `check-geometry` (28 lines), `check-type` (35), and
  `check-theme` (85) are the same rule — *read a rung, do not mint a value* — split
  by CSS property category, and they already share `style-lint.mjs` (92 lines).
  That split is chronological, not principled: geometry landed with #46, type with
  #61, colour with #79. Merge them into one `check:style` driven by a
  property→axis table. 240 lines guarding 852 lines of component CSS is the ratio
  to bring down, and afterwards W3 is one edit rather than a choice about which
  script owns the canon scan.
- **State the dial set once.** The count is asserted in five files — `THEMING.md`
  (twice), `ARCHITECTURE.md`, `VISUAL_EDITOR_UIUX.md`, `AESTHETIC.md`, and
  `SURFACES.md`. `THEMING.md` owns it; the others reference the contract without
  restating its size. Canon naming *individual* dials stays — `SURFACES.md`
  §Rhythm saying which dials feed which axis is load-bearing, and W3's canon scan
  keeps those names honest. It is the number that is duplicated, and the number is
  why a dial change costs five prose edits.
- **Drop the permanence framing.** `THEMING.md` and `SURFACES.md` §"Preventing
  drift" justify the minimal surface with "a public token is a permanent promise."
  The package is `0.0.0` with no consumers, so that cost is not yet real and the
  doctrine is priced as though it were. Keep the small surface — it is right on its
  own merits — and state the reason as design economy rather than compatibility.

*Acceptance*: `npm run check:style` replaces three scripts with no loss of
coverage (every current violation still fails); the dial count appears in one file.

**W1 — Transport.** Port `SCALE` to `core/theme.css` with resolved poles,
`@layer qm.scale`, the root property block, and the dark default. Delete
`core/theme.ts` and the `QM_THEME` export. Swap `style={QM_THEME}` for
`data-qm-root` on `VisualEditor`, `Preview`, `SourceView`, `FormatPopover`, and
`EnumField`'s listbox. Drop `font-family` from `VisualEditor.svelte:577`.
*Acceptance*: `e2e/editor.spec.ts:103`'s root walk passes unchanged; the two
portaled surfaces resolve `--_qm-ink` **and** a non-`body` `font-family`.

**W2 — Dials.** Add `--qm-font-mono` and `--qm-color-scheme`, retire
`--qm-font-scale` to a constant, tokenize the three mono literals. Rewrite
`THEMING.md`'s dial table to the eleven. *Acceptance*: the dial census passes in
both directions against the new table.

**W3 — Gate rules.** Three rules added to the single gate W0 leaves behind:
- The dial census scans `prose/canon/**` as well as `THEMING.md`, so a dead token
  name in canon fails CI. This is what prevents the rot recurring.
- `font-family` enters the type axis (currently out of scope by its own header),
  closing the mono literals for good.
- Moving to CSS loses the `SCALE` object's duplicate-key-is-an-error property.
  Replace it with a duplicate-`--_qm-x`-definition check over `theme.css`. This is
  a real cost of the move and the mitigation is cheap; do not skip it.

**W4 — Source view highlight style.** Replace `defaultHighlightStyle`
(`view.ts:66`) with a `HighlightStyle.define` mapping Lezer tags to rungs, and
extend the existing `EditorView.theme()` at `view.ts:70` to cover `.cm-activeLine`.
CodeMirror emits `var()` references into its generated CSS untouched, so the rungs
still resolve through the cascade and dark mode needs no second theme. *Acceptance*:
flipping the poles inverts the markdown token colours with no JS.

**W5 — ProseMirror base stylesheet.** Import
`prosemirror-view/style/prosemirror.css` from `visual/index.ts`; override
`.ProseMirror-selectednode`'s `#8cf` outline with `--_qm-accent` in `qm.chrome`;
remove the hand-copied `white-space`/`word-wrap` rules from `ProseField.svelte:88`
and `ProseArrayElement.svelte:78`. *Acceptance*: list markers position correctly
(the dropped `li { position: relative }`), node selection reads in the theme hue.

**W6 — Portal targets.** A live bug, independent of the transport and not fixed
by it: the two portaled surfaces mount at `document.body`, so they inherit the
dials from `<body>` — not from the consumer's wrapper around the editor. A
consumer who themes *one pane* rather than the whole document gets a light popover
and a light listbox over a dark editor, and `THEMING.md`'s "set them on any
ancestor of a mounted surface" is false for two of the five roots.

Fix: pass the editor root as the portal target (`bits-ui`'s `Portal` takes
`to?: Element | string`) so the content descends from `[data-qm-root]` and
inherits the dials. Probed — see §Probed — including the clipping risk that
portaling to `body` exists to avoid. Prefer resolving the target from the trigger
(`closest('[data-qm-root]')`) over a hard-coded `'.qm-editor'`, so a surface
mounted outside the editor still lands somewhere themed, and fall back to `body`
when there is no root ancestor. *Acceptance*: a dial set on the editor's wrapper
reaches both portaled surfaces; both stay unclipped inside the split pane, at
narrow widths, and near the viewport edge.

**W7 — Root passthrough.** With `style` freed, give the three mounted roots
`class` and `style` props. Small, and the reason W1 is worth doing beyond theming.

**W8 — Canon.** After W0 this is `THEMING.md` plus the two paragraphs that
describe the *mechanism* — `ARCHITECTURE.md` §Theming and `SURFACES.md` §"The
scale in code", both of which name `core/theme.ts` applied as a `style` attribute
and are false the moment W1 lands. `VISUAL_EDITOR_UIUX.md` and `AESTHETIC.md`
carry only the count, so W0 already retired their edits. The replacement prose is
written out in §"The canon rewrite (W8)" — drop it in rather than re-deriving it.
Per `CLAUDE.md` this lands in the **same commit** as the code it describes, not
after; retire this plan file in that commit.

## Probed

Chromium 141.0.7390.37 (the preinstalled browser), Svelte 5.56.5, this repo's
`svelte-package`. Each row is a mechanism the plan depends on, run rather than
reasoned about.

| Assumption | Result |
|---|---|
| `@layer` survives Svelte's scoped `<style>` | **Holds.** The hash lands on selectors *inside* the at-rule (`.qm-card.svelte-rrodk0`), and unused-selector detection still works within the layer. `qm.chrome` is safe. |
| `svelte-package` carries a side-effect CSS import | **Holds.** `dist/core/theme.css` is copied, `import './theme.css';` survives at the head of `dist/core/index.js`, `publint` clean. |
| Consumer's ancestor dial beats the shipped dark default | **Holds, in both schemes.** With no consumer value: `#fff` light, `#14171c` dark. With `--qm-bg` on an ancestor: the consumer's value in *both*. The resolved-poles pattern is what makes this work — a dark block setting `--qm-bg` on the root would clobber the consumer instead. |
| Unlayered consumer CSS beats `@layer qm.chrome` | **Holds.** No `!important`, no specificity contest. |
| `@property` type-checks the `<length>` dials | **Fails.** `rem`/`em` initial values are not computationally independent; the at-rule is dropped silently. Dropped from the plan — §3. |
| A rung can be overridden from an ancestor | **Fails, by design.** The root's own declaration beats inheritance; only `[data-qm-root]`-targeted rules land — §4. |
| Portaled surfaces inherit a scoped dial | **Fails — a live bug.** Editor root resolved `rgb(0,0,40)`; the listbox, mounted at `BODY`, resolved `#fff`. W6. |
| Portaling to the editor root fixes it without clipping | **Holds.** Listbox resolves the consumer's dial, lands over its trigger, no ancestor clips it inside the split pane. |

Probes were run against the playground and discarded; nothing from them is
committed. The portal case (W6) is worth keeping as an e2e test when it lands —
`e2e/editor.spec.ts:103` walks the roots for a *resolved* scale, which passes
today precisely because the portaled roots resolve the **default** scale.

## What does not change

The oklab `bg → fg` / `fg → bg` derivation and its calibrated percentages; the
rung vocabulary and names; per-root re-derivation (the reason a root marker exists
at all — rungs minted at `:root` would compute against `:root`'s dials and defeat
both per-pane theming and an ancestor dark class); the gate discipline — one
script after W0, the same rules; the e2e root walk. This is a
transport-and-composition change, not a redesign.

## Costs to accept, explicitly

- **Browser floor becomes explicit**: `@layer` (2022) and `color-mix` (2023), both
  Baseline. `THEMING.md` should state it rather than let a consumer discover it.
- **A unitless dial still fails silently** (`--qm-space: 4` → every padding `0px`),
  since `@property` cannot guard the two `rem`-defaulted dials. Documented, not
  fixed.
- **Eleven dials is a wider surface than ten**, and W0 removes the argument that
  made width automatically expensive — at `0.0.0` with no consumers, a dial is not
  yet a permanent promise. The cost is comprehension, not compatibility: every dial
  is one more thing a reader must hold. `--qm-font-mono` pays for itself against
  three existing literals; `--qm-color-scheme` is the weaker case — arguably the
  consumer's job — and is the one to re-argue before W2 lands.
- **The scale stops being introspectable from JS.** Nothing reads it today.

## The canon rewrite (W8)

Drop-in prose for every doc the rework falsifies, written against the finished
state (all of W1–W7 landed). It lands in the **same commit** as the code, per
`CLAUDE.md` — canon that describes an unbuilt design is worse rot than canon that
describes an old one. Retire this file in that commit.

Three files, because W0 already moved the dial count into `THEMING.md` alone: what
is left in canon is the two paragraphs describing the **mechanism**, which W1
falsifies. `VISUAL_EDITOR_UIUX.md` and `AESTHETIC.md` are listed below in their
W0 form — reference, no number — so a reader landing here after W0 sees the state
to check rather than an edit to make. `INDEX.md` needs no change: it points at
`THEMING.md` naming neither.

Check both directions after: the dial census covers `prose/canon/**` once W3
lands, so a dial named in canon must be one of the eleven, and `--qm-font-scale`
surviving anywhere fails CI.

### `THEMING.md` — replace the whole file

````markdown
# Theming

`@quillmark/editor` ships **complex UX over a thin skin** (VISUAL_EDITOR_UIUX
§"Complex UX, minimal UI"): the surfaces carry the behavior — direct
manipulation, the caret bridge, per-field state — against a neutral, overridable
visual baseline a consumer restyles to its brand without fighting baked-in
design.

The whole contract is **eleven CSS custom properties**. They are dials, not a
palette: each derives a closed private scale (`--_qm-*`) that every component
reads, so one override rescales or recolors the whole surface. Set them on any
ancestor of a mounted surface — the app, or one pane:

```css
.my-editor {
	--qm-bg: #fff;
	--qm-fg: #10233b;
	--qm-accent: #6d28d9;
	--qm-font: 'Inter', system-ui, sans-serif;
}
```

## The dials

| Token              | Default                                | What it sets                                                                   |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------------ |
| `--qm-bg`          | `#fff`                                 | Base surface. Cards, fields, the painted page, and the popover step off it.    |
| `--qm-fg`          | `#1a1a1a`                              | Base ink. Body text, labels, borders, and shadows step off it.                 |
| `--qm-accent`      | `#2563eb`                              | Focus rings, active marks, the preview's active field box.                     |
| `--qm-danger`      | `#c5221f`                              | Error diagnostics, the required marker, the delete glyph.                       |
| `--qm-warning`     | `#b25000`                              | Warning diagnostics.                                                            |
| `--qm-color-scheme`| `light dark`                           | Native UI — scrollbars, the date picker, the caret. Pin it if you pin a palette.|
| `--qm-font`        | `ui-sans-serif, system-ui, sans-serif` | The editor surface's font family.                                              |
| `--qm-font-mono`   | `ui-monospace, monospace`              | The monospace face — the JSON array control, the tips card, the title mirror.  |
| `--qm-font-size`   | `0.875rem`                             | Body text — the anchor the ramp derives up (title) and down (label/meta) from. |
| `--qm-radius`      | `8px`                                  | Card & popover corner. Interior controls derive a tighter tier (half).         |
| `--qm-space`       | `0.25rem`                              | Spacing base. Gaps and insets are `half`/`1×`/`2×`/`3×`/`4×` multiples of it.  |

Give a length dial a length. `--qm-space: 4` parses as a valid custom property but
poisons every `calc()` that reads it, collapsing the surface's padding to zero —
CSS registration cannot guard a `rem`-defaulted dial, so nothing catches this but
you.

## Dark mode is a two-value swap

Surfaces step `bg → fg` and ink steps `fg → bg`, mixed in **oklab** — so
inverting the two poles inverts the whole scale, including borders, the popover's
translucent fill, the source view's syntax colours, and the page shadow (which
mixes from the ink pole rather than from black, and so does not become a smudge on
a dark surface).

The package ships a dark default under `prefers-color-scheme: dark`; a consumer
that sets the poles wins over it in both schemes, so a fixed palette stays fixed:

```css
@media (prefers-color-scheme: dark) {
	.my-editor {
		--qm-bg: #14171c;
		--qm-fg: #e8eaed;
	}
}
```

No JS runs: the derivation is emitted as `var()` references, so an ancestor rule
or a media query resolves through the cascade at paint time. There is no `dark`
prop and no mode toggle in the package — the consumer's palette decides.

## What is deliberately not public

The derived scale — surface / border / ink rungs, the blur radius, the popover's
translucency ratio, the recede-opacity ladder, the overlay ring widths — is
**internal** (`--_qm-*`, minted in `core/`). It is not a contract: a rung can be
re-tuned or renamed without notice. It is minted on the root element itself, so an
ancestor declaration does not reach it; a rule targeting `[data-qm-root]` does, and
is unsupported on the same terms.

A knob is promotable to a dial the day a real consumer needs it — a public token is
a permanent promise, so the surface stays the minimum that makes a palette swap
work.

## Requirements

`@layer` and `color-mix()` — Baseline since 2022 and 2023. The stylesheet is
imported by the package itself; there is no CSS file to remember.

`npm run check:style` gates all of it: no component may mint a colour, shadow, or
opacity literal; nothing outside the derivation may define a `--_qm-*`; and the
consumed dial set must match this document and `prose/canon/` exactly, in both
directions.
````

### `prose/canon/ARCHITECTURE.md` §Theming — replace the first paragraph

```markdown
The surfaces carry the behavior against a neutral, overridable baseline — the
`--qm-*` dials a consumer overrides on any ancestor (VISUAL_EDITOR_UIUX §"Complex
UX, minimal UI"), deriving the private `--_qm-*` scale every component reads. The
contract is the package's [`THEMING.md`](../../THEMING.md); the derivation is a
stylesheet in `core/`, imported by the one module both `preview/` and `visual/`
already pull, and applied wherever a `data-qm-root` marker sits. A stylesheet
rather than an inline attribute is what lets the scale carry a shipped dark
default, a precedence layer consumer CSS beats without `!important`, and the
baseline `font-family` every root inherits.
```

### `prose/canon/VISUAL_EDITOR_UIUX.md` §"Complex UX, minimal UI" — W0 form, verify only

```markdown
appearance is a themeable surface with a neutral, overridable baseline — the
`--qm-*` dials deriving a closed private scale ([`THEMING.md`](../../THEMING.md)).
```

### `prose/canon/SURFACES.md` §"The scale in code" — replace the paragraph

```markdown
**The scale in code.** All three axes are public dials deriving a closed private
scale ([`THEMING.md`](../../THEMING.md)) — geometry (`--qm-radius`, `--qm-space`),
type (`--qm-font-size`), and colour (`--qm-bg`, `--qm-fg`, and the three status
hues, which step surfaces `bg → fg` and ink `fg → bg` in oklab). The derivation is
minted ONCE, as a stylesheet in `core/` the package imports itself, and applies to
every element marked `data-qm-root` — the editor, the portaled popover and select
list, the preview, and the source view, none of which descend from the others. The
root rule carries the baseline `font-family`, `color`, and `color-scheme` too, so a
new root inherits the type and native-UI baseline by carrying the marker rather
than by remembering a declaration. Component chrome sits in a cascade layer beneath
consumer CSS. A component reads a rung, never a literal; `check:style` gates all
three axes, so an in-between value fails CI, not just review.
```

`SURFACES.md` §"Preventing drift" also carries the count and the permanence
clause; W0 replaces that bullet with the design-economy form.

Note the type axis loses `--qm-font-scale`: the ratio between adjacent rungs is a
private constant, not a dial.

### `prose/canon/AESTHETIC.md` §"Neutral baseline" — W0 form, verify only

```markdown
monochrome-and-whitespace hierarchy. The surface is a small dial set deriving a
closed private scale, so a restyle is a handful of values and dark mode is two of
them
```
