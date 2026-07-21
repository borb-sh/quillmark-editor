# Web-app VisualEditor — UI/UX findings

What: a study of tonguetoquill web-app's VisualEditor and its design system, read
against `@quillmark/editor`'s current baseline, to steer the refinement of the
out-of-the-box chrome. Web-app is the mature editor these surfaces descend from;
[VISUAL_EDITOR_UIUX.md](../canon/VISUAL_EDITOR_UIUX.md) already carries its
structural moves — the card stack, card controls, the `ui.group`/`ui.compact`
density system, the selection popover. The settled visual doctrine this study
produced lives in canon: [AESTHETIC.md](../canon/AESTHETIC.md) and
[SURFACES.md](../canon/SURFACES.md). This page is the source material and the
gap-by-gap direction behind them.

Not canon: it holds current-baseline gaps and proposed direction, kept here until
the baseline is brought into line.

## Where the baseline stands

The library ships complex UX over a thin skin, and the skin is currently
un-authored. There is no `:root`, no default stylesheet: every token is consumed
as an inline `var(--qm-…, <hardcoded>)` fallback duplicated across ~14 components,
and the fallbacks are the theme. Consequences a refinement pass targets:

- **Boxes inside boxes.** Every field and the body prose leaf is a bordered box
  nested in a bordered card; `ui.group` sections add bottom-border dividers. The
  look is dense and boxy, with no elevation beyond the popover shadow.
- **`--qm-border` is six different greys** in practice (`#e2e2e2` card, `#d4d4d4`
  inputs/prose, `#ececec` section rule, `#c4c4c4`/`#b8b8b8` add-dashes, `#e0e0e0`
  object rail), contradicting THEMING.md's "one shared chrome border."
- **Radius is unsystematic** — 8/6/4/3px, no token.
- **No focus rings on the editing surfaces.** `ProseField` forces `outline: none`
  with no replacement; scalar inputs rely on browser defaults.
- **The active card is nearly invisible** — the `active` state only pins the
  reorder chevrons; no border/background/accent distinguishes it.
- **Native and glyph controls.** Booleans are a raw checkbox; reorder/delete are
  Unicode `▲▼✕`; mark buttons are the text `B I U S <> #`.
- **~8 ad-hoc font sizes** (`0.68`–`1rem`), no scale.

## Why web-app reads as refined

The refinement is codified, not hand-tuned. Four artifacts do the work, and they
are the real lesson:

- **A written aesthetic north-star** (web-app `prose/canon/AESTHETIC.md`):
  "modern paper — monochrome, typographic, restrained; hierarchy from type and
  whitespace, not color, badges, or icon chrome," plus "icons encode identity or
  function, never decoration." Carried into [AESTHETIC.md](../canon/AESTHETIC.md).
- **A written surface/spacing doctrine** (web-app `SURFACES.md`): elevation rule,
  a closed padding scale, a radius tier, one vertical-rhythm gap. Carried into
  [SURFACES.md](../canon/SURFACES.md).
- **One shared popout recipe** — web-app's `.overlay-surface` class is the single
  definition of floating-popout chrome; every popover/tooltip/select/menu is that
  class, so it cannot fork. quillmark re-implements popover chrome ad hoc and
  copy-pastes `.qm-input` across three field files.
- **Systematic token scales** — a calc-based radius (`--radius` 10px base, derived
  `sm 6 / md 8 / lg 10 / xl 14`), a closed padding set (`none / sm 12px / md 16px`),
  a single `gap-1.5` (6px) between stacked regions everywhere, a 48px chrome grid.

## Learnings, by theme

Each: web-app pattern → quillmark baseline → direction. `[carried]` = already in
canon, refine it; `[additive]` = new, aligned with canon; `[don't chase]` =
deliberately out of V1 scope.

### 1. Borderless body — elevation, not borders `[carried]`

