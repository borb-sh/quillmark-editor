# Theming API rework

> **Plan tier** — the target shape, not what ships. Canon (`prose/canon/`,
> `THEMING.md`) describes the current API; this describes what replaces it and the
> order to build it in. Retire this file when the last work item lands, rewriting
> canon in the same commit.

## TL;DR

The derivation math is right and stays. Everything wrong with the theming API
traces to one choice — **the scale is a JS string applied as an inline `style`
attribute** (`core/theme.ts`) — and replacing that transport with a real
stylesheet the library imports itself unlocks six fixes at once: a shipped dark
default, `@layer` precedence for consumer overrides, `@property` type-checking,
`font-family` reaching every root, the freed `style` attribute, and the collapse
of the repeated `var(--qm-bg, #fff)` fallbacks.

Two dependency-owned surfaces (CodeMirror's highlight style, ProseMirror's base
stylesheet) are themed surfaces the lints structurally cannot see; they land as
their own work items.

## Why

Evidence, all current as of this branch:

| Finding | Evidence |
|---|---|
| The transport cannot express `@media`, `@layer`, or `@property`. `THEMING.md` hands dark mode to the consumer as homework because an inline attribute has no other option. | `core/theme.ts:6-13` |
| `--qm-font` is one of ten dials and reaches one of five roots. The two portaled surfaces render at `document.body`'s font; the preview and source view set no family. | `VisualEditor.svelte:577` is the only `font-family: var(--qm-font, …)` |
| Three mono literals are un-tokenized, and `check:type` cannot see them — `font-family` is explicitly out of its scope. | `Card.svelte:537`, `TipsCard.svelte:101`, `ArrayField.svelte:185` |
| Nothing sets `color-scheme`, so a dark editor keeps light native scrollbars, date picker, and caret. | absent from `SCALE` |
| The source view's syntax colours are CodeMirror's light-tuned defaults (`#708`, `#219`, `#164`, `#a11`, `#e40`, `#00f`, `#404740`), invisible to `check:theme` because they live in `node_modules`. | `source/view.ts:66` |
| `prosemirror-view/style/prosemirror.css` is never imported; two of its rules are hand-copied into the leaves, dropping `li { position: relative }` — which the list schema needs — plus the selection-hiding, ligature, and separator-img rules. Its `.ProseMirror-selectednode` outline is a hard `#8cf`. | `ProseField.svelte:88`, `ProseArrayElement.svelte:78`, `schema.ts:80-94` |
| `check:theme` rule 2 scans only `THEMING.md`, so the canon docs a reader hits first rotted to 11 dead token names across 17 citations. | `check-theme.mjs:68-70` (rewritten in this branch's canon commit; the gate hole remains) |
| The rungs are inline styles, near the top of the cascade — a consumer override needs `!important`. | `QM_THEME`, 37 rungs / 2060 bytes, restamped per root |
| The roots take no `class`/`style` passthrough, because `style` is occupied. | `Preview.svelte:21-28` |

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
  @property --qm-space     { syntax: "<length>"; inherits: true; initial-value: 0.25rem; }
  @property --qm-radius    { syntax: "<length>"; inherits: true; initial-value: 8px; }
  @property --qm-font-size { syntax: "<length>"; inherits: true; initial-value: 0.875rem; }

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

### 3. Registration, narrowly

`@property` on the three `<length>` dials only, where a bad value silently poisons
a `calc()`. Deliberately **not** on the colours: a registered property with an
`initial-value` always resolves, which kills the `var(--qm-bg, …)` fallback the
shipped dark default depends on. Type-safety and defaulting want opposite things,
and they want them on disjoint sets — `<length>` dials feed `calc()`, colour dials
feed `color-mix`, which fails soft.

### 4. Layering

`@layer qm.scale, qm.chrome`, component styles inside `qm.chrome`. Unlayered
consumer CSS then wins with no `!important` and no specificity contest. This is
CodeMirror's `baseTheme`/`theme` precedence split, in its native CSS form; it is
the only idea worth importing from CM6's theming API, which is otherwise a poor
fit (it trades away the cascade, needs a public class contract this project
declines, and injects at runtime).

## Work items

Ordered; W0 gates the shape, W1–W3 are the core and land together, W4–W7 are
independent and can land in any order.

**W0 — Verify `@layer` inside Svelte scoped `<style>`.** Wrap one component's
rules in `@layer qm.chrome { … }` and confirm the scoping hash still applies to
selectors inside the at-rule, in both dev and `svelte-package` output. If it does
not hold, `qm.chrome` is dropped and only `qm.scale` is layered — the scale layer
is plain CSS in a plain file and is safe either way. **Do this before W1.**

**W1 — Transport.** Port `SCALE` to `core/theme.css` with resolved poles,
`@property`, `@layer qm.scale`, the root property block, and the dark default.
Delete `core/theme.ts` and the `QM_THEME` export. Swap `style={QM_THEME}` for
`data-qm-root` on `VisualEditor`, `Preview`, `SourceView`, `FormatPopover`, and
`EnumField`'s listbox. Drop `font-family` from `VisualEditor.svelte:577`.
*Acceptance*: `e2e/editor.spec.ts:103`'s root walk passes unchanged; the two
portaled surfaces resolve `--_qm-ink` **and** a non-`body` `font-family`.

**W2 — Dials.** Add `--qm-font-mono` and `--qm-color-scheme`, retire
`--qm-font-scale` to a constant, tokenize the three mono literals. Rewrite
`THEMING.md`'s dial table to the eleven. *Acceptance*: `check:theme` rule 2 passes
in both directions against the new table.

**W3 — Gates.** Three changes to the lint set:
- `check:theme` rule 2 scans `prose/canon/**` as well as `THEMING.md`, so a dead
  token name in canon fails CI. This is what prevents the rot recurring.
- `check:type` takes `font-family` into scope (its header currently excludes it),
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

**W6 — Root passthrough.** With `style` freed, give the three mounted roots
`class` and `style` props. Small, and the reason W1 is worth doing beyond theming.

**W7 — Canon.** Rewrite `THEMING.md`, `SURFACES.md` §"The scale in code",
`AESTHETIC.md` §"Neutral baseline", `ARCHITECTURE.md` §Theming, and
`VISUAL_EDITOR_UIUX.md` §"Complex UX, minimal UI" — each names "ten dials" and/or
`core/theme.ts` applied as a `style` attribute. Per `CLAUDE.md`, this lands in the
same commit as the code it describes, not after. Retire this plan file.

## What does not change

The oklab `bg → fg` / `fg → bg` derivation and its calibrated percentages; the
rung vocabulary and names; per-root re-derivation (the reason a root marker exists
at all — rungs minted at `:root` would compute against `:root`'s dials and defeat
both per-pane theming and an ancestor dark class); the three-gate discipline; the
e2e root walk. This is a transport-and-composition change, not a redesign.

## Costs to accept, explicitly

- **Browser floor becomes explicit**: `@layer` (2022), `color-mix` (2023),
  `@property` (2024). All Baseline, but `THEMING.md` should state it rather than
  let a consumer discover it.
- **Eleven dials is a larger permanent promise than ten.** Both additions are
  load-bearing today. `--qm-color-scheme` is the weaker of the two — it is
  arguably the consumer's job — and is the one to re-argue before W2 lands.
- **The scale stops being introspectable from JS.** Nothing reads it today.
