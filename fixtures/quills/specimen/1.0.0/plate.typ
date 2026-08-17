#import "@local/quillmark-helper:0.1.0": data, form-field, plaintext, signature-field
#import "@local/specimen-layout:1.0.0": accent-rule, callout, mono-face, specimen-page

#let accent = data.at("accent", default: "slate")

#show: specimen-page.with(
  // A string, not `data.title`: see `specimen-page` on why the running head takes
  // the plaintext projection and the block stays in the flow.
  running-title: plaintext("title"),
  status: data.at("status", default: "draft"),
  accent: accent,
  font-size: data.at("font_size", default: 10.5) * 1pt,
  watermark: data.at("draft_watermark", default: false),
)

// A date field arrives as a value object (`value` + `display`), or `none` when blank.
#let shown-date(d, fallback) = if d == none { fallback } else { (d.display)("[year]-[month]-[day]") }

// A `variants:` enum rests as a container, `{value, …the live member's fields}`. The
// branch covers `values ∪ blank` and its last arm is the blank's, not a fallback: an
// `else` standing for "anything else" would print a world nobody chose. Inside a
// branch every declared cell of that world is present, so a cell needs no presence
// guard — only its value is worth one.
//
// The discriminant is bound for the branching and every *emitted* cell is read off
// `data` directly, which is what regions it at the property (`main.distribution.
// license`) and puts these cells within reach of the preview. A cell read through a
// local binding carries no address.
#let distribution-note = {
  let world = data.distribution.value
  if world == "internal" [Internal]
  else if world == "public" [Public · #data.distribution.license]
  else if world == "embargoed" [
    Embargoed#if data.distribution.lift_on != "" [ until #data.distribution.lift_on]#if data.distribution.held_by != "" [ · #data.distribution.held_by]
  ] else [Distribution unset]
}

// ── Letterhead ──────────────────────────────────────────────────────────────
#grid(
  columns: (auto, 1fr),
  column-gutter: 12pt,
  align: horizon,
  image("assets/mark.png", width: 46pt),
  {
    text(size: 19pt, weight: "bold", data.title)
    if plaintext("subtitle") != "" {
      linebreak()
      text(size: 11pt, style: "italic", data.subtitle)
    }
  },
)

#v(4pt)
#accent-rule(accent: accent)

#let authors = data.at("authors", default: ())
#let poc = data.at("contact", default: (:))
#text(size: 9pt)[
  #if authors.len() > 0 [#authors.join(", ")]
  #if poc.at("name", default: "") != "" [
    · #poc.name#if poc.at("email", default: "") != "" [ (#poc.email)]
  ]
  · Issued #shown-date(data.at("issued", default: none), [—])
  #if data.at("revised_at", default: none) != none [
    · Revised #(data.revised_at.display)("[year]-[month]-[day] [hour]:[minute]")
  ]
  #if data.at("tracking_id", default: "") != "" [ · #raw(data.tracking_id)]
  #if poc.at("reply_by", default: "") != "" [ · reply by #poc.reply_by]
  #if poc.at("listed", default: false) [ · listed]
]

#if plaintext("epigraph") != "" {
  v(6pt)
  align(center, block(width: 78%, text(size: 9.5pt, data.epigraph)))
}

// ── Abstract, keywords ──────────────────────────────────────────────────────
#if plaintext("abstract") != "" {
  v(8pt)
  block(inset: (left: 14pt), text(size: 9.5pt, data.abstract))
}

#let keywords = data.at("keywords", default: ())
#if keywords.len() > 0 {
  v(4pt)
  text(size: 9pt, { strong[Keywords: ]; keywords.map(box).join[, ] })
}

// `errata` rows are plaintext: strings, so they set as text rather than as markup.
#let errata = data.at("errata", default: ())
#if errata.len() > 0 {
  v(6pt)
  text(size: 9pt, {
    strong[Errata]
    list(..errata)
  })
}

// ── Body ────────────────────────────────────────────────────────────────────
#v(10pt)
#columns(data.at("columns", default: 1), data.at("$body"))

