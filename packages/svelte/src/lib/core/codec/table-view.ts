// The table island's NodeView: the surface a `table` island is edited through
// (CODEC §"The table island", VISUAL_EDITOR_UIUX §"Table island"). Vanilla DOM
// rather than Svelte chrome, because what it renders is PM's own: a leaf node's
// substitute DOM, holding one nested `EditorView` per cell.
//
// A cell is a second corpus inside the first, so it gets the codec's INLINE mode
// (one paragraph, no containers, no islands, marks and input rules intact);
// `table.ts` owns that translation. A cell edit does not touch the field's text:
// the projection goes back onto the node's `props` attribute with `setNodeMarkup`,
// and the field's own `dispatchTransaction` lowers that to an `islandOps` `set`
// (CODEC §Encode), which is what keeps every anchor in the field.
//
// The nested views are NOT the field's: they carry no history (Mod-z routes to the
// field's, so one undo stack covers the leaf), no anchor plugin (an anchor in a cell
// is preserved, never minted), and no placeholder.
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState, NodeSelection, Selection, type Command } from 'prosemirror-state';
import { EditorView, type NodeView, type NodeViewConstructor } from 'prosemirror-view';
import type { TableProps } from '@quillmark/wasm';
import { decode } from './decode.js';
import { inputRulesPlugin } from './inputrules.js';
import { tablePropsOfNode } from './islands.js';
import { inlineSchema } from './schema.js';
import {
	cellAt,
	cellContent,
	cellEqual,
	cellFromDoc,
	columnCount,
	cycleAlign,
	deleteColumn,
	deleteRow,
	insertColumn,
	insertRow,
	moveColumn,
	moveRow,
	normalizeTable,
	rowCells,
	rowCount,
	shapeEqual,
	withCell,
	type TableAlign
} from './table.js';

/** Everything the island's chrome says. Accessible names, not decoration: the
 *  handles are glyphs, so an untranslated one reads the wrong language rather than
 *  merely inconsistent (VISUAL_EDITOR §"What the surface says"). */
export interface TableChromeStrings {
	/** The island's own name, on the wrapper. */
	tableLabel: string;
	/** A row handle group's name. Row 0 is the header, which is not "Row 0". */
	tableHeaderRow: string;
	tableRow: (index: number) => string;
	tableColumn: (index: number) => string;
	/** A cell's accessible name: nothing else names a nested leaf. */
	tableCell: (row: string, column: string) => string;
	tableRowInsert: string;
	tableRowMoveUp: string;
	tableRowMoveDown: string;
	tableRowDelete: string;
	tableColumnInsert: string;
	tableColumnMoveLeft: string;
	tableColumnMoveRight: string;
	tableColumnDelete: string;
	/** The alignment control's name, which says the state it will move to. */
	tableAlign: (align: TableAlign) => string;
}

/**
 * The package's English for the island chrome. It lives HERE, beside the surface
 * that draws it, rather than in the visual tier's table: the codec mounts this
 * chrome and a consumer reaching `createField` directly gets wording with it. The
 * visual `strings` set extends this one, so a consumer overrides these keys beside
 * every other key and there is still one English list.
 */
export const DEFAULT_TABLE_STRINGS: TableChromeStrings = {
	tableLabel: 'Table',
	tableHeaderRow: 'Header row',
	tableRow: (index) => `Row ${index}`,
	tableColumn: (index) => `Column ${index}`,
	tableCell: (row, column) => `${row}, ${column}`,
	tableRowInsert: 'Insert row below',
	tableRowMoveUp: 'Move row up',
	tableRowMoveDown: 'Move row down',
	tableRowDelete: 'Delete row',
	tableColumnInsert: 'Insert column after',
	tableColumnMoveLeft: 'Move column left',
	tableColumnMoveRight: 'Move column right',
	tableColumnDelete: 'Delete column',
	tableAlign: (align) => `Alignment: ${align}`
};

/** What the field hands each island view: its wording (read live, so a locale swap
 *  re-renders), and the two callbacks that keep a nested view visible to the leaf. */
