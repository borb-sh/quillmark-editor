# Surfaces

> **Implementation**: `src/lib/visual/`

## TL;DR

The visual chrome of the editor's surfaces — background, border, shadow, padding,
and radius — across the card stack, its fields and body, and the floating
selection popover. The visual language that motivates the choices (monochrome,
typographic, restrained) is [AESTHETIC.md](AESTHETIC.md); the public dials behind
the chrome are [`THEMING.md`](../../THEMING.md). Prior art is web-app, whose
`SURFACES.md` this carries.

Two orthogonal rules decide how a surface looks, each with a single source so a new
control inherits them instead of reinventing:

1. **Elevation** — is the surface in the document flow, or floating over it?
2. **Rhythm** — one closed spacing scale and one radius base, not a per-component choice.

## Elevation

The card is the container; nothing inside it is a second box.

- **The card stack is in-flow.** Every card carries one quiet edge — a single
  hairline at `--_qm-border`, not a hairline and a shadow — over
  `--_qm-surface-raised`. One tone and one border rung across all of them, `main`
  included, not a different grey per card. The card is the only container in the
  column.
- **A card's tone is the package's; the page behind it is not.** So no card takes a
  rung that reads only against a particular backdrop: plain `--qm-bg` behind the
  column is a supported case, and a card at the base surface is invisible in it.
  What the package guarantees is the card↔control relationship, which holds whatever
  is behind — a control is one rung off its card, always. `main` needs no tone to say
  which card it is: it is the only headerless card, the only one without
  reorder/delete, and the first in the column.
