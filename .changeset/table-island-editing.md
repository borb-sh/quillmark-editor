---
'@quillmark/svelte': minor
---

A table island is edited in place. A `table` island rendered as the literal `[table]` and had no way in; it is now a NodeView holding one nested inline-schema prose leaf per cell. Cell text and marks keep the cell-local coordinate space the boundary declares, an identity anchor inside a cell is preserved and rebased rather than dropped, and every edit lowers through the island channel, so the field's anchors survive a keystroke in a cell. Tab traverses cells and appends a row past the last; Enter is the next row, which is the only thing a cell with no line concept can mean.

Its chrome is two `+` strips (one per growing edge) and one handle per body row and column, each raising that line's menu: insert either side, delete, and for a column the four alignments — the one table capability the content round-trips and nothing in the editor could reach. The count does not grow with the rectangle. Rows and columns hold entry order and offer no reorder, matching the rule array fields already state.

The island's wording joins the `strings` set (`tableAddRow`, `tableInsertColumnLeft`, `tableAlignCenter`, …), and `createField` takes an `onIslandMenu` channel the chrome draws that menu through.
