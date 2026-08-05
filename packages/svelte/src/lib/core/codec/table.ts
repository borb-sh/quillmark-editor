// The table island's model: the cell codec (a `TableCell` ↔ one inline-schema PM
// doc) and the rectangularizing constructors every row and column op goes through
// (CODEC §Islands, §"The table island").
//
// `TableProps` normalizes to ONE column count shared by `header`, every row, and
// `aligns`, so a ragged table is not a state the content can hold. The editor keeps
// its optimistic PM and re-hydrates only on an EXTERNAL change (CODEC
// §Reconciliation), so an op that emitted a ragged table would leave the store
// rectangularized and PM ragged with no error channel and no repair. Every
// constructor here therefore ends in {@link normalizeTable}, and a caller reaches
// the shape only through them.
//
// A cell is its own content unit: `marks` are USV offsets into that cell's `text`,
// not into `Content.text`. That is the second coordinate space, and the inline mode
// the codec already runs (one paragraph, no containers, no islands) is exactly its
// shape, so a cell decodes and projects through the same machinery a
// `richtext(inline)` field does.
import { isAnchorMark, mapPos } from '@quillmark/wasm';
import type { Content, ContentMark, TableCell, TableProps } from '@quillmark/wasm';
import type { Node as PMNode } from 'prosemirror-model';
import { contentEdit, pmToContent } from './encode.js';

/** One column's alignment, read off the boundary rather than restated. */
export type TableAlign = TableProps['aligns'][number];

/** The alignments a column can take: the four the content declares, `none` first
 *  because it is what a column arrives at and what a set is cleared back to. */
export const ALIGNS: readonly TableAlign[] = ['none', 'left', 'center', 'right'];

/** The zero cell: empty text, no marks. */
export function emptyCell(): TableCell {
	return { text: '', marks: [] };
}

/**
 * The row index space the chrome and the ops share: **0 is the header**, 1…n the
 * body rows. A table always has a header (`header` is a separate field, and a
 * header-less table is not expressible), so the header is a row that never
 * deletes rather than a toggle.
 */
export function rowCount(props: TableProps): number {
	return props.rows.length + 1;
}

/** The cells of row `r` in that space. */
export function rowCells(props: TableProps, r: number): TableCell[] {
	return r === 0 ? props.header : (props.rows[r - 1] ?? []);
}

/** The cell at `(row, column)`, or the zero cell where the rectangle does not reach. */
export function cellAt(props: TableProps, r: number, c: number): TableCell {
	return rowCells(props, r)[c] ?? emptyCell();
}

/** The table's column count: the one number `header`, every row and `aligns` share. */
export function columnCount(props: TableProps): number {
	return props.aligns.length;
}

/**
 * The rectangularizing constructor: one column count across `header`, every row and
 * `aligns`, padding with empty cells and `none`. The column count is the widest
 * thing present, so a caller that appended to one axis alone still gets a rectangle
 * back, and a table is never narrower than one column.
 */
export function normalizeTable(props: TableProps): TableProps {
	const cols = Math.max(
		1,
		props.header.length,
		props.aligns.length,
		...props.rows.map((row) => row.length)
	);
	const fit = (cells: TableCell[]): TableCell[] =>
		Array.from({ length: cols }, (_, c) => cells[c] ?? emptyCell());
	return {
		header: fit(props.header),
		rows: props.rows.map(fit),
		aligns: Array.from({ length: cols }, (_, c) => props.aligns[c] ?? 'none')
	};
}

/** A fresh table: a header plus `bodyRows` empty rows, every column unaligned.
 *  Growth is cheap (Tab at the last cell appends a row), so the default is small. */
export function newTable(cols = 3, bodyRows = 2): TableProps {
	return normalizeTable({
		header: Array.from({ length: cols }, emptyCell),
		rows: Array.from({ length: bodyRows }, () => Array.from({ length: cols }, emptyCell)),
		aligns: Array.from({ length: cols }, () => 'none' as TableAlign)
	});
}

/** `props` with the cell at `(r, c)` replaced. */
export function withCell(props: TableProps, r: number, c: number, cell: TableCell): TableProps {
	const replace = (cells: TableCell[]) => cells.map((old, i) => (i === c ? cell : old));
	return normalizeTable({
		header: r === 0 ? replace(props.header) : props.header,
		rows: props.rows.map((row, i) => (i === r - 1 ? replace(row) : row)),
		aligns: props.aligns
	});
}

/** A new empty body row below row `r` (row 0, the header, opens the first body row). */
export function insertRow(props: TableProps, r: number): TableProps {
	const at = Math.max(0, Math.min(r, props.rows.length));
	const fresh = Array.from({ length: columnCount(props) }, emptyCell);
	return normalizeTable({
		...props,
		rows: [...props.rows.slice(0, at), fresh, ...props.rows.slice(at)]
	});
}

/** Drop body row `r`. The header (`r === 0`) has no delete: `header: []` is not a
 *  table, so the asymmetry is the model's rather than a guard's. */
export function deleteRow(props: TableProps, r: number): TableProps {
	if (r === 0) return normalizeTable(props);
	return normalizeTable({ ...props, rows: props.rows.filter((_, i) => i !== r - 1) });
}

/** A new empty column after column `c`. */
export function insertColumn(props: TableProps, c: number): TableProps {
	const at = Math.max(0, Math.min(c + 1, columnCount(props)));
	const splice = (cells: TableCell[]) => [...cells.slice(0, at), emptyCell(), ...cells.slice(at)];
	return normalizeTable({
		header: splice(props.header),
		rows: props.rows.map(splice),
		aligns: [...props.aligns.slice(0, at), 'none' as TableAlign, ...props.aligns.slice(at)]
	});
}

