// utils.typ: Utility functions and backend code for Typst usaf-memo package.
//
// This module provides core utility functions, configuration constants, and helper
// functions used by the main memorandum template. It handles spacing calculations,
// paragraph numbering, grid layouts, and various formatting utilities required
// for AFH 33-337 compliance.
//
// Key components:
// - Spacing constants and configuration management
// - Paragraph numbering and indentation utilities
// - Grid layout and backmatter formatting functions
// - Date formatting and content scaling utilities
// - Indorsement processing and ordinal number generation

#import "config.typ": CLASSIFICATION_COLORS, counters, paragraph-config, spacing

// Shared measured line-stride cache used by body line-count heuristics.
// Value is a `length` set once in `frontmatter`.
#let LINE_STRIDE = state("LINE_STRIDE")

/// Creates vertical spacing equivalent to multiple blank lines.
///
/// Adds `count` wrapped-line strides on top of the natural inter-paragraph
/// gap, so a blank line occupies exactly the same vertical space as a line
/// produced by natural paragraph wrapping. The stride is measured from
/// `LINE_STRIDE` (cached in `frontmatter`) and falls back to an inline
/// measurement when the cache is unset.
///
/// - count (int): Number of blank lines to create
/// -> content
#let blank-lines(count) = {
  if count <= 0 { return }
  context {
    let stride = LINE_STRIDE.get()
    if stride == none {
      let one-line = measure(par(spacing: 0pt)[x]).height
      stride = measure(par(spacing: 0pt)[x#linebreak()x]).height - one-line
    }
    v(stride * count)
  }
}

/// Creates vertical spacing equivalent to one blank line.
/// Convenience function for single line spacing.
///
/// -> content
#let blank-line() = blank-lines(1)

// =============================================================================
// GENERAL UTILITY FUNCTIONS
// =============================================================================

/// Checks if a value is "falsey" (none, false, empty array, empty string, or
/// empty content).
///
/// Provides a consistent way to test for empty or missing values across
/// the template system. Used for conditional rendering of optional sections.
///
/// Content fields (`plaintext` / `richtext`) reach the template in one of two
/// shapes: a blank one as the empty string `""`, a filled one as a markup
/// block. Empty content (`[]`) is covered too, since that is what an emptied
/// block and `join()`-over-nothing produce.
///
/// - value (any): The value to check for "falsey" status
/// -> bool
#let falsey(value) = {
  (
    value == none
      or value == false
      or (type(value) == array and value.len() == 0)
      or (type(value) == str and value == "")
      or value == []
  )
}

/// Scales content to fit within a specified box while maintaining aspect ratio.
///
/// Automatically measures content and calculates uniform scaling to fit within
/// the given dimensions. Commonly used for letterhead seals and other images
/// that need to fit specific size constraints while preserving proportions.
///
/// - width (length): Maximum width for the content (default: 2in)
/// - height (length): Maximum height for the content (default: 1in)
/// - alignment (alignment): Content alignment within the box (default: left+horizon)
/// - body (content): Content to scale and fit
/// -> content
#let fit-box(width: 2in, height: 1in, alignment: left + horizon, body) = context {
  // 1) measure the unscaled content
  let s = measure(body)

  // 2) compute the uniform scale that fits inside the box
  let f = calc.min(width / s.width, height / s.height) * 100% // ratio

  // 3) fixed-size box, center the scaled content, and reflow so layout respects it
  box(width: width, height: height, clip: true)[
    #align(alignment)[
      #scale(f, reflow: true)[#body]
    ]
  ]
}

/// Shrinks content to fit within a maximum width, never enlarging it.
///
/// Measures `body` at its current font size and scales it down uniformly only
/// when it is wider than `width`; content that already fits keeps its set size
/// (the scale is capped at 100%). Unlike `fit-box`, height flows naturally and
/// small content is never scaled up. Used for the letterhead caption (unit
/// designation): a long name is shrunk to the width that clears the seal rather
/// than running underneath it. Pass a non-wrapping `box` as `body` so the
/// measured width is the single-line width and the result stays on one line.
///
/// Empty content measures 0pt wide and has no scale to compute, so it is returned
/// as-is rather than divided by; a non-positive `width` likewise admits no scale
/// that fits, so the body is left at its set size instead of being flipped or
/// collapsed.
///
/// - width (length): Maximum width the content may occupy
/// - alignment (alignment): Horizontal placement within the reserved width
/// - body (content): Content to fit (typically a non-wrapping `box`)
/// -> content
#let fit-to-width(width, alignment: left, body) = context {
  let s = measure(body)
  if s.width <= 0pt or width <= 0pt { return body }
  let f = calc.min(1, width / s.width) * 100% // ratio, capped so it only shrinks
  box(width: width)[
    #align(alignment)[
      #scale(f, reflow: true)[#body]
    ]
  ]
}

/// The date pattern a memo style prints, per AFH 33-337. Exported so a caller
/// that pre-formats the date matches this package instead of restating it.
///
/// - memo-style (str): `"usaf"` or `"daf"`
/// -> str
#let date-pattern(memo-style: "usaf") = if memo-style == "daf" {
  "[month repr:long] [day padding:none], [year]"
} else {
  "[day padding:none] [month repr:long] [year]"
}

