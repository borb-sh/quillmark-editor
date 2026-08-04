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
//
// The CHROME is two affordances and a handle per line: a `+` strip on each growing
// edge, and one bar per row and column that raises a menu of that line's ops. The
// ops themselves are `table.ts`'s constructors; what is here is which of them a line
// offers and where the caret lands after one.
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
	ALIGNS,
	cellAt,
	cellContent,
	cellEqual,
	cellFromDoc,
	columnCount,
	deleteColumn,
	deleteRow,
	insertColumn,
	insertRow,
	normalizeTable,
	rowCells,
	rowCount,
	setAlign,
	shapeEqual,
	withCell,
	type TableAlign
} from './table.js';

/** Everything the island's chrome says. Accessible names, not decoration: a handle
 *  is a bar and the `+` strips are glyphs, so an untranslated one reads the wrong
 *  language rather than merely inconsistent (VISUAL_EDITOR §"What the surface says"). */
export interface TableChromeStrings {
	/** The island's own name, on the wrapper. */
	tableLabel: string;
	/** Row 0 is the header, which is not "Row 0". */
	tableHeaderRow: string;
	tableRow: (index: number) => string;
	tableColumn: (index: number) => string;
	/** A cell's accessible name: nothing else names a nested leaf. */
	tableCell: (row: string, column: string) => string;
	/** The two growing edges. */
	tableAddRow: string;
	tableAddColumn: string;
	/** A handle's name, and its menu's: the line it acts on is the whole of what it is. */
	tableRowMenu: (index: number) => string;
	tableColumnMenu: (index: number) => string;
	tableInsertRowAbove: string;
	tableInsertRowBelow: string;
	tableDeleteRow: string;
	tableInsertColumnLeft: string;
	tableInsertColumnRight: string;
	tableDeleteColumn: string;
	tableAlignDefault: string;
	tableAlignLeft: string;
	tableAlignCenter: string;
	tableAlignRight: string;
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
	tableAddRow: 'Add row',
	tableAddColumn: 'Add column',
	tableRowMenu: (index) => `Row ${index} actions`,
	tableColumnMenu: (index) => `Column ${index} actions`,
	tableInsertRowAbove: 'Insert row above',
	tableInsertRowBelow: 'Insert row below',
	tableDeleteRow: 'Delete row',
	tableInsertColumnLeft: 'Insert column left',
	tableInsertColumnRight: 'Insert column right',
	tableDeleteColumn: 'Delete column',
	tableAlignDefault: 'Align: default',
	tableAlignLeft: 'Align left',
	tableAlignCenter: 'Align center',
	tableAlignRight: 'Align right'
};

/** One offer in a line's menu. `checked` marks the alignment a column already has:
 *  a set of exclusive states, so the menu shows which one is live. */
export interface IslandMenuItem {
	id: string;
	label: string;
	checked?: boolean;
}

/**
 * A raised line menu, as the chrome sees it: `undefined` is a closed one.
 *
 * It carries its own verbs rather than an address the chrome would hand back. The
 * menu belongs to ONE island in one leaf and names a row or column inside it, which
 * is not a coordinate the leaf's public surface speaks; a channel that made it one
 * would put a table's internal geometry in `FieldController` for a single caller.
 */
export interface IslandMenuState {
	/** The menu's accessible name: the line it acts on. */
	label: string;
	items: IslandMenuItem[];
	/** The handle's viewport rect, to anchor on. */
	rect: { left: number; top: number; right: number; bottom: number };
	run: (id: string) => void;
	close: () => void;
}

/** What the field hands each island view: its wording (read live, so a locale swap
 *  re-renders), the callbacks that keep a nested view visible to the leaf, and the
 *  channel a line menu is drawn through. */
export interface TableViewDeps {
	strings: () => TableChromeStrings;
	/** Register a mounted cell view; the returned function unregisters it. The field
	 *  needs the set to answer "which view holds the caret" for the format popover. */
	register: (view: EditorView) => () => void;
	/** A cell took focus: the leaf's own `focus` handler never fires for one (a focus
	 *  event does not bubble), so the active address would not follow the caret. */
	onCellFocus: () => void;
	/** A line menu opened or closed. The chrome draws it (`visual/TableMenu.svelte`):
	 *  the menu recipe is the visual tier's, and duplicating it here would be a second
	 *  copy that agrees until one is edited. */
	onMenu: (state: IslandMenuState | undefined) => void;
}