/** Drop column `c`; a no-op at one column (a table has at least one). */
export function deleteColumn(props: TableProps, c: number): TableProps {
	if (columnCount(props) <= 1) return normalizeTable(props);
	const drop = <T>(xs: T[]) => xs.filter((_, i) => i !== c);
	return normalizeTable({
		header: drop(props.header),
		rows: props.rows.map(drop),
		aligns: drop(props.aligns)
	});
}

/** One element moved within an array, out of place. The whole of what both move ops
 *  do to their axis, which is why they can only disagree about the index. */
function move<T>(xs: T[], from: number, to: number): T[] {
	const next = [...xs];
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved!);
	return next;
}

/** Body row `r` moved by `by` places, clamped: a drag that leaves the rectangle is a
 *  no-op rather than an error, since the drop target is geometry and geometry runs
 *  past the last row. The header is refused because it has no destination: it is a
 *  separate field, not row 0 of one array. */
export function moveRow(props: TableProps, r: number, by: number): TableProps {
	const from = r - 1;
	const to = Math.max(0, Math.min(from + by, props.rows.length - 1));
	if (r === 0 || from === to || from >= props.rows.length) return normalizeTable(props);
	return normalizeTable({ ...props, rows: move(props.rows, from, to) });
}

/** Column `c` moved by `by` places, clamped. `aligns` travels with the column: an
 *  alignment is the column's property, so a move that left it behind would retint the
 *  column that took the index. */
export function moveColumn(props: TableProps, c: number, by: number): TableProps {
	const to = Math.max(0, Math.min(c + by, columnCount(props) - 1));
	if (c === to || c < 0 || c >= columnCount(props)) return normalizeTable(props);
	const shift = <T>(xs: T[]): T[] => move(xs, c, to);
	return normalizeTable({
		header: shift(props.header),
		rows: props.rows.map(shift),
		aligns: shift(props.aligns)
	});
}

/** Column `c` with every cell emptied, alignment kept: what a delete gesture means at
 *  the LAST column, which the model keeps. There is no row analogue: the header is the
 *  only row a delete is refused for, and it carries no handle to select it from. */
export function clearColumn(props: TableProps, c: number): TableProps {
	const blank = (cells: TableCell[]): TableCell[] =>
		cells.map((cell, i) => (i === c ? emptyCell() : cell));
	return normalizeTable({
		header: blank(props.header),
		rows: props.rows.map(blank),
		aligns: props.aligns
	});
}

/** Set column `c`'s alignment: the one table capability the content round-trips
 *  today and nothing in the editor could reach. */
export function setAlign(props: TableProps, c: number, align: TableAlign): TableProps {
	return normalizeTable({
		...props,
		aligns: props.aligns.map((a, i) => (i === c ? align : a))
	});
}

// ── The cell codec ──────────────────────────────────────────────────────────

/**
 * A cell as a one-line `Content`: what `decode` takes under the inline schema. The
 * cell's marks ARE that content's marks, because both are offsets into the same
 * text: the cell-local coordinate space is a `Content`'s coordinate space with
 * one line in it.
 */
export function cellContent(cell: TableCell): Content {
	return {
		text: cell.text,
		lines: [{ containers: [], kind: 'para' }],
		marks: cell.marks,
		islands: []
	};
}

/**
 * The cell a nested PM doc projects, carrying `prior`'s identity anchors through.
 *
 * Anchors inside a cell are **preserved verbatim, never minted**: they are not in
 * the field plugin's coordinate space (the field's position map holds one `atom`
 * run for the whole table), so nothing here can mint one and the popover withholds
 * its `anchor` button while the caret is in a cell. Preserving them still means
 * rebasing: a cell edit is a splice like any other, so each held anchor maps through
 * the cell's own text delta by the rule `applyChange` uses on a field's
 * (start-assoc `after`), and a mark the splice deleted through lands where the
 * splice left it rather than pointing past the text.
 */
export function cellFromDoc(doc: PMNode, prior: TableCell): TableCell {
	const projected = pmToContent(doc);
	const text = projected.text;
	const anchors = prior.marks.filter(isAnchorMark);
	if (!anchors.length) return { text, marks: projected.marks };
	const delta = contentEdit(cellContent(prior), cellContent({ text, marks: [] })).delta;
	const rebased = anchors.map((a) => {
		const pos = delta ? mapPos(delta, a.start, 'after') : a.start;
		return { ...a, start: pos, end: pos } as ContentMark;
	});
	return {
		text,
		marks: [...projected.marks, ...rebased].sort((a, b) => a.start - b.start || a.end - b.end)
	};
}

/** Whether two cells are the same value: what tells an own edit (the projection the
 *  view just produced) from an external one (an undo, a re-hydrate) without a flag. */
export function cellEqual(a: TableCell, b: TableCell): boolean {
	return a.text === b.text && JSON.stringify(a.marks) === JSON.stringify(b.marks);
}

/** Whether two tables have the same rectangle and alignment: the change that forces
 *  a rebuild rather than a per-cell reseed. */
export function shapeEqual(a: TableProps, b: TableProps): boolean {
	return (
		a.rows.length === b.rows.length &&
		a.aligns.length === b.aligns.length &&
		a.aligns.every((x, i) => x === b.aligns[i])
	);
}
