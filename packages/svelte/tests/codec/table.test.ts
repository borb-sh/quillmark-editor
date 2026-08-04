// @vitest-environment jsdom
// The table island: the rectangularizing constructors, the cell codec, and the
// NodeView the two meet in.
//
// The load-bearing assertion is the rectangle one. Props NORMALIZE to one column
// count, and the editor holds optimistic PM and re-hydrates only on an EXTERNAL
// change, so an op that emitted a ragged table would leave the store rectangularized
// and PM ragged, permanently, with no error channel. Text gets away with
// normalization drift because it is mark union; a table's drift is structural. So
// every row and column op is asserted install-then-read against its own projection.
import { describe, it, expect } from 'vitest';
import { GapCursor } from 'prosemirror-gapcursor';
import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { createField, decode, blockSchema, inlineSchema } from '$lib/core/codec';
import type { FieldController, IslandMenuState, LeafViews } from '$lib/core/codec';
import {
	ALIGNS,
	cellContent,
	cellFromDoc,
	columnCount,
	deleteColumn,
	deleteRow,
	emptyCell,
	insertColumn,
	insertRow,
	newTable,
	normalizeTable,
	rowCells,
	rowCount,
	setAlign,
	withCell
} from '$lib/core/codec/table.js';
import { mintIslandId } from '$lib/core/codec/islands.js';
import type { Content, TableCell, TableProps } from '@quillmark/wasm';
import { mount, press, quill, md } from './_util.js';

const TABLE_MD = 'para\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\ntail';

function cell(text: string): TableCell {
	return { text, marks: [] };
}

/** The table island's props in a content. */
function propsOf(rt: Content): TableProps {
	return rt.islands[0].props as TableProps;
}

/** A content holding one table island, with `props` in place of the imported ones. */
function withTable(props: TableProps): Content {
	const rt = md(TABLE_MD);
	rt.islands[0].props = props;
	return rt;
}

/** Install a content and read it back: the store's own normalization, which is what
 *  a ragged op would be caught by. */
function stored(rt: Content): Content {
	const doc = quill().seedDocument();
	doc.install({}, rt);
	return doc.main.body;
}

/** The table `text` grid, the shape assertions read against. */
function grid(props: TableProps): string[][] {
	return Array.from({ length: rowCount(props) }, (_, r) => rowCells(props, r).map((c) => c.text));
}

const LETTERED = normalizeTable({
	header: [cell('h1'), cell('h2')],
	rows: [
		[cell('a1'), cell('a2')],
		[cell('b1'), cell('b2')]
	],
	aligns: ['left', 'right']
});

describe('the rectangle survives every op', () => {
	// One case per op, each asserted the same way: what the store holds after an
	// install is exactly the projection the editor is showing.
	const OPS: { name: string; run: (p: TableProps) => TableProps }[] = [
		{ name: 'insert a row below the header', run: (p) => insertRow(p, 0) },
		{ name: 'insert a row below the last', run: (p) => insertRow(p, rowCount(p) - 1) },
		{ name: 'delete a body row', run: (p) => deleteRow(p, 1) },
		{ name: 'insert a column left', run: (p) => insertColumn(p, -1) },
		{ name: 'insert a column right', run: (p) => insertColumn(p, 0) },
		{ name: 'delete a column', run: (p) => deleteColumn(p, 1) },
		{ name: 'set an alignment', run: (p) => setAlign(p, 1, 'center') },
		{ name: 'clear an alignment back to the default', run: (p) => setAlign(p, 0, 'none') },
		{ name: 'set a cell', run: (p) => withCell(p, 1, 0, cell('typed')) }
	];

	for (const op of OPS) {
		it(`${op.name}: install-then-read equals the projection`, () => {
			const next = op.run(LETTERED);
			// The op's own output is already a rectangle…
			expect(next.header).toHaveLength(columnCount(next));
			for (const row of next.rows) expect(row).toHaveLength(columnCount(next));
			// …and the store agrees, cell for cell and alignment for alignment.
			const back = propsOf(stored(withTable(next)));
			expect(grid(back)).toEqual(grid(next));
			expect(back.aligns).toEqual(next.aligns);
		});
	}

	it('a ragged table normalizes to the widest axis rather than the narrowest', () => {
		const ragged = normalizeTable({
			header: [cell('h')],
			rows: [[cell('a'), cell('b'), cell('c')]],
			aligns: []
		});
		expect(columnCount(ragged)).toBe(3);
		expect(ragged.header.map((c) => c.text)).toEqual(['h', '', '']);
		expect(ragged.aligns).toEqual(['none', 'none', 'none']);
	});
});