/// Formats a date for the memo heading.
///
/// - str, content: shown as-is (a fixed placeholder, or ink the caller already
///   formatted through [`date-pattern`]).
/// - datetime: USAF style `DD Month YYYY`; DAF style `Month DD, YYYY`.
///
/// - date (str | content | datetime): Date to format for display
/// - memo-style (str): `"usaf"` or `"daf"`
/// -> content
#let display-date(date, memo-style: "usaf") = {
  assert(
    memo-style in ("usaf", "daf"),
    message: "memo-style for display-date must be \"usaf\" or \"daf\"",
  )
  // A caller that pre-formatted — to keep a click-to-edit region the package
  // cannot mint itself — passes the finished ink through untouched.
  if type(date) in (str, content) {
    date
  } else {
    date.display(date-pattern(memo-style: memo-style))
  }
}

/// Reserves the space a date occupies, for a date unknown at compile time.
///
/// Used for indorsements whose signing date is not known when the memo is
/// rendered: the endorser supplies it after the fact. The reserved box is one
/// line tall and sits on the baseline, so the slot lines up with where a
/// printed date would sit and takes exactly the space one would take.
///
/// `field` is the caller's fill-in widget — the Quillmark helper's
/// `form-field(.., type: "text")`, which lowers to a fillable AcroForm text box
/// in PDF output. It is anchored at the slot's top-left corner, the corner the
/// widget's own rectangle grows right and down from, so a widget declared at
/// this slot's dimensions covers it exactly. `none` (a caller with no widget to
/// give, e.g. the package used outside Quillmark) leaves the slot blank.
///
/// - field (content | none): Fill-in widget to anchor in the slot
/// - width (length): Width of the slot; defaults to fit a long date such as
///   "15 September 2026".
/// -> content
#let date-placeholder-slot(field, width: 1in) = box(
  width: width,
  height: 1em,
  // Keep the slot's bottom edge on the line's baseline, where the printed date
  // would sit; the 1em height then reserves the line above it.
  // (A positive baseline shift would drop the box a full line too low.)
  baseline: 0pt,
  if field != none { place(top + left, field) },
)

/// Gets the banner color for a classification marking.
///
/// Matches when `level` (trimmed) starts with a known prefix: TOP SECRET, SECRET,
/// CONFIDENTIAL, CUI, or UNCLASSIFIED. Otherwise returns black.
///
/// - level (str): Marking string shown in header/footer
/// -> color
#let get-classification-level-color(level) = {
  if level == none or type(level) != str {
    return rgb(0, 0, 0)
  }
  let s = level.trim()
  // Longest-prefix-first so e.g. "TOP SECRET" wins over "SECRET".
  let level-order = ("TOP SECRET", "SECRET", "CONFIDENTIAL", "CUI", "UNCLASSIFIED")
  for base-level in level-order {
    if s.starts-with(base-level) {
      return CLASSIFICATION_COLORS.at(base-level)
    }
  }
  rgb(0, 0, 0)
}

// =============================================================================
// GRID LAYOUT UTILITIES
// =============================================================================

/// Creates an automatic grid layout from a cell value or array of them.
///
/// Converts 1D content into a multi-column grid layout with proper spacing.
/// Used primarily for formatting recipient lists in the "MEMORANDUM FOR" section
/// where multiple organizations need to be displayed in columns.
///
/// Features:
/// - Automatic column distribution and row filling
/// - Configurable column spacing and count
/// - Handles a single cell or an array of them, as `str` or as content
/// - Adds padding cells to maintain consistent column alignment
///
/// Cells may be content, not just `str`: a `plaintext` recipient list lowers
/// each element to a markup block, which is what makes the rendered glyphs
/// carry their own spans and so become click-navigable.
///
/// - content (str | content | array): Cell(s) to arrange in grid
/// - column-gutter (length): Space between columns (default: 0.5em)
/// - cols (int): Number of columns for the grid (default: 3)
/// -> grid
#let create-auto-grid(content, column-gutter: .5em, cols: 3) = {
  let content_type = type(content)

  // Normalize to 1d array. A lone cell — `str` or content — is a one-cell grid.
  if content_type != array {
    content = (content,)
  }


  // Build cell array in row-major order
  let cells = ()
  let i = 0
  for item in content {
    i += 1
    cells.push(item)
    if calc.rem(i, cols) == 0 {
      // Add empty cell to pad the page
      cells.push([])
    }
  }

  // Add padding cells to complete the last row if needed
  let remainder = calc.rem(cells.len(), cols + 1)
  if remainder != 0 {
    let padding_needed = (cols + 1) - remainder
    for _ in range(padding_needed) {
      cells.push([])
    }
  }

  grid(
    columns: calc.max(1, cols) + 1,
    column-gutter: .1fr,
    row-gutter: spacing.line,
    ..cells
  )
}

// =============================================================================
// TYPE NORMALIZATION UTILITIES
// =============================================================================