Web-app's `EditorBlock` is `border: none` + a soft shadow, with at most a hairline
`color-mix(--color-border 50%, transparent)`; the body ProseMirror has no border
and `outline: none` — text on the card surface, set off from the metadata by a
faint `border-t border-border/30`. quillmark borders the card, every field, and
the body (an identical box to a text input). Direction: card as the one elevated
container; strip the body's border; reduce fields to a hairline or underline; one
`--qm-border`. This is the SURFACES.md elevation rule.

### 2. Symmetric spacing rhythm `[carried]`

Web-app's "refinement" is disciplined symmetry: `EditorBlock` content padding
`.5rem` and the ProseMirror body's `.5rem` stack to a uniform `1rem` inset on every
side, so body-shown and body-hidden cards stay symmetric; every left edge aligns to
one gutter. quillmark hand-tunes gaps per component (`0.2`–`0.7rem`). Direction: a
small closed spacing scale as tokens; card + prose insets stack to a uniform inset;
one left gutter. SURFACES.md §Rhythm.

### 3. Collapsible field sections `[additive]`

The biggest available UX upgrade, and absent today. Web-app's `SchemaForm` groups
fields by `ui.group` and renders each through a `CollapsibleSection` accordion —
a single `expandedGroup` (one open at a time), a `ChevronRight` that rotates 90°
and colors to `primary`, a 200ms slide, an accent left-divider when open, and
auto-expand of the sole group. quillmark's sections are static labeled dividers
that never toggle; the only `<details>` is the unused multi-kind add menu.
Direction: promote `ui.group` sections to a collapsible accordion, keeping the
compact grid already carried. A one-line note in VISUAL_EDITOR_UIUX §Fields when
it lands.

### 4. Type ramp and icons `[carried]`

Web-app: 15px body prose; a tidy ramp (`text-sm` 14 headers/labels, `text-xs` 12
meta; weight `600`/`500`); Lucide icons at `h-3`/`h-3.5`/`h-4`. quillmark: 8+
ad-hoc sizes, Unicode glyphs, text mark buttons, and a label-weight mismatch
(object labels are not bold where field labels are `600`). Direction: a 3–4 step
type scale as tokens with a weight convention; adopt an icon set (Lucide
tree-shakes) or normalize glyph sizing. Fonts stay on the system stack — the lesson
is a defined ramp, not web-app's branded Lato.

### 5. Focus and active affordance `[carried]`

Web-app: the active/focused card lifts (shadow on `:focus-within`/`.is-active`); a
capture-phase click sets the active card before any child `stopPropagation`;
controls draw `focus-visible` rings off `--color-ring`. quillmark: the active card
only pins its chevrons, and there are no focus rings on prose or inputs. Direction:
a subtle active-card accent, and a `--qm-field-ring`-keyed focus ring on prose
leaves and scalar inputs — the missing ring is a keyboard-accessibility hole, not
only polish. SURFACES.md §"Focus and active state".

### 6. Quiet insert affordances `[carried]`

Web-app's `AddCardTrigger` is invisible (opacity 0) until hover — a 1rem-tall thin
pill — and only the last trigger shows a dim (0.35) "＋ Add Card" label, so exactly
one entry point is visible; touch gets a 0.3 always-on fallback. quillmark shows an
always-on dashed `+ Add {kind}` button between every block. Direction: the quieter
recede-until-hover pattern, which serves the minimal-UI mandate — the stack reads
as content, not a toolbar per gap.

### 7. Selection popover refinement `[carried]`

Web-app's `SelectionToolbar` is a translucent pill (`color-mix(--color-primary 80%)`
+ `backdrop-blur`), top-center anchored with a flip-below near the viewport top,
portaled, a scale-in enter animation, Lucide icons, and dismiss on
scroll/keydown/resize/focusout; disabled on touch in favor of an accessory bar.
quillmark's `FormatPopover` is a plain bordered white box with text-glyph buttons.
Direction: icons over glyphs; the pill/blur aesthetic; the enter animation and
top-flip. The touch accessory-bar path is already in VISUAL_EDITOR_UIUX §Formatting.

### 8. Inline-editable title `[carried]`