export interface TableViewDeps {
	strings: () => TableChromeStrings;
	/** Register a mounted cell view; the returned function unregisters it. The field
	 *  needs the set to answer "which view holds the caret" for the format popover. */
	register: (view: EditorView) => () => void;
	/** A cell took focus: the leaf's own `focus` handler never fires for one (a focus
	 *  event does not bubble), so the active address would not follow the caret. */
	onCellFocus: () => void;
}

/** Lucide geometry, as the path data a DOM node can carry: the glyphs the card
 *  stack's controls draw, in the one place chrome is built without Svelte. */
const GLYPHS: Record<string, string[]> = {
	plus: ['M5 12h14', 'M12 5v14'],
	up: ['m18 15-6-6-6 6'],
	down: ['m6 9 6 6 6-6'],
	left: ['m15 18-6-6 6-6'],
	right: ['m9 18 6-6-6-6'],
	x: ['M18 6 6 18', 'M6 6l12 12'],
	alignNone: ['M3 12h18', 'M3 18h18', 'M3 6h18'],
	alignLeft: ['M21 6H3', 'M15 12H3', 'M17 18H3'],
	alignCenter: ['M21 6H3', 'M17 12H7', 'M19 18H5'],
	alignRight: ['M21 6H3', 'M21 12H9', 'M21 18H7']
};

const ALIGN_GLYPH: Record<TableAlign, string> = {
	none: 'alignNone',
	left: 'alignLeft',
	center: 'alignCenter',
	right: 'alignRight'
};

function svg(name: string): SVGElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 24 24');
	el.setAttribute('fill', 'none');
	el.setAttribute('stroke', 'currentColor');
	el.setAttribute('stroke-width', '2');
	el.setAttribute('stroke-linecap', 'round');
	el.setAttribute('stroke-linejoin', 'round');
	el.setAttribute('aria-hidden', 'true');
	for (const d of GLYPHS[name] ?? []) {
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', d);
		el.appendChild(path);
	}
	return el;
}

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (className) node.className = className;
	return node;
}

/** One handle button. It swallows its own `mousedown` (prosemirror-menu's trick, and
 *  the format popover's): without it the browser focuses the button, blurring the
 *  cell whose caret the op is about to be measured against. */
function handleButton(glyph: string, label: string, run: () => void): HTMLButtonElement {
	const btn = el('button', 'qm-table-btn');
	btn.type = 'button';
	btn.title = label;
	btn.setAttribute('aria-label', label);
	btn.appendChild(svg(glyph));
	btn.addEventListener('mousedown', (e) => e.preventDefault());
	btn.addEventListener('click', (e) => {
		e.preventDefault();
		run();
	});
	return btn;
}

/** A cell's plugin stack: marks and the markdown shorthands, and nothing that
 *  belongs to the field (history, anchors, the ghost). */
function cellPlugins(keys: Record<string, Command>) {
	return [inputRulesPlugin(inlineSchema), keymap(keys), keymap(baseKeymap)];
}

interface MountedCell {
	view: EditorView;
	unregister: () => void;
	r: number;
	c: number;
}

class TableIslandView implements NodeView {
	readonly dom: HTMLElement;
	private cells: MountedCell[] = [];
	/** The props the current DOM was built from: what a `update` compares against to
	 *  tell a reseed from a rebuild. */
	private rendered: TableProps | undefined;

	constructor(
		private node: PMNode,
		private readonly outer: EditorView,
		private readonly getPos: () => number | undefined,
		private readonly deps: TableViewDeps
	) {
		this.dom = el('div', 'qm-island qm-table-island');
		this.dom.setAttribute('data-island', node.attrs.islandType as string);
		this.dom.setAttribute('data-island-id', node.attrs.id as string);
		this.render();
	}

	// ── PM's NodeView contract ────────────────────────────────────────────────

