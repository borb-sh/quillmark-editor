// The reference quill's page furniture, vendored as an `@local` Typst package so
// the fixture carries a package tree and fonts the loaders have to move.

// Both faces sit beside this file under `fonts/`. The backend embeds none of its
// own, so every family Typst can resolve here is one the quill carries: the
// document names them rather than leaning on a compiler default that resolves to
// nothing, and a pack that drops or truncates a file surfaces as a missing family
// rather than as a silent substitution.

/// The text face. All four styles are bundled: a face with no real bold and no
/// real italic renders emphasis identically to body copy, hiding every mark the
/// codec lowers.
#let text-face = "Tinos"

/// The monospace face, for `raw` and the colophon.
#let mono-face = "Liberation Mono"

/// A content field flattened to its text, for the running head and nothing else.
/// A block placed in `page(header:)` takes the field's regions onto that
/// placement and the flow keeps none, so the head is passed a string it cannot
/// region instead — a workaround for where the ink is attributed, not a
/// projection a plate wants. A `str` from the data lane needs no walk: `raw`
/// takes `data.tracking_id` and `document(title:)` takes the block itself.
/// Text and the elements that wrap it: a schema leaf's markup is words,
/// emphasis, links and spaces, so an element this walk misses is one no leaf
/// produces.
#let plain-text(c) = {
  if type(c) == str { c }
  else if c == [ ] { " " }
  else if c.has("text") { c.text }
  else if c.has("children") { c.children.map(plain-text).join() }
  else if c.has("body") { plain-text(c.body) }
  else { "" }
}

/// The `accent` enum's three values, resolved to colour. The domain a plate
/// branches over is `values ∪ blank`, so an unanswered accent takes an ink of its
/// own: falling back to a member would print a choice nobody made.
#let accent-color(name) = (
  slate: rgb("#334155"),
  ink: rgb("#111827"),
  rust: rgb("#b45309"),
).at(name, default: luma(90))

/// A rule in the document's accent.
#let accent-rule(accent: "slate") = line(length: 100%, stroke: 0.75pt + accent-color(accent))

/// A boxed aside, for a `section` card set as a callout.
#let callout(accent: "slate", body) = block(
  width: 100%,
  inset: 10pt,
  radius: 3pt,
  fill: luma(247),
  stroke: (left: 2pt + accent-color(accent)),
  body,
)

/// The page setup: margins, a running head, a page-count footer, and the
/// optional DRAFT wash.
///
/// `running-title` is a **string**, not the title's content block: the header
/// places its ink on every page and the scan attributes the block's spans to
/// that placement, so passing the block here spends the title's regions on
/// furniture a click can never land in — the field then has none in the flow at
/// all. The plate passes `plain-text` instead, and places the block itself in
/// the flow, where a region can be read back off it.
#let specimen-page(
  running-title: "",
  status: "draft",
  accent: "slate",
  font-size: 10.5pt,
  watermark: false,
  body,
) = {
  let ink = accent-color(accent)
  set page(
    paper: "us-letter",
    margin: (x: 1in, top: 1in, bottom: 0.9in),
    header: {
      set text(size: 8pt, fill: ink, font: text-face)
      grid(
        columns: (1fr, auto),
        align: (left, right),
        running-title,
        upper(status.replace("_", " ")),
      )
      v(-6pt)
      line(length: 100%, stroke: 0.5pt + ink)
    },
    footer: context align(
      center,
      text(size: 8pt, font: text-face, counter(page).display("1 of 1", both: true)),
    ),
    background: if watermark {
      place(
        center + horizon,
        rotate(-30deg, text(size: 110pt, weight: "bold", fill: ink.transparentize(90%))[DRAFT]),
      )
    },
  )
  set text(size: font-size, font: text-face)
  set par(justify: true)
  show heading: set text(fill: ink)
  show raw: set text(font: mono-face, size: 0.92em)
  body
}