/// Ensures the input is an array. If already an array, returns as-is.
/// If not an array, wraps the value in a tuple.
///
/// This utility eliminates repetitive `if type(x) == array` checks throughout
/// the codebase by providing a canonical "normalize to array" function.
///
/// - value: Any value to normalize to array form
/// - Returns: Array containing the value(s)
///
/// Examples:
/// - ensure-array("foo") → ("foo",)
/// - ensure-array(("a", "b")) → ("a", "b")
/// - ensure-array(none) → ()
#let ensure-array(value) = {
  if value == none {
    ()
  } else if type(value) == array {
    value
  } else {
    (value,)
  }
}

/// Normalizes a scalar-or-array field to a single stacked-lines **content**
/// value, one array element per line.
///
/// This is the content-safe successor to the former `ensure-string`: every
/// prose field the quill declares is now a `plaintext` / `richtext` field, so
/// it arrives as Typst *content* (a markup block), and `str(..)` on content is
/// an error. Joining with `linebreak()` rather than `"\n"` renders the same
/// stacked lines while accepting either shape.
///
/// A blank content field arrives as `""` and lands as empty content, which
/// stays `falsey` for callers that test the result.
///
/// - value (any): Scalar or array of scalars/content to stack
/// -> content
///
/// Examples:
/// - join-lines("foo") → [foo]
/// - join-lines(([a], [b])) → [a] + linebreak() + [b]
/// - join-lines(()) → []
/// - join-lines(none) → []
#let join-lines(value) = {
  if value == none { return [] }
  let items = if type(value) == array { value } else { (value,) }
  // A `str` element is wrapped so the join is content-to-content throughout;
  // mixing `str` and content under `+` is not a legal Typst addition.
  let joined = items.map(item => [#item]).join(linebreak())
  // `().join(..)` is `none`, not `[]` — coerce so an empty array stays `falsey`.
  if joined == none { [] } else { joined }
}

/// Extracts the first element from an array, or returns the value if not an array.
///
/// This utility eliminates repetitive ternary operators like
/// `if type(x) == array { x.at(0) } else { x }` by providing a canonical
/// "first element or self" function.
///
/// - value: Any value to extract from
/// - Returns: First array element if array, otherwise the value itself
///
/// Examples:
/// - first-or-value("foo") → "foo"
/// - first-or-value(("a", "b")) → "a"
/// - first-or-value(()) → none
/// - first-or-value(none) → none
#let first-or-value(value) = {
  if value == none {
    none
  } else if type(value) == array {
    if value.len() > 0 {
      value.at(0)
    } else {
      none
    }
  } else {
    value
  }
}


// =============================================================================
// INDORSEMENT UTILITIES
// =============================================================================

/// Converts number to ordinal suffix for indorsements following AFH 33-337 conventions.
///
/// AFH 33-337 Chapter 14 indorsement examples show "1st Ind", "2d Ind", "3d Ind" format.
/// Note: Military style uses "2d" and "3d" instead of "2nd" and "3rd" per DoD correspondence standards.
///
/// Generates proper ordinal suffixes for indorsement numbering:
/// - 1st, 2d, 3d, 4th, 5th, etc. (note: military uses "2d" and "3d", not "2nd" and "3rd")
/// - Special handling for 11th, 12th, 13th (all use "th")
/// - Follows official military correspondence standards
///
/// - number (int): The indorsement number (1, 2, 3, etc.)
/// -> str
#let get-ordinal-suffix(number) = {
  let last-digit = calc.rem(number, 10)
  let last-two-digits = calc.rem(number, 100)

  if last-two-digits >= 11 and last-two-digits <= 13 {
    "th"
  } else if last-digit == 1 {
    "st"
  } else if last-digit == 2 {
    "d"
  } else if last-digit == 3 {
    "d"
  } else {
    "th"
  }
}

/// Formats indorsement number according to AFH 33-337 standards.
///
/// Creates properly formatted indorsement labels with ordinal suffixes:
/// - "1st Ind", "2d Ind", "3d Ind", "4th Ind", etc.
/// - Uses military-specific ordinal format (2d/3d instead of 2nd/3rd)
/// - Combines with "Ind" suffix for standard indorsement header format
///
/// - number (int): Indorsement sequence number (1, 2, 3, etc.)
/// -> str
#let format-indorsement-number(number) = {
  let suffix = get-ordinal-suffix(number)
  str(number) + suffix + " Ind"
}

/// Processes and renders an array of indorsements.
///
/// Iterates through an array of indorsement objects and renders each one
/// with proper formatting and font settings. Used by the main memorandum
/// template to process the indorsements parameter.
///
/// - indorsements (array): Array of indorsement objects created with indorsement()
/// - body-font (str | array): Font(s) to use for indorsement text
/// - font-size (length): Font size for indorsement text (default: 12pt)
/// -> content
#let process-indorsements(indorsements, body-font: none, font-size: 12pt) = {
  if not falsey(indorsements) {
    for indorsement in indorsements {
      (indorsement.render)(body-font: body-font, font-size: font-size)
    }
  }
}