describe('what the model already answers', () => {
	it('the header has no delete: `header: []` is not a table', () => {
		expect(grid(deleteRow(LETTERED, 0))).toEqual(grid(LETTERED));
	});

	it('a one-column table keeps its column', () => {
		const one = newTable(1, 1);
		expect(columnCount(deleteColumn(one, 0))).toBe(1);
	});

	it('an insert to the left of the first column lands at the front', () => {
		const wider = insertColumn(LETTERED, -1);
		expect(wider.header.map((c) => c.text)).toEqual(['', 'h1', 'h2']);
		expect(wider.aligns).toEqual(['none', 'left', 'right']);
	});

	it('every alignment the content declares is settable, the default included', () => {
		for (const align of ALIGNS) {
			expect(setAlign(LETTERED, 0, align).aligns[0]).toBe(align);
		}
	});

	it('a minted island id continues the positional sequence', () => {
		const doc = decode(md(TABLE_MD), blockSchema);
		expect(mintIslandId(doc)).toBe('isl-1');
		expect(mintIslandId(decode(md('nothing here'), blockSchema))).toBe('isl-0');
	});
});

describe('the cell codec: a cell is a corpus of its own', () => {
	/** A cell through decode and back: the round-trip a keystroke rides. */
	function roundTrip(c: TableCell): TableCell {
		return cellFromDoc(decode(cellContent(c), inlineSchema), c);
	}

	it("a cell's marks are cell-local and survive the trip", () => {
		const c: TableCell = { text: 'bold text', marks: [{ start: 0, end: 4, type: 'strong' }] };
		expect(roundTrip(c)).toEqual(c);
	});

	it('an anchor in a cell is preserved verbatim across an edit', () => {
		const c: TableCell = {
			text: 'abcd',
			marks: [{ start: 3, end: 3, type: 'anchor', id: 'a1' }] as TableCell['marks']
		};
		// Retype the cell to something longer, inserted BEFORE the anchor.
		const edited = decode(cellContent({ text: 'XXabcd', marks: [] }), inlineSchema);
		const next = cellFromDoc(edited, c);
		const anchor = next.marks.find((m) => m.type === 'anchor') as { start: number; id: string };
		expect(anchor.id).toBe('a1');
		expect(anchor.start).toBe(5); // rebased through the two inserted chars
	});

	it('a cell holds no line: a stray newline joins rather than splitting', () => {
		const c: TableCell = { text: 'one\ntwo', marks: [] };
		expect(roundTrip(c).text).toBe('one two');
	});
});

// ── The NodeView ────────────────────────────────────────────────────────────

/** A body holding one table island, mounted as a leaf, with the line menu's reports
 *  captured: the chrome's whole view of the island. */
function tableLeaf(props?: TableProps) {
	const doc = quill().seedDocument();
	doc.install({}, props ? withTable(props) : md(TABLE_MD));
	let menu: IslandMenuState | undefined;
	const field = createField({
		doc,
		quill: quill(),
		addr: {},
		container: mount(),
		onIslandMenu: (next) => {
			menu = next;
		}
	});
	return { doc, field, menu: () => menu };
}

/** The row handles, in order (body rows only), and the column handles. Both read off
 *  a GUTTER cell, which is what leaves the corner (the island's own handle) out of
 *  either set. */
function handles(field: FieldController, kind: 'row' | 'column'): HTMLButtonElement[] {
	const rows = field.el.querySelectorAll<HTMLButtonElement>(
		kind === 'column'
			? '.qm-table-gutter-row .qm-table-gutter .qm-table-handle'
			: 'tr:not(.qm-table-gutter-row) .qm-table-gutter .qm-table-handle'
	);
	return Array.from(rows);
}

/** The corner: the island's block handle. */
function corner(field: FieldController): HTMLButtonElement {
	return field.el.querySelector<HTMLButtonElement>('.qm-table-corner-handle')!;
}