// ── Signature ───────────────────────────────────────────────────────────────
// A widget, not text: `main.signature_block` reaches the region table through
// this placement and through no glyph span of its own.
#v(16pt)
#align(right, {
  signature-field("Signature", width: 200pt, height: 34pt, field: "signature_block")
  for line in data.at("signature_block", default: ()) {
    line
    linebreak()
  }
})

// ── Cards ───────────────────────────────────────────────────────────────────
// One arm per declared kind. A kind the plate does not know is skipped rather
// than raised: the document model lets a card outlive the schema that named it.
#{
  let section-no = 0
  for (i, card) in data.at("$cards").enumerate() {
    let kind = card.at("$kind")
    let path = card.at("$path")
    // The helper leaves an unset body as the empty string; only a written one is
    // content, so the empty case passes `[]` rather than a stray `""`.
    let raw-body = card.at("$body", default: "")
    let card-body = if type(raw-body) == str { [] } else { raw-body }

    if kind == "section" {
      if card.at("numbered", default: true) { section-no += 1 }
      let label = if card.at("numbered", default: true) [#section-no. ] else []
      v(8pt)
      heading(level: 2, outlined: false)[#label#card.at("heading", default: "")]
      if plaintext(path + "lead") != "" {
        text(size: 9.5pt, style: "italic", card.lead)
        parbreak()
      }
      let layout = card.at("layout", default: "prose")
      if layout == "callout" {
        callout(accent: accent, card-body)
      } else if layout == "aside" {
        block(inset: (left: 24pt), text(size: 8.5pt, card-body))
      } else {
        card-body
      }
    } else if kind == "note" {
      let tone = card.at("tone", default: "neutral")
      v(6pt)
      block(
        width: 100%,
        inset: (left: 10pt),
        stroke: (left: 2pt + if tone == "warning" { rgb("#b45309") } else { luma(180) }),
        {
          text(size: 8pt, weight: "bold", upper(card.at("label", default: "Note")))
          linebreak()
          card-body
        },
      )
    } else if kind == "signoff" {
      v(10pt)
      // The region keys on this card's own `$path`, so a click lands on this
      // instance's field rather than on the kind's first.
      signature-field("Signoff_" + str(i), width: 180pt, height: 34pt, field: path + "signature_block")
      for line in card.at("signature_block", default: ()) {
        line
        linebreak()
      }
      text(size: 9pt)[Date: #shown-date(card.at("signed_on", default: none), box(width: 90pt, line(length: 100%)))]
    }
  }
}

// ── Colophon ────────────────────────────────────────────────────────────────
// A second page, unconditionally: a one-page fixture proves nothing about the
// page counter, the running head, or a preview that scrolls.
#pagebreak()
#accent-rule(accent: accent)
#v(4pt)
// The title restated. Its second placement is what makes `main.title`'s regions
// non-unique and page-spanning, the case a scroll-to-field rule has to answer.
#text(size: 12pt, weight: "bold", data.title)
#v(4pt)
#text(font: mono-face, size: 8pt)[
  // `raw` needs a string and the content block is not one; `plaintext` is the
  // coercion, and `repr` of the block is not.
  #raw(plaintext("title"))
  #linebreak()
  #data.at("status", default: "draft") · #accent · #str(data.at("columns", default: 1)) col · #str(data.at("font_size", default: 10.5)) pt
  #linebreak()
  #distribution-note
  #linebreak()
  #for rev in data.at("revisions", default: ()) [
    #rev.at("note", default: "revised") (#str(rev.at("pages", default: 0)) pp)
    #linebreak()
  ]
  // A checkbox widget, so a boolean field reaches the region table the same way
  // the signature does — through a placement, not through a glyph span.
  #form-field(
    "DraftWatermark",
    type: "checkbox",
    value: data.at("draft_watermark", default: false),
    field: "draft_watermark",
    width: 9pt,
    height: 9pt,
  )
  marked draft
]
#if plaintext("colophon") != "" {
  v(4pt)
  text(font: mono-face, size: 8pt, data.colophon)
}
