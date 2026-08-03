---
'@quillmark/svelte': minor
---

A table island is edited in place. A `table` island rendered as the literal `[table]` and had no way in; it is now a NodeView holding one nested inline-schema prose leaf per cell, with row and column handles for insert, reorder, delete, and per-column alignment — the one thing the content round-tripped and nothing in the editor could reach. Cell text and marks keep the cell-local coordinate space the boundary declares, an identity anchor inside a cell is preserved and rebased rather than dropped, and every edit lowers through the island channel, so the field's anchors survive a keystroke in a cell. Tab traverses cells and appends a row past the last; Enter is the next row, which is the only thing a cell with no line concept can mean.

The wording of the island's chrome joins the `strings` set (`tableRowInsert`, `tableColumnDelete`, `tableAlign`, …), so it is overridden beside every other key.