/** The leaf's own view: the document the island sits in. */
function outerView(field: FieldController): EditorView {
	return (field as FieldController & LeafViews).view;
}

/** The nested cell views, in mount (reading) order: the leaf's own handle, which
 *  the format popover reads for the same reason (`LeafViews`). */
function cellViews(field: FieldController): EditorView[] {
	return (field as FieldController & LeafViews).nestedViews();
}

/** The stored table props for a mounted leaf. */
function leafProps(field: FieldController): TableProps {
	return propsOf(field.getContent());
}

describe('the table NodeView', () => {
	it('draws one handle per line and a `+` per growing edge, and nothing else', () => {
		const { field } = tableLeaf(LETTERED);
		expect(field.el.querySelectorAll('.qm-table-cell-host').length).toBe(6);
		expect(field.el.querySelectorAll('th.qm-table-cell').length).toBe(2);
		// One handle per COLUMN and per BODY row: the header carries none, since its
		// menu would hold one item the first body row's "insert above" already is.
		expect(handles(field, 'column')).toHaveLength(2);
		expect(handles(field, 'row')).toHaveLength(2);
		// Two `+` strips, whatever the rectangle is.
		expect(field.el.querySelectorAll('.qm-table-add')).toHaveLength(2);
		field.destroy();
	});

	it('a cell keystroke reaches the store through the island channel', () => {
		const { doc, field } = tableLeaf(LETTERED);
		const before = doc.main.body.text;
		const cellView = cellViews(field)[0];
		cellView.dispatch(cellView.state.tr.insertText('!', 1));
		expect(leafProps(field).header[0].text).toBe('!h1');
		// The field's own text never saw it: cell text lives in the entry.
		expect(doc.main.body.text).toBe(before);
		field.destroy();
	});

	it('every anchor in the FIELD survives a cell keystroke', () => {
		const { doc, field } = tableLeaf(LETTERED);
		field.insertAnchor('a1', 2);
		const cellView = cellViews(field)[0];
		cellView.dispatch(cellView.state.tr.insertText('!', 1));
		expect(doc.main.body.marks.some((m) => m.type === 'anchor')).toBe(true);
		field.destroy();
	});

	it('the edited cell keeps its caret: an own edit reseeds nothing', () => {
		const { field } = tableLeaf(LETTERED);
		const cellView = cellViews(field)[0];
		const before = cellView.state;
		cellView.dispatch(cellView.state.tr.insertText('!', 1));
		// The same state object advanced; a reseed would have replaced it wholesale
		// and put the caret back at the start.
		expect(cellView.state).not.toBe(before);
		expect(cellView.state.selection.head).toBe(2);
		field.destroy();
	});

	it('a row handle raises its three offers, and a pick lands', () => {
		const { field, menu } = tableLeaf(LETTERED);
		handles(field, 'row')[0].click();
		expect(menu()?.items.map((i) => i.id)).toEqual(['insert-above', 'insert-below', 'delete']);
		menu()!.run('insert-below');
		const props = leafProps(field);
		expect(props.rows).toHaveLength(3);
		expect(props.rows[1].map((c) => c.text)).toEqual(['', '']); // the fresh row is BELOW row 1
		expect(menu()).toBeUndefined(); // a pick closes
		field.destroy();
	});

	it('a row handle deletes its own row', () => {
		const { field, menu } = tableLeaf(LETTERED);
		handles(field, 'row')[0].click();
		menu()!.run('delete');
		expect(grid(leafProps(field))).toEqual([
			['h1', 'h2'],
			['b1', 'b2']
		]);
		field.destroy();
	});

	it("a column handle carries the alignments, marking the column's own", () => {
		const { field, menu } = tableLeaf(LETTERED);
		handles(field, 'column')[1].click();
		const items = menu()!.items;
		expect(items.map((i) => i.id)).toEqual([
			'insert-left',
			'insert-right',
			'align:none',
			'align:left',
			'align:center',
			'align:right',
			'delete'
		]);
		expect(items.find((i) => i.checked)?.id).toBe('align:right'); // LETTERED's column 2
		menu()!.run('align:center');
		expect(leafProps(field).aligns).toEqual(['left', 'center']);
		field.destroy();
	});

	it('the last column offers no delete: absent, not disabled', () => {
		const { field, menu } = tableLeaf(newTable(1, 1));
		handles(field, 'column')[0].click();
		expect(menu()?.items.some((i) => i.id === 'delete')).toBe(false);
		field.destroy();
	});

	it('a second press on the same handle closes the menu', () => {
		const { field, menu } = tableLeaf(LETTERED);
		const handle = handles(field, 'row')[0];
		handle.click();
		expect(menu()).toBeDefined();
		expect(handle.getAttribute('aria-expanded')).toBe('true');
		handle.click();
		expect(menu()).toBeUndefined();
		expect(handle.getAttribute('aria-expanded')).toBe('false');
		field.destroy();
	});

	it('the `+` strips grow the table by one line each', () => {
		const { field } = tableLeaf(LETTERED);
		const [addColumn, addRow] = Array.from(
			field.el.querySelectorAll<HTMLButtonElement>('.qm-table-add')
		);
		addColumn.click();
		expect(columnCount(leafProps(field))).toBe(3);
		addRow.click();
		expect(leafProps(field).rows).toHaveLength(3);
		// Both grew the rectangle rather than the axis they were on alone.
		expect(grid(leafProps(field)).every((row) => row.length === 3)).toBe(true);
		field.destroy();
	});

	it('Tab past the last cell appends a row; the store follows', () => {
		const { field } = tableLeaf(LETTERED);
		const views = cellViews(field);
		const last = views[views.length - 1];
		last.focus();
		press(last, 'Tab');
		expect(leafProps(field).rows).toHaveLength(3);
		field.destroy();
	});

	it('Enter in a cell is the next row, never a newline', () => {
		const { field } = tableLeaf(LETTERED);
		const views = cellViews(field);
		views[0].focus();
		press(views[0], 'Enter');
		expect(leafProps(field).header[0].text).toBe('h1'); // no newline landed
		expect(leafProps(field).rows).toHaveLength(2); // and no row was appended
		// The caret is in the cell below, which is the whole of what Enter means here.
		expect((field as FieldController & LeafViews).focusedView()).toBe(views[2]);
		field.destroy();
	});

	it('Escape leaves the cell for the island, which Backspace then deletes', () => {
		const { doc, field } = tableLeaf(LETTERED);
		const first = cellViews(field)[0];
		first.focus();
		press(first, 'Escape');
		const outer = outerView(field);
		const selection = outer.state.selection;
		expect(selection instanceof NodeSelection && selection.node.type.name).toBe('island_block');
		outer.dispatch(outer.state.tr.deleteSelection());
		expect(doc.main.body.islands).toHaveLength(0);
		field.destroy();
	});

	it('an external re-hydrate reseeds the cells', () => {
		const { doc, field } = tableLeaf(LETTERED);
		const next = withCell(LETTERED, 0, 0, cell('EXTERNAL'));
		doc.install({}, withTable(next));
		field.applyExternal();
		expect(cellViews(field)[0].state.doc.textContent).toBe('EXTERNAL');
		field.destroy();
	});

	it('a cell mounts the inline schema, which is the mode the cell codec speaks', () => {
		const { field } = tableLeaf(LETTERED);
		expect(cellViews(field)[0].state.schema).toBe(inlineSchema);
		field.destroy();
	});

	it('a non-table island keeps the literal placeholder', () => {
		const doc = quill().seedDocument();
		const rt = md(TABLE_MD);
		rt.islands[0] = { id: 'isl-0', type: 'chart', props: { any: 1 }, loss: 'unrepresentable' };
		doc.install({}, rt);
		const field = createField({ doc, quill: quill(), addr: {}, container: mount() });
		expect(field.el.querySelector('table')).toBeNull();
		expect(field.el.textContent).toContain('[chart]');
		field.destroy();
	});
});

