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
import { EditorState, NodeSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { createField, decode, blockSchema, inlineSchema } from '$lib/core/codec';
import type { FieldController, LeafViews } from '$lib/core/codec';
import {
	ALIGN_CYCLE,
	cellContent,
	cellFromDoc,
	columnCount,
	cycleAlign,
	deleteColumn,
	deleteRow,
	emptyCell,
	insertColumn,
	insertRow,
	moveColumn,
	moveRow,
	newTable,
	normalizeTable,
	rowCells,
	rowCount,
	setAlign,
	withCell
} from '$lib/core/codec/table.js';
import { mintIslandId } from '$lib/core/codec/islands.js';
import type { Content, TableCell, TableProps } from '@quillmark/wasm';
import { quill, md } from './_util.js';

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
		{ name: 'move a row down', run: (p) => moveRow(p, 1, 1) },
		{ name: 'move the header down', run: (p) => moveRow(p, 0, 1) },
		{ name: 'insert a column', run: (p) => insertColumn(p, 0) },
		{ name: 'delete a column', run: (p) => deleteColumn(p, 1) },
		{ name: 'move a column right', run: (p) => moveColumn(p, 0, 1) },
		{ name: 'set an alignment', run: (p) => setAlign(p, 1, 'center') },
		{ name: 'cycle an alignment', run: (p) => cycleAlign(p, 0) },
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

	it('moving the header trades its CELLS with the first body row', () => {
		const moved = moveRow(LETTERED, 0, 1);
		expect(moved.header.map((c) => c.text)).toEqual(['a1', 'a2']);
		expect(moved.rows[0].map((c) => c.text)).toEqual(['h1', 'h2']);
		expect(moved.rows[1].map((c) => c.text)).toEqual(['b1', 'b2']);
	});

	it('a one-column table keeps its column', () => {
		const one = newTable(1, 1);
		expect(columnCount(deleteColumn(one, 0))).toBe(1);
	});

	it('a column carries its alignment when it moves', () => {
		const moved = moveColumn(LETTERED, 0, 1);
		expect(moved.aligns).toEqual(['right', 'left']);
		expect(moved.header.map((c) => c.text)).toEqual(['h2', 'h1']);
	});

	it('the alignment control walks the four the content declares', () => {
		let props = setAlign(LETTERED, 0, 'none');
		for (const expected of [...ALIGN_CYCLE.slice(1), 'none']) {
			props = cycleAlign(props, 0);
			expect(props.aligns[0]).toBe(expected);
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

function mount(): HTMLElement {
	const el = document.createElement('div');
	document.body.appendChild(el);
	return el;
}

/** A body holding one table island, mounted as a leaf. */
function tableLeaf(props?: TableProps) {
	const doc = quill().seedDocument();
	doc.install({}, props ? withTable(props) : md(TABLE_MD));
	const field = createField({ doc, quill: quill(), addr: {}, container: mount() });
	return { doc, field };
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
	it('renders a cell editor per cell, header included', () => {
		const { field } = tableLeaf(LETTERED);
		expect(field.el.querySelectorAll('.qm-table-cell-host').length).toBe(6);
		expect(field.el.querySelectorAll('th.qm-table-cell').length).toBe(2);
		// The header row offers add and reorder but never delete; a body row has all four.
		const handles = field.el.querySelectorAll('.qm-table-handle');
		// One per column, then one per row (header + 2 body rows).
		expect(handles.length).toBe(2 + 3);
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

	it('a row op rebuilds the rectangle and the store agrees', () => {
		const { field } = tableLeaf(LETTERED);
		const rowHandles = field.el.querySelectorAll('.qm-table-handle');
		// Handles are the columns' first, then the rows': the header's insert is the
		// first button of the third handle.
		const headerHandle = rowHandles[columnCount(LETTERED)];
		(headerHandle.querySelector('button') as HTMLButtonElement).click();
		const props = leafProps(field);
		expect(props.rows).toHaveLength(3);
		expect(props.rows[0].map((c) => c.text)).toEqual(['', '']);
		expect(field.el.querySelectorAll('.qm-table-cell-host').length).toBe(8);
		field.destroy();
	});

	it('a column op carries the alignment and stays rectangular', () => {
		const { field } = tableLeaf(LETTERED);
		const columnHandle = field.el.querySelectorAll('.qm-table-handle')[0];
		// The first button is the alignment cycle.
		(columnHandle.querySelector('button') as HTMLButtonElement).click();
		expect(leafProps(field).aligns).toEqual(['center', 'right']);
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
		const outer = (field as FieldController & LeafViews).view;
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

/** Drive one key at a nested view the way the browser would: PM's own
 *  `someProp('handleKeyDown')` over a synthesized event. */
function press(view: EditorView, key: string): void {
	const event = new KeyboardEvent('keydown', { key, bubbles: true });
	view.someProp('handleKeyDown', (f) => f(view, event));
}

// A cell view is an ordinary `EditorState`, so the keymap is drivable without the
// DOM at all; this is the check that the two agree.
describe('a cell view is the inline mode', () => {
	it('mounts the inline schema, which holds no island and no block', () => {
		const { field } = tableLeaf(LETTERED);
		const state: EditorState = cellViews(field)[0].state;
		expect(state.schema).toBe(inlineSchema);
		expect(state.schema.nodes.island_inline).toBeUndefined();
		expect(state.schema.nodes.blockquote).toBeUndefined();
		field.destroy();
	});
});

describe('the zero table', () => {
	it('opens with a header and two rows, and grows by one op', () => {
		const fresh = newTable();
		expect(columnCount(fresh)).toBe(3);
		expect(fresh.rows).toHaveLength(2);
		expect(fresh.header).toEqual([emptyCell(), emptyCell(), emptyCell()]);
	});
});