	update(node: PMNode): boolean {
		if (node.type !== this.node.type) return false;
		const before = this.rendered;
		this.node = node;
		const props = tablePropsOfNode(node);
		if (!props || !before || !shapeEqual(before, props)) {
			this.render();
			return true;
		}
		// Same rectangle: reseed only the cells whose value the nested view is not
		// already showing. The cell that PRODUCED this update projects to exactly what
		// it stored, so it compares equal and keeps its caret; an undo or an external
		// re-hydrate does not, and takes the fresh state.
		this.rendered = props;
		for (const mounted of this.cells) {
			const stored = cellAt(props, mounted.r, mounted.c);
			if (cellEqual(stored, cellFromDoc(mounted.view.state.doc, stored))) continue;
			mounted.view.updateState(
				EditorState.create({
					doc: decode(cellContent(stored), inlineSchema),
					plugins: cellPlugins(this.cellKeys(mounted.r, mounted.c))
				})
			);
		}
		return true;
	}

	/** The nested views own every event inside a cell or a handle; everything else
	 *  (the island's own padding, its border) stays PM's, so a click beside the table
	 *  still selects the node and Backspace still deletes it. */
	stopEvent(event: Event): boolean {
		const target = event.target as Element | null;
		return !!target?.closest?.('.qm-table-cell-host, .qm-table-handle');
	}

	/** Nothing in this subtree is PM-managed: the cells are separate views. */
	ignoreMutation(): boolean {
		return true;
	}

	destroy(): void {
		this.teardownCells();
	}

	// ── Render ────────────────────────────────────────────────────────────────

	private teardownCells(): void {
		for (const mounted of this.cells) {
			mounted.unregister();
			mounted.view.destroy();
		}
		this.cells = [];
	}

	private render(): void {
		this.teardownCells();
		this.dom.textContent = '';
		const props = tablePropsOfNode(this.node);
		this.rendered = props;
		if (!props) {
			// Any other island type: the literal placeholder `toDOM` draws (islands.ts).
			this.dom.appendChild(document.createTextNode(`[${this.node.attrs.islandType || 'island'}]`));
			return;
		}
		const s = this.deps.strings();
		this.dom.setAttribute('role', 'group');
		this.dom.setAttribute('aria-label', s.tableLabel);
		const table = el('table', 'qm-table');
		const body = el('tbody');
		body.appendChild(this.columnGutter(props, s));
		for (let r = 0; r < rowCount(props); r++) body.appendChild(this.row(props, r, s));
		table.appendChild(body);
		this.dom.appendChild(table);
	}

	/** The row above the table: the corner, then one handle per column. */
	private columnGutter(props: TableProps, s: TableChromeStrings): HTMLElement {
		const tr = el('tr', 'qm-table-gutter-row');
		tr.appendChild(el('td', 'qm-table-corner'));
		for (let c = 0; c < columnCount(props); c++) {
			const cell = el('td', 'qm-table-gutter');
			cell.appendChild(this.columnHandle(props, c, s));
			tr.appendChild(cell);
		}
		return tr;
	}

	private columnHandle(props: TableProps, c: number, s: TableChromeStrings): HTMLElement {
		const group = el('div', 'qm-table-handle');
		group.setAttribute('role', 'group');
		group.setAttribute('aria-label', s.tableColumn(c + 1));
		const align = props.aligns[c] ?? 'none';
		group.append(
			handleButton(ALIGN_GLYPH[align], s.tableAlign(align), () =>
				this.write(cycleAlign(this.props(), c))
			),
			handleButton('plus', s.tableColumnInsert, () =>
				this.write(insertColumn(this.props(), c), { r: 0, c: c + 1 })
			),
			handleButton('left', s.tableColumnMoveLeft, () =>
				this.write(moveColumn(this.props(), c, -1), { r: 0, c: Math.max(0, c - 1) })
			),
			handleButton('right', s.tableColumnMoveRight, () =>
				this.write(moveColumn(this.props(), c, 1), { r: 0, c: c + 1 })
			),
			handleButton('x', s.tableColumnDelete, () =>
				this.write(deleteColumn(this.props(), c), { r: 0, c: Math.max(0, c - 1) })
			)
		);
		return group;
	}