// ── The pointer, and what a selection is for ────────────────────────────────
//
// Click-to-NodeSelect belongs to an atom with no interior, and a table has cells. So
// a press on the chrome resolves to a CARET (inside the frame the nearest cell's,
// outside it the document's), and a printable key over a selected island writes past
// it rather than replacing it. What selects the island is a named gesture: the
// corner, or Escape.

interface Box {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

const domRect = (box: Box): DOMRect =>
	({
		...box,
		x: box.left,
		y: box.top,
		width: box.right - box.left,
		height: box.bottom - box.top,
		toJSON: () => box
	}) as DOMRect;

// The island's boxes, which jsdom lays nothing out to produce: the bands are geometry,
// so a test that drives them supplies one. The grid sits inset in the island, and the
// six cell hosts (reading order) tile it inside a gutter row and column.
const ISLAND: Box = { left: 0, top: 0, right: 200, bottom: 120 };
const GRID: Box = { left: 10, top: 10, right: 190, bottom: 90 };
const HOSTS: Box[] = [
	{ left: 30, top: 20, right: 100, bottom: 40 },
	{ left: 110, top: 20, right: 180, bottom: 40 },
	{ left: 30, top: 45, right: 100, bottom: 65 },
	{ left: 110, top: 45, right: 180, bottom: 65 },
	{ left: 30, top: 70, right: 100, bottom: 85 },
	{ left: 110, top: 70, right: 180, bottom: 85 }
];

function layout(field: FieldController, hosts: Box[] = HOSTS): void {
	const stub = (el: Element | null, box: Box) => {
		if (el) (el as HTMLElement).getBoundingClientRect = () => domRect(box);
	};
	stub(field.el.querySelector('.qm-table-island'), ISLAND);
	stub(field.el.querySelector('.qm-table-grid'), GRID);
	field.el
		.querySelectorAll('.qm-table-cell-host')
		.forEach((host, i) => hosts[i] && stub(host, hosts[i]));
}

// jsdom implements no `Range` rects, and PM reads them to scroll a caret it just
// moved into view. The one browser API a landing past the island touches, stubbed at
// the zero box: what is under test is where the caret WENT, not what scrolled.
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => domRect({ left: 0, top: 0, right: 0, bottom: 0 });

/** A press at a viewport point, on the element under it: `mousedown` is where the
 *  guard sits, being where PM arms the selection the mouseup would take. */
function pressAt(target: Element, x: number, y: number): void {
	target.dispatchEvent(
		new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: x, clientY: y })
	);
}