/** Lucide geometry, as the path data a DOM node can carry: the one glyph this
 *  chrome draws, in the one place chrome is built without Svelte. */
const PLUS = ['M5 12h14', 'M12 5v14'];

function svg(paths: string[]): SVGElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 24 24');
	el.setAttribute('fill', 'none');
	el.setAttribute('stroke', 'currentColor');
	el.setAttribute('stroke-width', '2');
	el.setAttribute('stroke-linecap', 'round');
	el.setAttribute('stroke-linejoin', 'round');
	el.setAttribute('aria-hidden', 'true');
	for (const d of paths) {
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

/** A chrome button. It swallows its own `mousedown` (prosemirror-menu's trick, and
 *  the format popover's): without it the browser focuses the button, blurring the
 *  cell whose caret the op is about to be measured against. */
function chromeButton(className: string, label: string, run: () => void): HTMLButtonElement {
	const btn = el('button', className);
	btn.type = 'button';
	btn.title = label;
	btn.setAttribute('aria-label', label);
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

/** The open menu: which line it acts on, and the handle it hangs off. */
interface OpenMenu {
	kind: 'row' | 'column';
	index: number;
	trigger: HTMLButtonElement;
}

class TableIslandView implements NodeView {
	readonly dom: HTMLElement;
	private cells: MountedCell[] = [];
	/** The props the current DOM was built from: what an `update` compares against to
	 *  tell a reseed from a rebuild. */
	private rendered: TableProps | undefined;
	private menu: OpenMenu | undefined;

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

	/** The nested views own every event inside a cell or a control; everything else
	 *  (the island's own padding, its border) stays PM's, so a click beside the table
	 *  still selects the node and Backspace still deletes it. */
	stopEvent(event: Event): boolean {
		const target = event.target as Element | null;
		return !!target?.closest?.('.qm-table-cell-host, .qm-table-handle, .qm-table-add');
	}

	/** Nothing in this subtree is PM-managed: the cells are separate views. */
	ignoreMutation(): boolean {
		return true;
	}

	destroy(): void {
		this.closeMenu();
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
		// Every rebuild moves the handles, so a menu hanging off one is stale.
		this.closeMenu();
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

		// The two growing edges. A `+` per EDGE rather than per line: growth is the one
		// op every table needs and the only one whose target is the table itself, so it
		// is two controls whatever the rectangle is (VISUAL_EDITOR_UIUX §"Table island").
		const frame = el('div', 'qm-table-frame');
		frame.append(
			table,
			chromeButton('qm-table-add qm-table-add-column', s.tableAddColumn, () =>
				this.write(insertColumn(this.props(), columnCount(this.props()) - 1), {
					r: 0,
					c: columnCount(this.props())
				})
			)
		);
		const addColumn = frame.lastElementChild as HTMLElement;
		addColumn.appendChild(svg(PLUS));

		const grid = el('div', 'qm-table-grid');
		grid.append(
			frame,
			chromeButton('qm-table-add qm-table-add-row', s.tableAddRow, () =>
				this.write(insertRow(this.props(), rowCount(this.props()) - 1), {
					r: rowCount(this.props()),
					c: 0
				})
			)
		);
		(grid.lastElementChild as HTMLElement).appendChild(svg(PLUS));
		this.dom.appendChild(grid);
	}

	/** The row above the table: the corner, then one handle per column. */
	private columnGutter(props: TableProps, s: TableChromeStrings): HTMLElement {
		const tr = el('tr', 'qm-table-gutter-row');
		tr.appendChild(el('td', 'qm-table-corner'));
		for (let c = 0; c < columnCount(props); c++) {
			const cell = el('td', 'qm-table-gutter');
			cell.appendChild(this.handle('column', c, s.tableColumnMenu(c + 1)));
			tr.appendChild(cell);
		}
		return tr;
	}

	/** One table row: its handle, then its cells. */
	private row(props: TableProps, r: number, s: TableChromeStrings): HTMLElement {
		const tr = el('tr', r === 0 ? 'qm-table-header-row' : undefined);
		const gutter = el('td', 'qm-table-gutter');
		// The HEADER carries no handle. Its menu would hold one item: it cannot be
		// deleted (`header: []` is not a table) and nothing goes above it, so
		// "insert below" is what the first body row's "insert above" already is.
		if (r > 0) gutter.appendChild(this.handle('row', r, s.tableRowMenu(r)));
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
	 * A line's handle: ONE target per row and column, and the whole of that line's
	 * chrome. It is a bar rather than a glyph because its POSITION is its meaning:
	 * what it acts on is the row or column it sits against, and no icon says that
	 * better than being there.
	 */
	private handle(kind: 'row' | 'column', index: number, label: string): HTMLButtonElement {
		const btn = chromeButton('qm-table-handle', label, () => this.toggleMenu(kind, index, btn));
		btn.setAttribute('aria-haspopup', 'menu');
		btn.setAttribute('aria-expanded', 'false');
		btn.appendChild(el('span', 'qm-table-handle-bar'));
		return btn;
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

	// ── The line menu ─────────────────────────────────────────────────────────

	private toggleMenu(kind: 'row' | 'column', index: number, trigger: HTMLButtonElement): void {
		if (this.menu?.kind === kind && this.menu.index === index) {
			this.closeMenu();
			return;
		}
		this.closeMenu();
		this.menu = { kind, index, trigger };
		trigger.setAttribute('aria-expanded', 'true');
		const s = this.deps.strings();
		const box = trigger.getBoundingClientRect();
		this.deps.onMenu({
			label: kind === 'row' ? s.tableRowMenu(index) : s.tableColumnMenu(index + 1),
			items: kind === 'row' ? this.rowItems(s) : this.columnItems(index, s),
			rect: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
			run: (id) => this.runMenuItem(kind, index, id),
			close: () => this.closeMenu()
		});
	}

	private closeMenu(): void {
		if (!this.menu) return;
		this.menu.trigger.setAttribute('aria-expanded', 'false');
		this.menu = undefined;
		this.deps.onMenu(undefined);
	}

	private rowItems(s: TableChromeStrings): IslandMenuItem[] {
		return [
			{ id: 'insert-above', label: s.tableInsertRowAbove },
			{ id: 'insert-below', label: s.tableInsertRowBelow },
			{ id: 'delete', label: s.tableDeleteRow }
		];
	}

	private columnItems(c: number, s: TableChromeStrings): IslandMenuItem[] {
		const props = this.props();
		const align = props.aligns[c] ?? 'none';
		const labels: Record<TableAlign, string> = {
			none: s.tableAlignDefault,
			left: s.tableAlignLeft,
			center: s.tableAlignCenter,
			right: s.tableAlignRight
		};
		const items: IslandMenuItem[] = [
			{ id: 'insert-left', label: s.tableInsertColumnLeft },
			{ id: 'insert-right', label: s.tableInsertColumnRight },
			...ALIGNS.map((a) => ({ id: `align:${a}`, label: labels[a], checked: a === align }))
		];
		// A table has at least one column, so the last one offers no delete: absent
		// rather than disabled, like the header's (§"The table island").
		if (columnCount(props) > 1) items.push({ id: 'delete', label: s.tableDeleteColumn });
		return items;
	}

	/** Apply a picked item and say where the caret lands: every one of these rebuilds
	 *  the views the caret was in, so the op that moved it names the cell. */
	private runMenuItem(kind: 'row' | 'column', index: number, id: string): void {
		const props = this.props();
		this.closeMenu();
		if (kind === 'row') {
			if (id === 'insert-above') this.write(insertRow(props, index - 1), { r: index, c: 0 });
			else if (id === 'insert-below') this.write(insertRow(props, index), { r: index + 1, c: 0 });
			else if (id === 'delete') this.write(deleteRow(props, index), { r: index - 1, c: 0 });
			return;
		}
		if (id === 'insert-left') this.write(insertColumn(props, index - 1), { r: 0, c: index });
		else if (id === 'insert-right') this.write(insertColumn(props, index), { r: 0, c: index + 1 });
		else if (id === 'delete')
			this.write(deleteColumn(props, index), { r: 0, c: Math.max(0, index - 1) });
		else if (id.startsWith('align:'))
			this.write(setAlign(props, index, id.slice('align:'.length) as TableAlign), {
				r: 0,
				c: index
			});
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
	 *  cell it APPENDS a row, which is the growth affordance the keyboard has; before
	 *  the first it declines and the caret stays. */
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
