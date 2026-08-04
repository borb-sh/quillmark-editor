---
'@quillmark/svelte': minor
---

The insert surface's keyboard door: `/` at a word boundary raises a filtered menu of block constructs over the caret — a table, the three headings, both lists, a quote, a code block, a divider — and a pick consumes exactly the trigger run in one commit. The trigger is gated on the leaf's schema (a constrained inline or plaintext leaf has none) and on the word boundary, so `and/or` and a URL stay prose; ↑/↓/Enter/Escape belong to the leaf's keymap, so the caret never leaves the text the insert is measured against. A table pick mints the next positional island id and lands the caret in the first cell.

The menu's wording joins the `strings` set (`slashTable`, `slashBulletList`, …), and each label is its own search key, so a translated menu filters in the language it displays. The selection popover no longer raises over a node selection, which has no text to format.