	/** One table row: its handle, then its cells. */
	private row(props: TableProps, r: number, s: TableChromeStrings): HTMLElement {
		const tr = el('tr', r === 0 ? 'qm-table-header-row' : undefined);
		const gutter = el('td', 'qm-table-gutter');
		gutter.appendChild(this.rowHandle(r, s));
		tr.appendChild(gutter);
		rowCells(props, r).forEach((cell, c) => {
			const box = el(r === 0 ? 'th' : 'td', 'qm-table-cell');
			if (r === 0) box.setAttribute('scope', 'col');
			const align = props.aligns[c] ?? 'none';
			if (align !== 'none') box.style.textAlign = align;
			const host = el('div', 'qm-table-cell-host');
			box.appendChild(host);
			tr.appendChild(box);
			this.mountCell(host, r, c, s);
		});
		return tr;
	}

	/**
	 * A row's handle: insert and reorder on every row, delete on the body rows only.
	 * The header has no delete because `header: []` is not a table (`table.ts`), and
	 * the asymmetry has to READ rather than merely be guarded: the button is absent,
	 * not disabled.
	 */
	private rowHandle(r: number, s: TableChromeStrings): HTMLElement {
		const group = el('div', 'qm-table-handle');
		group.setAttribute('role', 'group');
		group.setAttribute('aria-label', r === 0 ? s.tableHeaderRow : s.tableRow(r));
		group.append(
			handleButton('plus', s.tableRowInsert, () =>
				this.write(insertRow(this.props(), r), { r: r + 1, c: 0 })
			),
			handleButton('up', s.tableRowMoveUp, () =>
				this.write(moveRow(this.props(), r, -1), { r: Math.max(0, r - 1), c: 0 })
			),
			handleButton('down', s.tableRowMoveDown, () =>
				this.write(moveRow(this.props(), r, 1), { r: r + 1, c: 0 })
			)
		);
		if (r > 0) {
			group.appendChild(
				handleButton('x', s.tableRowDelete, () =>
					this.write(deleteRow(this.props(), r), { r: r - 1, c: 0 })
				)
			);
		}
		return group;
	}

	private mountCell(host: HTMLElement, r: number, c: number, s: TableChromeStrings): void {
		const props = this.props();
		const name = s.tableCell(r === 0 ? s.tableHeaderRow : s.tableRow(r), s.tableColumn(c + 1));
		const view: EditorView = new EditorView(host, {
			state: EditorState.create({
				doc: decode(cellContent(cellAt(props, r, c)), inlineSchema),
				plugins: cellPlugins(this.cellKeys(r, c))
			}),
			attributes: { 'aria-label': name, class: 'qm-table-cell-editor' },
			dispatchTransaction: (tr) => {
				const next = view.state.apply(tr);
				view.updateState(next);
				if (!tr.docChanged) return;
				const now = this.props();
				this.write(withCell(now, r, c, cellFromDoc(next.doc, cellAt(now, r, c))));
			},
			handleDOMEvents: {
				focus: () => {
					this.deps.onCellFocus();
					return false;
				}
			}
		});
		this.cells.push({ view, unregister: this.deps.register(view), r, c });
	}

	// ── Ops ───────────────────────────────────────────────────────────────────

	/** The table this view is currently showing; the zero table if the node stopped
	 *  being one, which no op can produce. */
	private props(): TableProps {
		return tablePropsOfNode(this.node) ?? normalizeTable({ header: [], rows: [], aligns: [] });
	}

	/**
	 * Commit a new rectangle onto the node. `setNodeMarkup` is an ordinary PM
	 * transaction, so the field lowers it through the island channel and the whole
	 * op is one commit and one undo step, which is why every op writes a WHOLE
	 * table rather than mutating the props in place.
	 */
	private write(next: TableProps, focus?: { r: number; c: number }): void {
		const pos = this.getPos();
		if (pos == null) return;
		const node = this.outer.state.doc.nodeAt(pos);
		if (!node || node.type !== this.node.type) return;
		this.outer.dispatch(
			this.outer.state.tr.setNodeMarkup(pos, undefined, {
				...node.attrs,
				props: normalizeTable(next)
			})
		);
		if (focus) this.focusCell(focus.r, focus.c);
	}