/** The `td` of a cell, which is the cell's PADDING and its borders: chrome inside the
 *  frame, and the commonest place a press misses a host by a few pixels. */
function cellBox(field: FieldController, index: number): Element {
	return field.el.querySelectorAll('.qm-table-cell')[index];
}

/** Drive a printable key at a mounted view the way an input event does: PM routes
 *  text over a non-`TextSelection` through this prop before replacing the selection. */
function type(view: EditorView, text: string): boolean {
	const { from, to } = view.state.selection;
	return !!view.someProp('handleTextInput', (f) => f(view, from, to, text, () => view.state.tr));
}

describe('a pointer press on the island resolves to a caret', () => {
	it('inside the frame it lands in the NEAREST cell, by geometry', () => {
		const { field } = tableLeaf(LETTERED);
		layout(field);
		// The border between the two cells of row 1, a hair into the left one.
		pressAt(cellBox(field, 2), 103, 55);
		expect((field as FieldController & LeafViews).focusedView()).toBe(cellViews(field)[2]);
		expect(outerView(field).state.selection instanceof NodeSelection).toBe(false);
		field.destroy();
	});

	it("the gutter is the table's band too: it focuses, it does not select", () => {
		const { field } = tableLeaf(LETTERED);
		layout(field);
		const gutter = field.el.querySelectorAll('tr:not(.qm-table-gutter-row) .qm-table-gutter')[1];
		pressAt(gutter, 20, 78); // beside the last row, left of every cell
		expect((field as FieldController & LeafViews).focusedView()).toBe(cellViews(field)[4]);
		field.destroy();
	});

	it('outside the frame it writes beside the table, on the side it landed', () => {
		const { field } = tableLeaf(LETTERED);
		layout(field);
		const island = field.el.querySelector('.qm-table-island')!;
		pressAt(island, 195, 110); // below the grid: the document's band
		const after = outerView(field).state.selection;
		expect(after instanceof TextSelection).toBe(true);
		expect(after.$head.parent.textContent).toBe('tail');
		pressAt(island, 5, 5); // above it
		const before = outerView(field).state.selection;
		expect(before.$head.parent.textContent).toBe('para');
		field.destroy();
	});

	it('a gap cursor is the caret where the document holds no text position', () => {
		// The island is the whole document, so there is no block beside it to write in.
		const doc = quill().seedDocument();
		doc.install({}, md('| a | b |\n|---|---|\n| 1 | 2 |'));
		const field = createField({ doc, quill: quill(), addr: {}, container: mount() });
		layout(field, HOSTS.slice(0, 4));
		pressAt(field.el.querySelector('.qm-table-island')!, 195, 110);
		expect(outerView(field).state.selection instanceof GapCursor).toBe(true);
		field.destroy();
	});

	it('an island with no interior keeps the click: the rule, not an exception', () => {
		const doc = quill().seedDocument();
		const rt = md(TABLE_MD);
		rt.islands[0] = { id: 'isl-0', type: 'chart', props: { any: 1 }, loss: 'unrepresentable' };
		doc.install({}, rt);
		const field = createField({ doc, quill: quill(), addr: {}, container: mount() });
		// Dispatched AT the island rather than through it: PM's own mousedown wants a
		// `elementFromPoint` jsdom does not have, and what is asserted is that the
		// guard declined to stand in front of it.
		const event = new MouseEvent('mousedown', { cancelable: true, clientX: 5, clientY: 5 });
		field.el.querySelector('.qm-table-island')!.dispatchEvent(event);
		expect(event.defaultPrevented).toBe(false);
		field.destroy();
	});
});