Web-app's `InlineEditableTitle` sizes an input from a hidden sizer span so it grows
with the text, selects-all on entry, commits on Enter / reverts on Escape — it reads
as text that becomes editable. quillmark's card title is an always-visible input
with a transparent border that appears on hover. Direction: the sizer-driven
pattern removes a persistent input box from every card header.

### 9. Placeholder — keep the principled version

Web-app rotates playful copy (`getRandomMessage('placeholder')`: "Off we go…",
"Full send…"). quillmark shows the schema `default:` as a ghost, never written back
— more principled and already canon (VISUAL_EDITOR_UIUX §Fields). Direction: keep
the schema-default ghost; give the empty-body placeholder the same italic/dim
treatment. Do not adopt the random copy.

### 10. Playground split shell — first impression

Web-app's resizer (`resizable-split.svelte.ts`) is a 3px line that thickens to
5.5px on hover/drag with an ellipsis grip, a drag dead-zone, a 30–70% clamp, and a
body `cursor`/`user-select` lock while dragging. quillmark's `editor/+page.svelte`
is a plain `grid 1fr 1fr` with hardcoded pane borders (`#e2e2e2`/`#ccc`) that
disagree with each other and the library tokens. The split shell is the consumer's
per ARCHITECTURE.md, but the playground is the out-of-the-box first impression, so a
refined reference resizer sets the tone. Lower priority than 1–5.

## Token scales worth mirroring

Steal the structure, not the brand values.

| Dimension        | web-app                                                          | quillmark baseline           | Direction                                   |
| ---------------- | --------------------------------------------------------------- | ---------------------------- | ------------------------------------------- |
| Radius           | calc off one base: `10px`, `sm −4→6`, `md −2→8`, `lg 10`, `xl 14` | `8/6/4/3px`, untokened       | one `--qm-radius` base + a derived step     |
| Padding          | closed set `none / sm 12px / md 16px` (tooltip 8, sheet 24 named) | per-component `0.3`–`1rem`    | a closed spacing scale, not free values     |
| Vertical rhythm  | a single shared `gap 6px` on every stacked surface              | per-component `0.2`–`0.7rem`  | one gap token for stacked regions           |
| Chrome grid      | everything snaps to a 48px square                               | none                         | one module for control heights              |
| Type             | Lato ramp: `lg` → `sm 14` → `xs 12`, weight `600`/`500`         | 8+ sizes, no scale           | 3–4 steps + a weight convention             |
| Icons            | `@lucide/svelte`, à la carte, `h-4 w-4`                         | Unicode `▲▼✕`, text marks     | adopt an icon set                           |
| Theme            | semantic tokens toggled by one `.dark` class, dark-default      | no `:root`, no theme         | author the baseline first; dark stays deferred |

Two caveats: web-app's fonts (Lato/Crimson/Courier) are a brand choice loaded from
Google Fonts — quillmark stays on the system stack. And web-app has no shadow-token
scale (it leans on Tailwind's `shadow-*`); since elevation becomes quillmark's
primary container signal, define 2–3 `--qm-shadow-*` tokens and go one step further.

## Priority

1. Author the aesthetic + surface baseline (AESTHETIC.md, SURFACES.md) as one
   self-consistent `--qm-*` stylesheet — closes the six-border inconsistency and
   unblocks everything.
2. Elevation + stacking rhythm (§1, §2) — delivers the borderless body and symmetry.
3. Collapsible sections (§3).
4. Focus rings + active affordance (§5) — polish plus an accessibility fix.
5. Type ramp + icons, quiet add affordance, popover icons, inline title (§4, §6–8).
6. Playground shell (§10).

## Not carried (by design)

Named in VISUAL_EDITOR_UIUX.md, so the study does not chase them:

- **Tips card** (web-app's amber typewriter slip) — no separate tips surface in V1.
- **Drag-to-reorder** — rejected; the chevrons already do the job.
- **Table / island authoring** — deferred behind the post-V1 position anchor.
- **Broad theming system** (semantic scales, part hooks, dark mode) — deferred.
  Do the baseline consolidation, not the full system.