	/** Land the caret at the end of a cell, clamped into the rectangle: where a row
	 *  or column op puts it, since the op rebuilt the views the caret was in. */
	private focusCell(r: number, c: number): void {
		const props = this.props();
		const row = Math.max(0, Math.min(r, rowCount(props) - 1));
		const col = Math.max(0, Math.min(c, columnCount(props) - 1));
		const mounted = this.cells.find((m) => m.r === row && m.c === col);
		if (!mounted) return;
		const { view } = mounted;
		view.focus();
		view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)));
	}

	/**
	 * A cell's keys. Traversal is the island's link in the leaf's chain
	 * (VISUAL_EDITOR §Chrome), except that it binds on the NESTED view: the outer
	 * keymap never sees a keystroke a cell handled (`stopEvent`).
	 *
	 * Enter is the next row, forced: a `TableCell` has one `text` and no line
	 * concept, and `continues` is a LINE flag with no cell analogue, so a newline in
	 * a cell has no representation to be a preference about.
	 */
	private cellKeys(r: number, c: number): Record<string, Command> {
		const marks: Record<string, Command> = {};
		if (inlineSchema.marks.strong) marks['Mod-b'] = toggleMark(inlineSchema.marks.strong);
		if (inlineSchema.marks.em) marks['Mod-i'] = toggleMark(inlineSchema.marks.em);
		if (inlineSchema.marks.underline) marks['Mod-u'] = toggleMark(inlineSchema.marks.underline);
		return {
			...marks,
			// One undo stack per leaf: a cell carries no history of its own, so Mod-z
			// unwinds a cell keystroke and a row op in the order they happened.
			'Mod-z': () => undo(this.outer.state, this.outer.dispatch),
			'Mod-y': () => redo(this.outer.state, this.outer.dispatch),
			'Shift-Mod-z': () => redo(this.outer.state, this.outer.dispatch),
			Tab: () => {
				this.step(r, c, 1);
				return true;
			},
			'Shift-Tab': () => {
				this.step(r, c, -1);
				return true;
			},
			Enter: () => {
				const props = this.props();
				if (r === rowCount(props) - 1) this.write(insertRow(props, r), { r: r + 1, c });
				else this.focusCell(r + 1, c);
				return true;
			},
			// The innermost Escape: out of the cell, onto the island. What the next one
			// means is the shell's (VISUAL_EDITOR §"Settled and open").
			Escape: () => {
				const pos = this.getPos();
				if (pos == null) return true;
				this.outer.focus();
				this.outer.dispatch(
					this.outer.state.tr.setSelection(NodeSelection.create(this.outer.state.doc, pos))
				);
				return true;
			}
		};
	}

	/** Tab's traversal: the next (or previous) cell in reading order. Past the last
	 *  cell it APPENDS a row, which is the whole growth affordance the default shape
	 *  leans on; before the first it declines and the caret stays. */
	private step(r: number, c: number, dir: 1 | -1): void {
		const props = this.props();
		const cols = columnCount(props);
		const rows = rowCount(props);
		let nr = r;
		let nc = c + dir;
		if (nc >= cols) {
			nr = r + 1;
			nc = 0;
		} else if (nc < 0) {
			nr = r - 1;
			nc = cols - 1;
		}
		if (nr < 0) return;
		if (nr >= rows) {
			this.write(insertRow(props, r), { r: nr, c: 0 });
			return;
		}
		this.focusCell(nr, nc);
	}
}

/** The `island_block` node view: a table island's editing surface, and the literal
 *  placeholder for every other island type. */
export function tableNodeView(deps: TableViewDeps): NodeViewConstructor {
	return (node, view, getPos) => new TableIslandView(node, view, getPos, deps);
}