describe("the corner is the island's handle", () => {
	it('a press selects the island and raises the whole-table delete', () => {
		const { doc, field, menu } = tableLeaf(LETTERED);
		corner(field).click();
		const selection = outerView(field).state.selection;
		expect(selection instanceof NodeSelection && selection.node.type.name).toBe('island_block');
		expect(menu()?.items.map((i) => i.id)).toEqual(['delete']);
		menu()!.run('delete');
		expect(doc.main.body.islands).toHaveLength(0);
		expect(doc.main.body.text).toBe('para\ntail');
		field.destroy();
	});

	it('it is not a line handle: the row and column sets are unchanged', () => {
		const { field } = tableLeaf(LETTERED);
		expect(handles(field, 'column')).toHaveLength(2);
		expect(handles(field, 'row')).toHaveLength(2);
		expect(field.el.querySelectorAll('.qm-table-corner-handle')).toHaveLength(1);
		field.destroy();
	});
});

describe('a selection is the subject of the next command', () => {
	it('a printable key over a BLOCK island opens a paragraph after it', () => {
		const { doc, field } = tableLeaf(LETTERED);
		const first = cellViews(field)[0];
		first.focus();
		press(first, 'Escape');
		const outer = outerView(field);
		expect(type(outer, 'x')).toBe(true);
		expect(doc.main.body.islands).toHaveLength(1); // the table stands
		expect(outer.state.doc.child(2).textContent).toBe('x');
		expect(outer.state.selection instanceof TextSelection).toBe(true);
		expect(outer.state.selection.empty).toBe(true);
		field.destroy();
	});

	it('a printable key over an INLINE island lands after the image, in its line', () => {
		const doc = quill().seedDocument();
		doc.install({}, md('a ![alt](url) b'));
		const field = createField({ doc, quill: quill(), addr: {}, container: mount() });
		const outer = outerView(field);
		let at = -1;
		outer.state.doc.descendants((node, pos) => {
			if (node.type.name === 'island_inline') at = pos;
		});
		expect(at).toBeGreaterThan(-1);
		outer.dispatch(outer.state.tr.setSelection(NodeSelection.create(outer.state.doc, at)));
		expect(type(outer, 'x')).toBe(true);
		expect(doc.main.body.islands).toHaveLength(1); // the image stands
		expect(doc.main.body.text).toBe('a ￼x b');
		field.destroy();
	});

	it('Backspace still deletes it: the destructive key is the deliberate one', () => {
		const { doc, field } = tableLeaf(LETTERED);
		corner(field).click();
		const outer = outerView(field);
		outer.dispatch(outer.state.tr.deleteSelection());
		expect(doc.main.body.islands).toHaveLength(0);
		field.destroy();
	});
});