- **Fields sit quiet inside the card; the body is unframed.** A scalar control and
  an *inline* prose leaf each carry one hairline — the shared `--_qm-border` at
  `--_qm-radius-inner` over `--_qm-surface` (§"The shared recipe") — and nothing
  heavier: no fill, no shadow, no frame within the frame. The single hairline is the
  floor a control needs to read as editable and to host its focus ring (§"Focus and
  active state"); a *second* box inside it — a nested border, a filled panel — is
  the density the monochrome rule (AESTHETIC.md) removes. The **body takes no box at
  all**: it is the one surface in the card with no edge, which is what makes it read
  as the paper the card is printed on rather than as one more field. Being unframed
  is the statement, not a saving.
- **What the paper does to a block is a stroke or a face, never a panel.** The rule
  reaches inside the body too, over the nodes the codec emits (CODEC.md): a
  blockquote is an inset and one hairline, a horizontal rule is that same hairline,
  a code span or code block is `--_qm-font-mono` and nothing else. No fill, because
  a filled block on unframed paper is the second box this section removes — and
  there is no rung for one in any case: the card sits at `--_qm-surface-raised` and
  the only step above it is `--_qm-surface-hover`, the hover lane, so a chip at rest
  would read as a hovered button. What separates one block kind from the next is a
  stroke, a face, an inset off the space scale, or weight — the same four the chrome
  outside the body has.
- **The metadata bracket is strokes, not a box.** The card's chrome brackets the
  fields, and the body is what falls outside it: a rule under the card title, a rule
  dividing the fields from the body, and a left rule on the open section spanning its
  header and its panel. All three at `--_qm-border-width` in `--_qm-border` — the
  sameness is the whole effect, since a figure whose sides disagree on width or tone
  reads as unrelated lines rather than as one bracket. It stays a *bracket*: each
  horizontal is conditional on what it means, so the headerless `main` has no top
  rule and a bodiless card no bottom one, and the right side is never drawn. An open
  figure at the card's own gutter is not the second box this section forbids — a
  closed one would be.
- **The rungs step toward the ink, which the word "raised" only half means.** A card
  is *darker* than the page in light and *lighter* in dark: a tinted plate laid on
  the page, not a lit surface floating above it. The three surface rungs sit 4pp
  apart — the step at which a hovered item reads against a card — so each carries a
  plane on its own. "Elevated is lighter" in both poles needs a mode signal the
  derivation deliberately does not have (THEMING.md).
- **The floating surfaces earn the lift the cards do without**, in two shapes rather
  than one per component. **Translucent** — `--_qm-surface-popover` (the *raised*
  surface mixed toward transparent) behind a `--_qm-blur` backdrop, a hairline, and
  `--_qm-shadow-popover` — carries what floats over the content it is about: the
  selection popover, and the field-guidance popover, which adds only a measure and
  the meta type rung, since it holds prose where the other holds glyphs
  (VISUAL_EDITOR_UIUX §Fields). **Opaque** — the same shadow over `--_qm-surface` —
  carries the lists, the enum's and the card stack's kind menu (§"The shared
  recipe"): a row of choices reads through a blur worse than a row of glyphs does.
  All four sit over content with nothing behind them, and all four portal into the
  nearest `[data-qm-root]` rather than `document.body` — floating still leaves the
  editor's subtree, and the marker is what carries the consumer's dials back to it.

## The shared recipe

Chrome comes from the rungs applied one way, not hand-written per component. Four
recipes carry it, each **one rule in `visual/controls.css` a component opts into by
carrying its class** — the same shape as `.qm-focus-ring`, and for the same reason:
a rung fixes a value, but which declarations make a control cannot be assembled per
file and stay identical. Five hand-kept copies agree until one is edited, and
nothing raises it — no literal is minted, so `check:style` stays green while a
control renders subtly wrong.

- **`.qm-control-box`** — a typed value's box: `--_qm-surface`, one `--_qm-border`
  hairline, `--_qm-radius-inner`, `--_qm-text-body` at `--_qm-leading-body`, one
  padding rung, `--_qm-ink` for its text. Every scalar control and every prose leaf
  **except the body**, which the slot withholds it from (`ProseField`'s
  `unframed`). The predicate is the slot's, not the leaf's: a `richtext` field
  without `inline` is block prose and still a control in a row of controls, so
  only the caller that knows it is rendering the body can say so.
- **`.qm-icon-btn` / `.qm-add-affordance`** — the two button families; see below.
- **`.qm-menu-surface` / `.qm-menu-item`** — a floating list of choices: the enum's
  listbox and the card stack's kind menu. The surface takes the lift (§Elevation)
  and one inset; an item takes a padding rung, `--_qm-radius-inner`, and
  `--_qm-surface-hover` on `[data-highlighted]` — bits-ui's mark, and the only
  hover lane, since an item under the pointer and one under the keyboard cursor are
  one state to a menu and a `:hover` rule beside it would paint a second highlight
  the keyboard cannot reach. What a caller adds is its own: the listbox spans its
  trigger, scrolls past a screenful, and weights the value already stored.
- the two floating surfaces that are not lists — the selection popover and the
  field-guidance popover — take the translucent recipe above.

A palette change is then one dial, not one edit per field file. A control that mints
its own border grey or radius instead of reading the rung is the drift this prevents.

**A button reads the button recipe, and it is not the box.** A glyph or text button —
reorder, delete, array remove, the field label's guidance marker, both add
affordances, the tips foot — is ink on the
card: no resting border, no resting fill, `--_qm-surface-hover` arriving on hover,
`--_qm-radius-inner` (a pill on the add triggers, which fill rather than tint,
having no resting ink for a hover to shift). The distinction one recipe for both
would lose: *a field is a box because you type into it; a button is not a box
because you press it.* Destructive ink (`--_qm-danger`) stays — that is meaning, not
chrome. Both families clear WCAG 2.5.8's 24×24 off `--_qm-tap-min`: a threshold the
spec fixes rather than a step on the space scale, so it does not move when
`--qm-space` does, and `min-*` is outside every `check:style` axis — a second
expression of the same floor would have nothing watching it.

**Type is the button recipes' too, not the box's alone.** A UA button inherits
neither family nor size, so a button that declares no type renders in the UA face at
the UA size — the same failure the shared rule prevents for chrome, and quieter,
because an absence mints no literal: the gate stays green while `--qm-font`, a
documented dial, stops short of the package's own buttons. Both families take
`font: inherit` and then the body rung, the anchor the box reads, so a button and
the input beside it agree on face and size. Where the box's height is a line box, a
button's is the tap floor: a label is one line and a glyph is not text at all, so the
line box collapses onto its content and one height source decides instead of two.
`font` is a shorthand carrying `line-height`, so size and leading are declared after
it or dropped in silence — the same ordering the box recipe keeps.

**The section header is a button by tag and neither family by recipe.** It reads no
`--_qm-tap-min` — its symmetric vertical padding already clears the floor, and the
whole row is the target — and takes no hover fill (an ink step instead), so it
declares its own type rather than joining a family it would then have to unpick: the
field-label rung at the tight leading, on the button, with the label a text run
beside the chevron. A wrapper carrying only the size is indirection between a header
and its own label. Horizontally it insets one rung on the left and none on the right:
the section's vertical runs down this row, and at zero the chevron stands on that
stroke with only the icon box's own bearing between them — a clearance that is off
the scale and that the glyph's rotation moves as the section opens. An inset inside
the button costs no target; one on the right would give the row's edge back.

**An inline prose leaf is inside that recipe, not beside it.** A field constrained
to one paragraph is a control in a row of controls, so it draws the same
declarations and is therefore exactly as tall as the `.qm-input` next to it — by
construction, with no floor of its own. A control's height is one padding rung, a
line box and two hairlines, so that agreement is **leading's** as much as padding's:
a leading applied to one selector of the shared rule and not the other breaks the
invariant with nothing minted for the gate to catch, and two `min-height` literals
tuned to agree would drift the first time either box changed. The body is the one
that is not a control at all: it draws no box and opens at a floor of three line
boxes — size times leading times three, both factors named or the expression stops
meaning the three lines it claims — then grows. The floor is only ever the height
of an EMPTY body, where the ghost takes the first line
([VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md) §Fields): what opens is an
invitation with room under it, not a drop. The **type rungs** are a leaf's
either way, size and leading alike, and sit on the leaf's own base rule rather than
in the box it withholds: a leaf that inherits them lands on the host page's rhythm,
minting no literal for `check:style` to catch. Paper reads the ramp exactly as a
control does.

## Rhythm

**Spacing.** A small closed scale — `--_qm-space` and its `half`/`2`/`3`/`4`
multiples — is the shared rhythm. Card padding is uniform on every side, so a
body-shown card and a body-hidden card stay symmetric, and the card's content edge
is the gutter every top-level region starts on: the field list, the metadata
bracket's two horizontals, and the body's first character alike. What indents from
that gutter is **containment, stated geometrically** — a grouped field sits inside
its section's rule, a section label sits right of its disclosure chevron — and it
is the one cue that survives a section being open. One gutter, then, is a claim
about the card's inset and about what starts on it, not a prohibition on hierarchy
inside it. Stacked regions — a card's header, its field list, its body — are
separated by one gap, not per-region margins that drift. Pick from the scale; an
in-between value is a review smell.

**The card stack's gutter is mostly the add strip.** Between two cards sits a
full-bleed insert trigger at the tap floor, and its own height is most of what
separates them — so it ABSORBS one space rung of the stack's gap on each side
rather than adding to it. Absorbed, not removed: the gap is also what separates
the two seams no strip sits in — `main` from the tips card, and every card from
the next under a quill that declares no kinds, where the affordance does not
render (VISUAL_EDITOR_UIUX §"Card stack"). A negative margin reading a scale step
is the one place the rhythm subtracts, and it is why: two spacings meet, and the
taller one is the separation.

**The action column** is the other half of that claim, on the side the gutter says
nothing about. A field section reserves a trailing column — a row action's tap
target plus the grid's own column gutter — held clear of the tracks: every control
in the section ends on one right edge, and an array's rows put their remove past it,
where it is never over the value it removes. Reserved as an inset rather than as a
fifth track, because auto-placement walks every track it is given and a compact
field overflowing the last column would land in the action column — and the inset
sits on the section rather than on the grid inside it, because the section is the
query container and a size query reads its CONTENT box: capacity below then measures
the width the tracks actually get, with no breakpoint carrying the column's width in
arithmetic a `var()` cannot reach. Every
section pays the width, including one with no action in it — a right edge that moved
with a section's contents is the raggedness this removes. The left gutter is what a
region STARTS on; the right edge is what a control ENDS on, and only an action sits
outside it.

**Stroke.** One width for every edge the chrome draws — `--_qm-border-width`, a
threshold rather than a rhythm choice, so a hairline stays a hairline at any
`--qm-space`. The card's edge, a control's box, a nested object's rule, and the
metadata bracket's three sides are all the same stroke. It needs a rung because the
colour axis tests `border-*` for a *colour* literal only, so a shorthand that reads
a colour rung passes at whatever width it likes and a divergent stroke sits beside
the hairlines with the gate green. `check:style`'s border-width axis closes that:
what it holds is that no width is minted — a width still has to READ a rung, and
reading the wrong one is review's to catch, since neither axis shape can name a
particular token.

**Capacity.** A field section's column count is a closed ramp too — 1 → 2 → 4, at
`28rem` and `57rem` of CONTAINER width (VISUAL_EDITOR_UIUX §"Section grid"). Each
rung is the width at which a track still clears ~220px, the narrowest a labelled
control reads comfortably; the ramp skips 3 so a half-capacity span lands on a track
boundary at every rung. These are geometry thresholds like the tap-target floor —
they answer to what a control needs, not to `--qm-space` — so they do not derive
from the spacing dial and do not move when it does.

**Radius.** One radius base with at most a small derived step, by surface weight —
the card and the three floating surfaces at `--_qm-radius`, interior controls at the
tighter `--_qm-radius-inner` — not a free choice per component. `--_qm-radius-pill`
is a shape tier beside the ramp rather than a step on it, so a fully-rounded end cap
stays round at any `--qm-radius`. Four unrelated radii is drift, not a scale.

**Type.** One closed ramp, not a per-component size. A body anchor and a ratio
derive four rungs — `--_qm-text-title` (card title), `--_qm-text-body` (every
control: inputs, the select trigger, the date field, both prose leaves, add
affordances), `--_qm-text-label` (field labels, section headers),
`--_qm-text-meta` (diagnostics, mini controls) — with weight a fixed convention
over them (`--_qm-weight-label` on a field label and on a heading in the body,
`--_qm-weight-soft` on a nested object prop's secondary label), not per-file. Four
rungs carry every surface; an in-between size is the drift this prevents.

**Leading** is the ramp's third axis, at two rungs rather than four: a wrapped
label and a wrapped paragraph want different rhythms, and nothing wants a rung per
size. `--_qm-leading-body` is reading rhythm — both prose leaves, every control
beside them, the tips card's guidance; `--_qm-leading-tight` is a line that is a
label rather than a passage — field labels, section labels, the card title. The
two axes are deliberately independent, which the tips card is the case for: label
size, reading leading. Unitless, so a rung inherits multiplicatively and holds
against whichever size rung the surface reads. `line-height: 1` is outside the axis
altogether — it collapses the line box onto its content, a glyph or a button's
one-line label, which is a structural claim rather than a rhythm.

**Leading alone separates paper from chrome.** The body leaf reads
`--_qm-text-body`, the same size as the input beside it, and steps up to no fifth
rung; the line rhythm is the entire distinction, which is what keeps the size ramp
four wide. Control height falls out of the same rung — a box is one padding rung, a
line box and two hairlines — so a cramped control is missing leading, not a
`min-height`.

A control **reads** the rung; it does not inherit a size. Inheriting is the drift
that hides from the gate — no literal is minted, so nothing fails, and the control
silently takes the host page's body size. That inverts the ladder against the label
over it and makes control height a property of the consumer's page rather than of
the package.

**The scale in code.** All three axes are public dials deriving a closed private
scale ([`THEMING.md`](../../THEMING.md)) — geometry (`--qm-radius`, `--qm-space`),
type (`--qm-font-size`, with the ratio between size rungs and the two leading rungs
fixed constants), and colour (`--qm-bg`, `--qm-fg`, and the three status hues, which
step surfaces `bg → fg` and ink `fg → bg` in oklab). The derivation is minted ONCE,
as a stylesheet in `core/` the package imports itself, and applies to every element
marked `data-qm-root` —
the editor, the portaled popover and select list, the preview, and the source view,
none of which descend from the others. That rule carries the baseline font, ink and
leading too, so a root inherits them by carrying the marker rather than by restating
a declaration — which is what puts `normal` out of reach below a marker, leaving a
per-surface `--_qm-leading-tight` as the deliberate override. It stops short of a
body `font-size`, because a root rule sweeps every
descendant a consumer may have mounted inside the marker — a reach the derivation
does not have. Each surface reads the rung instead. A component reads a rung, never
a literal; `check:style` gates all three axes, so an in-between value fails CI, not
just review.

## Focus and active state

A surface a caret or selection can land on shows it, within the monochrome
palette — but a **form control** and a **prose leaf** are not the same focus
case, and one rule for both would conflate them:

- **Scalar controls draw a tokenized ring.** A focused `TextField` / `NumberField`
  / `EnumField` / `BooleanField` / `DateField` (and the array JSON control) shows
  `--_qm-ring-focus` at `--_qm-ring-offset` in place of the raw UA default —
  themed, and identical across the controls because it is ONE RULE they opt into
  (`.qm-focus-ring`), not a rung each assembles. The rung fixes the value; the rule
  fixes which properties draw a ring and on what state, which `check:style` cannot
  see. Two variants, for the one distinction: a date field's focus lives on a
  segment, so it rings the field on `:focus-within` rather than flickering the ring
  across the segments as the caret walks them. Invariant: never clear a form
  control's native outline without a visible replacement.
- **A prose leaf keeps the caret as its focus indicator.** The blinking caret is
  the editor convention for a text-editing region — Google Docs, Notion, every
  ProseMirror surface — and a ring around a `contenteditable` reads as the form
  chrome the AESTHETIC rule strips, not as paper. So the leaf clears its
  contenteditable outline deliberately; the caret *is* the replacement, and a leaf
  that has a hairline cues active quietly by tinting it to `--_qm-accent`
  (`:focus-within`), not by a heavy ring. **The body has no hairline and takes no
  substitute** — the caret is the whole indicator there. It is the only writing
  surface in its card and the largest thing in it, so "which leaf am I in" is not a
  question it raises; a rule drawn to answer it would be a stroke bought back to
  replace the one unframing removed. The correlation wash is unaffected either way:
  it mounts as an inset child of the leaf (`core/bloom.ts`), needing the leaf to be
  positioned and nothing else, so the editor↔preview address keeps its cue on paper.

One hue carries "active" across the panes: the editor's focus ring and the
correlation bloom both resolve `--_qm-accent`, so a field reads as engaged with the
same colour on either side (the editor↔preview active address, VISUAL_EDITOR_UIUX
§"Editor↔preview"). The two differ in what they are, not in hue. Focus is a state
the editor holds, so the editor draws it and holds it. Correlation is an event — the
moment an address crossed between the panes — so a wash marks it and decays to
nothing. **The preview carries no focus ink at all**: it claims to be the rendered
output, and a border it draws on the page it is proving is a border the document did
not ask for. What the overlay draws instead is in PREVIEW §Overlay.

**Card scale takes no mark of its own.** The focused leaf's cue sits *inside* the
card, so "which card" is answered by containment and a second mark would only
restate it. The rungs rule out the obvious candidate besides:
`--_qm-surface-hover` is the button recipe's hover ink (§Elevation), so an active
card filled with it stands its controls two rungs off their card instead of the one
the package guarantees, and leaves a hovered button on its own ground. Nor would a
fill reach the case that argues for one — a tone step reads only against a
neighbouring card, so a card taller than the viewport has nothing to compare and
shows nothing. `main` settles the same question the same way: structure says which
card it is, and no tone is minted to repeat it. What a card carries instead is its
**controls' reveal** — pointer or caret inside brings the reorder chevrons up
(VISUAL_EDITOR_UIUX §"Card stack"). That is an affordance surfacing where it can be
used, not a state drawn on the section, and it is why `main` needs no equivalent:
it has no controls to reveal.

One ring width, therefore: `--_qm-ring-width` is focus, and nothing sits under it as
a held-back tier.

Buttons (reorder, delete, mark, add) keep the UA `:focus-visible` ring — already
an accessible indicator, and not themed by this page.

## Motion

Three duration rungs, named for what the eye is doing rather than for a component:

- `--_qm-duration-fast` — a state toggling under the pointer that nobody watches: a
  hover-revealed control, a switch's knob, a popover's entrance.
- `--_qm-duration-slow` — a size or position the eye tracks, so it needs to be
  followable: the group accordion's `0fr↔1fr` row, a chevron's rotation.
- `--_qm-duration-linger` — the correlation bloom, the one duration a user actually
  waits out. Long enough that a wash which rises and decays is legible as a single
  gesture rather than a flicker.

Duration is the axis with no units of its own: every value looks plausible, so a
surface picking its own drifts silently. It is a scale like the others and
`check:style` gates it — in CSS, and in the script that animates the bloom over WAAPI
(`core/bloom.ts` reads the rung off the element rather than forking the number).

Under `prefers-reduced-motion: reduce` a transition is dropped and the bloom loses
its ramps — it holds at full for a beat and cuts. That degradation is only available
because the bloom decays to **zero**: a wash that settled at a resting tint would
have no honest reduced-motion form, since the thing being animated would also be the
thing left behind.

## Preventing drift

- **Chrome → rungs.** The look lives in the `--_qm-*` scale; a component reads a
  rung, it does not mint a value.
- **Scale → a closed set.** Spacing, radius, type, colour, and duration are small
  fixed scales; a value outside them is a review smell.
- **Public surface → the minimum.** The dials are the contract
  ([`THEMING.md`](../../THEMING.md) counts them); a rung is promotable the day a
  consumer needs it. Fewer names is the point — each one is a thing a reader holds.
- **Rule → this page.** The elevation and rhythm questions have a written answer,
  so they are not re-argued per change.

## Links

[AESTHETIC.md](AESTHETIC.md) · [VISUAL_EDITOR_UIUX.md](VISUAL_EDITOR_UIUX.md) · [`THEMING.md`](../../THEMING.md)
