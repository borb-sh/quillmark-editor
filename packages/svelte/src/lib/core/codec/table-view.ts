// The table island's NodeView: the surface a `table` island is edited through
// (CODEC §"The table island"). Vanilla DOM rather than Svelte chrome, because what
// it renders is PM's own: a leaf node's substitute DOM, holding one nested
// `EditorView` per cell.
//
// A cell is a second content unit inside the first, so it gets the codec's INLINE mode
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
// THE CHROME OCCUPIES NO LAYOUT. Every control is absolutely positioned inside a real
// data cell, hanging into a band the scroller carries as padding: a column's handle
// lives in its own `th`, a row's in that row's first `td`. Alignment is therefore
// structural (a handle tracks its line through wrap, zoom, a font-size change and a
// horizontal scroll with nothing measured and no rect crossing a state channel) while
// the grid itself holds the box a paragraph would. Gutter cells buy that same
// alignment and charge the table's shape for it: an empty row and an empty column in
// the accessibility tree, so a 3x3 table reads as 4x4 with its headers at column 2.
//
// A POINTER PRESS RESOLVES TO A CARET, always, except on a handle
// (CODEC §"The table island"). Click-to-NodeSelect belongs to an atom with no
// interior, and a table has cells; a handle is the third band, and what it selects is
// a LINE.
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Node as PMNode } from 'prosemirror-model';
import {
	EditorState,
	NodeSelection,
	Selection,
	TextSelection,
	type Command
} from 'prosemirror-state';
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
	clearColumn,
	columnCount,
	deleteColumn,
	deleteRow,
	insertColumn,
	insertRow,
	moveColumn,
	moveRow,
	normalizeTable,
	rowCells,
	rowCount,
	setAlign,
	shapeEqual,
	withCell,
	type TableAlign
} from './table.js';

/** Everything the island's chrome says. Accessible names, not decoration: a handle
 *  is a bar and a seam is a glyph, so an untranslated one reads the wrong language
 *  rather than merely inconsistent (VISUAL_EDITOR §"What the surface says"). */
export interface TableChromeStrings {
	/** The island's own name, on the wrapper. */
	tableLabel: string;
	/** Row 0 is the header, which is not "Row 0". */
	tableHeaderRow: string;
	tableRow: (index: number) => string;
	tableColumn: (index: number) => string;
	/** A cell's accessible name: nothing else names a nested leaf. */
	tableCell: (row: string, column: string) => string;
	/** A handle's name. It SELECTS its line, and the verbs are then the selection's
	 *  (Backspace, Alt+arrows), so the name is the gesture and not a menu's. */
	tableSelectRow: (index: number) => string;
	tableSelectColumn: (index: number) => string;
	/** The corner's, whose line is the whole table. */
	tableSelectTable: string;
	/** A seam's, named by the line it would open rather than by a neighbour and a
	 *  side: "insert row 3" is one fact where "insert below row 2" is two. */
	tableInsertRow: (index: number) => string;
	tableInsertColumn: (index: number) => string;
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
	tableSelectRow: (index) => `Select row ${index}`,
	tableSelectColumn: (index) => `Select column ${index}`,
	tableSelectTable: 'Select table',
	tableInsertRow: (index) => `Insert row ${index}`,
	tableInsertColumn: (index) => `Insert column ${index}`,
	tableAlignDefault: 'Align: default',
	tableAlignLeft: 'Align left',
	tableAlignCenter: 'Align center',
	tableAlignRight: 'Align right'
};

/** What the field hands each island view: its wording (read live, so a locale swap
 *  re-renders) and the callbacks that keep a nested view visible to the leaf. */
export interface TableViewDeps {
	strings: () => TableChromeStrings;
	/** Register a mounted cell view; the returned function unregisters it. The field
	 *  needs the set to answer "which view holds the caret" for the format popover. */
	register: (view: EditorView) => () => void;
	/** A cell took focus: the leaf's own `focus` handler never fires for one (a focus
	 *  event does not bubble), so the active address would not follow the caret. */
	onCellFocus: () => void;
}

/** Lucide geometry, as the path data a DOM node can carry: the glyphs this chrome
 *  draws, in the one place chrome is built without Svelte. */
const PLUS = ['M5 12h14', 'M12 5v14'];
const ALIGN_PATHS: Record<TableAlign, string[]> = {
	none: ['M21 6H3', 'M21 12H3', 'M21 18H3'],
	left: ['M21 6H3', 'M15 12H3', 'M17 18H3'],
	center: ['M21 6H3', 'M17 12H7', 'M19 18H5'],
	right: ['M21 6H3', 'M21 12H9', 'M21 18H7']
};

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
 *  cell whose caret the op is about to be measured against. A handle wants that focus
 *  and takes it explicitly, which is why this does not hand it out. */
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

/** What the nested views and the controls answer for themselves. `stopEvent` reads
 *  it to hand PM everything else, and the pointer guard reads it to leave those
 *  presses alone: one list, so the two cannot disagree about what a cell owns. */
const OWNED = '.qm-table-cell-host, .qm-table-handle, .qm-table-seam, .qm-table-align';

/** How far a press travels before it is a drag rather than a click: the playground
 *  resizer's threshold, and for its reason. Under it, a press that jitters is still
 *  the selection gesture it was aimed as. */
const DEAD_ZONE = 3;

/** A viewport point: where a press landed, which is the only thing the two bands are
 *  told apart by. */
interface Point {
	x: number;
	y: number;
}

const within = (rect: DOMRect, p: Point): boolean =>
	p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;

/** A point's distance to a rect: zero inside it, the gap to the nearest edge outside. */
function distance(rect: DOMRect, p: Point): number {
	return Math.hypot(
		Math.max(rect.left - p.x, 0, p.x - rect.right),
		Math.max(rect.top - p.y, 0, p.y - rect.bottom)
	);
}

interface MountedCell {
	view: EditorView;
	/** The cell's box, which the nearest-cell measure reads: the view's own `dom` is
	 *  the contenteditable inside it and stops at the text. */
	host: HTMLElement;
	unregister: () => void;
	r: number;
	c: number;
}

/** Which line a gesture acts on. `row` is in the chrome's row space (0 is the
 *  header), `column` in the column space. */
type Axis = 'row' | 'column';

/** The selected line: what Backspace deletes and Alt+arrow moves. NodeView-local
 *  state rather than a PM `Selection`, because nothing outside this island can name
 *  it: a row index inside one leaf is not a position in the document's coordinate
 *  space, and a custom `Selection` would have to be one to be dispatched. */
interface Line {
	axis: Axis;
	index: number;
}

/** A drag in flight: the line lifted, where the press started, and whether it has
 *  passed the dead zone yet. */
interface Drag {
	line: Line;
	origin: Point;
	engaged: boolean;
	/** Where the line would land on release, in the same space as `line.index`. */
	drop: number;
	pointerId: number;
	handle: HTMLElement;
}

class TableIslandView implements NodeView {
	readonly dom: HTMLElement;
	private cells: MountedCell[] = [];
	/** The props the current DOM was built from: what an `update` compares against to
	 *  tell a reseed from a rebuild. */
	private rendered: TableProps | undefined;
	private selected: Line | undefined;
	private drag: Drag | undefined;
	/** The handles, by the line each acts on: what selection paint, the hover reveal
	 *  and a drag all reach for without a query. */
	private handles = new Map<string, HTMLButtonElement>();
	private scroller: HTMLElement | undefined;
	private dropMark: HTMLElement | undefined;

	constructor(
		private node: PMNode,
		private readonly outer: EditorView,
		private readonly getPos: () => number | undefined,
		private readonly deps: TableViewDeps
	) {
		this.dom = el('div', 'qm-island qm-table-island');
		this.dom.setAttribute('data-island', node.attrs.islandType as string);
		this.dom.setAttribute('data-island-id', node.attrs.id as string);
		this.dom.addEventListener('mousedown', this.onPointerDown);
		this.dom.addEventListener('mouseover', this.onHover);
		this.dom.addEventListener('mouseleave', this.onLeave);
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
	 *  stays PM's, so a key pressed over a selected island still reaches the field's
	 *  keymap. What a POINTER press means on the rest of the chrome is
	 *  {@link TableIslandView.onPointerDown}'s and not this one's: `stopEvent` gates
	 *  the whole subtree, so widening it would take that routing with it. */
	stopEvent(event: Event): boolean {
		const target = event.target as Element | null;
		return !!target?.closest?.(OWNED);
	}

	/** Nothing in this subtree is PM-managed: the cells are separate views. */
	ignoreMutation(): boolean {
		return true;
	}

	destroy(): void {
		this.dom.removeEventListener('mousedown', this.onPointerDown);
		this.dom.removeEventListener('mouseover', this.onHover);
		this.dom.removeEventListener('mouseleave', this.onLeave);
		this.endDrag();
		this.teardownCells();
	}

	// ── The pointer ───────────────────────────────────────────────────────────

	/**
	 * The chrome is three bands with three owners, and only one of them selects.
	 *
	 * INSIDE the frame (cell padding, the borders between cells) is the table's: the
	 * press lands in the nearest cell, measured against the mounted hosts' rects.
	 * Geometry rather than the last cell focused: one press with two outcomes
	 * depending on history is a surface that feels haunted. OUTSIDE it (the island's
	 * own padding, the space beside the grid) is the DOCUMENT's, and means "write
	 * here, beside the table". A HANDLE is the third, and it answers for itself: a
	 * press on it selects the line it names.
	 *
	 * A `mousedown` listener, and it stops the event: PM's own mousedown is what arms
	 * the node selection the matching mouseup then takes. `stopEvent` is the other
	 * way to reach that, and it gates the subtree's keydown and drag routing too.
	 */
	private readonly onPointerDown = (event: MouseEvent): void => {
		// Any other island type is an atom with NO interior: a press on it is
		// unambiguous, and PM's to answer. So is a secondary press, which types nothing
		// and is on its way to a context menu.
		if (!this.rendered || event.button !== 0) return;
		const target = event.target as Element | null;
		if (target?.closest?.(OWNED)) return; // a cell or a control answers for itself
		event.preventDefault();
		event.stopPropagation();
		const point = { x: event.clientX, y: event.clientY };
		const grid = this.dom.querySelector('.qm-table');
		if (grid && within(grid.getBoundingClientRect(), point)) this.focusNearestCell(point);
		else this.caretBeside(point);
	};

	/** Which line the pointer is over, so only that line's handle is drawn. Read off
	 *  the cell the event landed in rather than off a rect sweep: the coordinates are
	 *  already on the cell, so the hot line costs a `closest` and no measurement. */
	private readonly onHover = (event: MouseEvent): void => {
		const cell = (event.target as Element | null)?.closest?.('.qm-table-cell');
		if (!cell) return;
		const r = Number(cell.getAttribute('data-r'));
		const c = Number(cell.getAttribute('data-c'));
		if (Number.isNaN(r) || Number.isNaN(c)) return;
		this.setHot(r, c);
	};

	private readonly onLeave = (): void => {
		if (this.drag) return;
		this.setHot(-1, -1);
	};

	private setHot(r: number, c: number): void {
		for (const [key, handle] of this.handles) {
			handle.classList.toggle('qm-hot', key === `row:${r}` || key === `column:${c}`);
		}
	}

	/** The cell a press inside the frame belongs to: the nearest by rect, which for a
	 *  press on a border or a cell's own padding is the cell it is against. */
	private focusNearestCell(point: Point): void {
		let best: MountedCell | undefined;
		let nearest = Infinity;
		for (const mounted of this.cells) {
			const at = distance(mounted.host.getBoundingClientRect(), point);
			if (at >= nearest) continue;
			nearest = at;
			best = mounted;
		}
		if (best) this.focusCell(best.r, best.c);
	}

	/** A caret beside the island, on the side the press landed: a GAP CURSOR where the
	 *  document holds no text position there, and the neighbouring block's own edge
	 *  where it holds one. Never a node selection, which is the whole point.
	 *
	 *  The gap is asked for through the plugin's own `createSelectionBetween` rather
	 *  than built here: whether a position takes one is the gap cursor's rule, and a
	 *  leaf mounted without that plugin then answers "no gap" instead of dispatching
	 *  a selection nothing draws. */
	private caretBeside(point: Point): void {
		const pos = this.getPos();
		if (pos == null) return;
		const box = this.dom.getBoundingClientRect();
		const before = point.y < (box.top + box.bottom) / 2;
		const $at = this.outer.state.doc.resolve(before ? pos : pos + this.node.nodeSize);
		const selection =
			this.outer.someProp('createSelectionBetween', (f) => f(this.outer, $at, $at)) ??
			Selection.findFrom($at, before ? -1 : 1, true);
		if (!selection) return;
		this.outer.focus();
		this.outer.dispatch(this.outer.state.tr.setSelection(selection));
	}

	/** The island as the selection: the corner's gesture, and Escape's out of a line.
	 *  Those two are the whole of what selects it, and Backspace over it is what
	 *  deletes the table (CODEC §"A selection is the subject of the next command"). */
	private selectIsland(): void {
		const pos = this.getPos();
		if (pos == null) return;
		this.clearLine();
		this.outer.focus();
		this.outer.dispatch(
			this.outer.state.tr.setSelection(NodeSelection.create(this.outer.state.doc, pos))
		);
	}

	// ── The line selection ────────────────────────────────────────────────────

	/**
	 * Select a line. This is the whole of what a handle press does, and the verbs are
	 * then the selection's: Backspace deletes it, Alt+arrow moves it, an arrow steps to
	 * the next one. The handle keeps the FOCUS, so those keys have somewhere to land,
	 * which is why it does not go through {@link chromeButton}'s focus-preserving
	 * press.
	 */
	private selectLine(line: Line): void {
		this.selected = line;
		this.paintLine();
		this.handleFor(line)?.focus();
	}

	private clearLine(): void {
		this.selected = undefined;
		this.paintLine();
	}

	private handleFor(line: Line): HTMLButtonElement | undefined {
		return this.handles.get(`${line.axis}:${line.index}`);
	}

	/** Wash the selected line's cells and mark its handle. Imperative rather than a
	 *  re-render: a rebuild destroys the nested views, and a selection is exactly the
	 *  state that must not cost the carets in them. */
	private paintLine(): void {
		const line = this.selected;
		for (const [key, handle] of this.handles) {
			handle.setAttribute('aria-pressed', String(!!line && key === `${line.axis}:${line.index}`));
		}
		for (const cell of this.dom.querySelectorAll('.qm-table-cell')) {
			const r = Number(cell.getAttribute('data-r'));
			const c = Number(cell.getAttribute('data-c'));
			const on = !!line && (line.axis === 'row' ? line.index === r : line.index === c);
			cell.classList.toggle('qm-table-line', on);
		}
		for (const cluster of this.dom.querySelectorAll('.qm-table-align')) {
			const c = Number(cluster.getAttribute('data-c'));
			const on = !!line && line.axis === 'column' && line.index === c;
			cluster.classList.toggle('qm-table-align-open', on);
			if (on) this.paintAlign(cluster as HTMLElement, c);
		}
	}

	/**
	 * A selected line's keys: delete, move, and a way back into the text.
	 *
	 * Backspace CLEARS rather than deletes at the LAST column, which the model keeps.
	 * Absent rather than disabled was the menu's rule there; a selection has no item to
	 * withhold, so the gesture takes the only other reading of "remove this" the shape
	 * allows. The header needs no such arm: it carries no handle, so it is never the
	 * selected line.
	 */
	private readonly onLineKey = (event: KeyboardEvent): void => {
		const line = this.selected;
		if (!line) return;
		const props = this.props();
		const rows = rowCount(props);
		const cols = columnCount(props);
		const step = (by: number) => {
			const max = line.axis === 'row' ? rows - 1 : cols - 1;
			const min = line.axis === 'row' ? 1 : 0;
			this.selectLine({ axis: line.axis, index: Math.max(min, Math.min(line.index + by, max)) });
		};
		const key = event.key;
		const along = line.axis === 'row' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
		if (
			!along.includes(key) &&
			key !== 'Backspace' &&
			key !== 'Delete' &&
			key !== 'Enter' &&
			key !== 'Escape'
		)
			return;
		event.preventDefault();
		event.stopPropagation();
		if (key === 'Escape') {
			this.selectIsland();
			return;
		}
		if (key === 'Enter') {
			const at = line.axis === 'row' ? { r: line.index, c: 0 } : { r: 0, c: line.index };
			this.clearLine();
			this.focusCell(at.r, at.c);
			return;
		}
		if (key === 'Backspace' || key === 'Delete') {
			this.deleteLine(line);
			return;
		}
		const by = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1;
		if (event.altKey) this.moveLine(line, by);
		else step(by);
	};

	/** Delete the selected line, or clear it where the model keeps it. The selection
	 *  follows: onto the neighbouring line after a delete, and stays put after a
	 *  clear, since the line it names is still there. */
	private deleteLine(line: Line): void {
		const props = this.props();
		if (line.axis === 'row') {
			const next = Math.max(1, Math.min(line.index, rowCount(props) - 2));
			this.write(deleteRow(props, line.index));
			if (rowCount(this.props()) > 1) this.selectLine({ axis: 'row', index: next });
			else this.clearLine();
			return;
		}
		if (columnCount(props) <= 1) {
			this.write(clearColumn(props, line.index));
			this.selectLine(line);
			return;
		}
		this.write(deleteColumn(props, line.index));
		this.selectLine({ axis: 'column', index: Math.max(0, line.index - 1) });
	}

	/** Move the selected line and keep it selected: a move whose selection did not
	 *  travel would leave the next Alt+arrow acting on whatever took the index. */
	private moveLine(line: Line, by: number): void {
		const props = this.props();
		if (line.axis === 'row') {
			const to = Math.max(1, Math.min(line.index + by, rowCount(props) - 1));
			if (to === line.index) return;
			this.write(moveRow(props, line.index, by));
			this.selectLine({ axis: 'row', index: to });
			return;
		}
		const to = Math.max(0, Math.min(line.index + by, columnCount(props) - 1));
		if (to === line.index) return;
		this.write(moveColumn(props, line.index, by));
		this.selectLine({ axis: 'column', index: to });
	}

	// ── Drag to reorder ───────────────────────────────────────────────────────

	/**
	 * Press-and-drag a handle moves its line. The press still SELECTS: the dead zone
	 * is what tells the two apart, so a click that jitters is the gesture it was
	 * aimed as and only a real travel becomes a drag.
	 *
	 * The drop index is read off the cell rects under the pointer, which is the one
	 * place measurement belongs: a drag asks where the pointer is, and that has no
	 * structural answer.
	 */
	private readonly onHandleDown = (
		line: Line,
		handle: HTMLButtonElement,
		event: PointerEvent
	): void => {
		if (event.button !== 0) return;
		this.drag = {
			line,
			origin: { x: event.clientX, y: event.clientY },
			engaged: false,
			drop: line.index,
			pointerId: event.pointerId,
			handle
		};
		handle.setPointerCapture(event.pointerId);
		handle.addEventListener('pointermove', this.onHandleMove);
		handle.addEventListener('pointerup', this.onHandleUp);
		handle.addEventListener('pointercancel', this.onHandleUp);
	};

	private readonly onHandleMove = (event: PointerEvent): void => {
		const drag = this.drag;
		if (!drag) return;
		const travel = Math.hypot(event.clientX - drag.origin.x, event.clientY - drag.origin.y);
		if (!drag.engaged && travel < DEAD_ZONE) return;
		if (!drag.engaged) {
			drag.engaged = true;
			this.dom.classList.add('qm-table-dragging');
			this.handleFor(drag.line)?.classList.add('qm-table-lifted');
			for (const cell of this.lineCells(drag.line)) cell.classList.add('qm-table-lifted');
		}
		drag.drop = this.dropIndex(drag.line.axis, { x: event.clientX, y: event.clientY });
		this.paintDrop(drag);
	};

	private readonly onHandleUp = (): void => {
		const drag = this.drag;
		if (!drag) return;
		const { line, drop, engaged } = drag;
		this.endDrag();
		if (!engaged) return;
		if (drop !== line.index) this.moveLine(line, drop - line.index);
		else this.selectLine(line);
	};

	private endDrag(): void {
		const drag = this.drag;
		this.drag = undefined;
		this.dropMark?.remove();
		this.dropMark = undefined;
		this.dom.classList.remove('qm-table-dragging');
		for (const lifted of this.dom.querySelectorAll('.qm-table-lifted'))
			lifted.classList.remove('qm-table-lifted');
		if (!drag) return;
		drag.handle.removeEventListener('pointermove', this.onHandleMove);
		drag.handle.removeEventListener('pointerup', this.onHandleUp);
		drag.handle.removeEventListener('pointercancel', this.onHandleUp);
		if (drag.handle.hasPointerCapture?.(drag.pointerId))
			drag.handle.releasePointerCapture(drag.pointerId);
	}

	/** Which line the pointer is over: the nearest line by its cells' rects, clamped
	 *  into what the axis allows (nothing lands above the header). */
	private dropIndex(axis: Axis, point: Point): number {
		const props = this.props();
		const limit = axis === 'row' ? rowCount(props) - 1 : columnCount(props) - 1;
		const floor = axis === 'row' ? 1 : 0;
		let best = floor;
		let nearest = Infinity;
		for (let i = floor; i <= limit; i++) {
			for (const cell of this.lineCells({ axis, index: i })) {
				const at = distance(cell.getBoundingClientRect(), point);
				if (at >= nearest) continue;
				nearest = at;
				best = i;
			}
		}
		return best;
	}

	private lineCells(line: Line): HTMLElement[] {
		const attr = line.axis === 'row' ? 'data-r' : 'data-c';
		return [...this.dom.querySelectorAll<HTMLElement>(`.qm-table-cell[${attr}="${line.index}"]`)];
	}

	/** The drop indicator: one rule on the boundary the line would land against,
	 *  drawn in the scroller so it spans the grid and scrolls with it. */
	private paintDrop(drag: Drag): void {
		const cells = this.lineCells({ axis: drag.line.axis, index: drag.drop });
		const scroller = this.scroller;
		if (!cells.length || !scroller) return;
		if (!this.dropMark) {
			this.dropMark = el('div', 'qm-table-drop');
			scroller.appendChild(this.dropMark);
		}
		const box = scroller.getBoundingClientRect();
		const first = cells[0]!.getBoundingClientRect();
		const last = cells[cells.length - 1]!.getBoundingClientRect();
		const after = drag.drop > drag.line.index;
		const mark = this.dropMark;
		mark.setAttribute('data-axis', drag.line.axis);
		if (drag.line.axis === 'row') {
			mark.style.top = `${(after ? last.bottom : first.top) - box.top + scroller.scrollTop}px`;
			mark.style.left = `${first.left - box.left + scroller.scrollLeft}px`;
			mark.style.width = `${last.right - first.left}px`;
			mark.style.height = '';
		} else {
			mark.style.left = `${(after ? first.right : first.left) - box.left + scroller.scrollLeft}px`;
			mark.style.top = `${first.top - box.top + scroller.scrollTop}px`;
			mark.style.height = `${last.bottom - first.top}px`;
			mark.style.width = '';
		}
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
		this.endDrag();
		this.teardownCells();
		this.handles.clear();
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

		// `thead`/`tbody` rather than one `tbody`: the header is a separate field in the
		// model, and this is the markup that says so to something that cannot see the
		// weight the header row draws.
		const table = el('table', 'qm-table');
		const head = el('thead');
		head.appendChild(this.row(props, 0, s));
		const body = el('tbody');
		for (let r = 1; r < rowCount(props); r++) body.appendChild(this.row(props, r, s));
		table.append(head, body);

		const scroller = el('div', 'qm-table-scroller');
		scroller.appendChild(table);
		this.scroller = scroller;
		this.dom.appendChild(scroller);
		this.paintLine();
	}

	/** One table row: its cells, each carrying whatever chrome hangs off it. */
	private row(props: TableProps, r: number, s: TableChromeStrings): HTMLElement {
		const tr = el('tr', r === 0 ? 'qm-table-header-row' : undefined);
		const cols = columnCount(props);
		rowCells(props, r).forEach((cell, c) => {
			const box = el(r === 0 ? 'th' : 'td', 'qm-table-cell');
			if (r === 0) box.setAttribute('scope', 'col');
			box.setAttribute('data-r', String(r));
			box.setAttribute('data-c', String(c));
			const align = props.aligns[c] ?? 'none';
			if (align !== 'none') box.style.textAlign = align;
			const host = el('div', 'qm-table-cell-host');
			box.appendChild(host);

			// The COLUMN band hangs off the header row; the ROW band off each body row's
			// first cell. Both are absolutely positioned into the scroller's padding, so
			// neither is in the grid's layout and neither is a cell of its own.
			if (r === 0) {
				box.appendChild(this.handle({ axis: 'column', index: c }, s.tableSelectColumn(c + 1)));
				box.appendChild(this.alignCluster(c, s));
				box.appendChild(this.seam('column', c, s.tableInsertColumn(c + 1), 'lead'));
				// The last column carries the trailing seam too: a boundary belongs to the
				// cell it is against, and the right edge is against no next column.
				if (c === cols - 1)
					box.appendChild(this.seam('column', c + 1, s.tableInsertColumn(c + 2), 'trail'));
				// The header carries no row handle: it cannot be deleted (`header: []` is
				// not a table) and nothing goes above it, so there is no line to select.
				if (c === 0) box.appendChild(this.cornerHandle(s));
			} else if (c === 0) {
				box.appendChild(this.handle({ axis: 'row', index: r }, s.tableSelectRow(r)));
				box.appendChild(this.seam('row', r, s.tableInsertRow(r), 'lead'));
				if (r === rowCount(props) - 1)
					box.appendChild(this.seam('row', r + 1, s.tableInsertRow(r + 1), 'trail'));
			}
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
	 *
	 * A press SELECTS the line; a press that travels drags it. Both live on the same
	 * control because both are "this line", asked once with the pointer.
	 */
	private handle(line: Line, label: string): HTMLButtonElement {
		const btn = el('button', 'qm-table-handle');
		btn.type = 'button';
		btn.title = label;
		btn.setAttribute('aria-label', label);
		btn.setAttribute('aria-pressed', 'false');
		btn.setAttribute('data-axis', line.axis);
		btn.appendChild(el('span', 'qm-table-handle-bar'));
		btn.addEventListener('mousedown', (e) => e.preventDefault());
		btn.addEventListener('pointerdown', (e) => this.onHandleDown(line, btn, e));
		btn.addEventListener('click', (e) => {
			e.preventDefault();
			this.selectLine(line);
		});
		btn.addEventListener('keydown', this.onLineKey);
		this.handles.set(`${line.axis}:${line.index}`, btn);
		return btn;
	}

	/**
	 * The island's own handle, at the grid origin: the spreadsheet's select-all
	 * position, and where the two bands of handles converge. A press SELECTS the
	 * island, which is the state Backspace deletes the whole table from.
	 *
	 * A square rather than a bar, because what it acts on is the whole rectangle and
	 * not a line of it.
	 */
	private cornerHandle(s: TableChromeStrings): HTMLButtonElement {
		const btn = chromeButton('qm-table-handle qm-table-corner-handle', s.tableSelectTable, () =>
			this.selectIsland()
		);
		btn.setAttribute('data-axis', 'island');
		btn.appendChild(el('span', 'qm-table-corner-mark'));
		return btn;
	}

	/**
	 * A seam: the boundary between two lines, and the whole of how a table grows.
	 * One per boundary including the leading and trailing ones, so an append and an
	 * interior insert are one gesture at different places.
	 */
	private seam(
		axis: Axis,
		index: number,
		label: string,
		side: 'lead' | 'trail'
	): HTMLButtonElement {
		const btn = chromeButton('qm-table-seam', label, () => {
			const props = this.props();
			if (axis === 'row') this.write(insertRow(props, index - 1), { r: index, c: 0 });
			else this.write(insertColumn(props, index - 1), { r: 0, c: index });
		});
		btn.setAttribute('data-axis', axis);
		btn.setAttribute('data-side', side);
		btn.appendChild(svg(PLUS));
		return btn;
	}

	/**
	 * A column's alignment: the one op with no gesture, so it is the one surface the
	 * chrome still raises. It appears with the column's SELECTION rather than on
	 * hover, so it costs nothing at rest and makes the selection visibly do something.
	 *
	 * Drawn in the band beside the handle rather than portalled: it is four glyphs in
	 * a row, not a list to read, and living in the cell keeps it aligned to its column
	 * for the reason every other control here does.
	 */
	private alignCluster(c: number, s: TableChromeStrings): HTMLElement {
		const labels: Record<TableAlign, string> = {
			none: s.tableAlignDefault,
			left: s.tableAlignLeft,
			center: s.tableAlignCenter,
			right: s.tableAlignRight
		};
		const box = el('div', 'qm-table-align');
		box.setAttribute('data-c', String(c));
		box.setAttribute('role', 'group');
		box.setAttribute('aria-label', s.tableSelectColumn(c + 1));
		for (const align of ALIGNS) {
			const btn = chromeButton('qm-table-align-item', labels[align], () => {
				this.write(setAlign(this.props(), c, align));
				this.selectLine({ axis: 'column', index: c });
			});
			btn.setAttribute('data-align', align);
			btn.appendChild(svg(ALIGN_PATHS[align]));
			box.appendChild(btn);
		}
		return box;
	}

	/** Mark the alignment the column already has: an exclusive set, so the cluster
	 *  shows which one is live. */
	private paintAlign(box: HTMLElement, c: number): void {
		const align = this.props().aligns[c] ?? 'none';
		for (const btn of box.querySelectorAll('.qm-table-align-item')) {
			btn.setAttribute('aria-pressed', String(btn.getAttribute('data-align') === align));
		}
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
					this.clearLine();
					this.deps.onCellFocus();
					return false;
				}
			}
		});
		this.cells.push({ view, host, unregister: this.deps.register(view), r, c });
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
		// An arrow at the cell's own text edge leaves for the neighbouring cell: the
		// grid walks like a grid. Inside the text it declines, so a caret crossing a
		// wrapped line is still the browser's.
		const escapes = (view: EditorView, dir: 'left' | 'right' | 'up' | 'down'): boolean => {
			const { selection } = view.state;
			if (!(selection instanceof TextSelection) || !selection.empty) return false;
			if (dir === 'up' || dir === 'down') return view.endOfTextblock(dir);
			return dir === 'left'
				? selection.from === Selection.atStart(view.state.doc).from
				: selection.from === Selection.atEnd(view.state.doc).from;
		};
		const walk = (dir: 'left' | 'right' | 'up' | 'down'): Command => {
			return (_state, _dispatch, view) => {
				if (!view || !escapes(view, dir)) return false;
				if (dir === 'up') this.focusCell(r - 1, c);
				else if (dir === 'down') this.focusCell(r + 1, c);
				else if (dir === 'left') this.step(r, c, -1);
				else this.step(r, c, 1);
				return true;
			};
		};
		return {
			...marks,
			// One undo stack per leaf: a cell carries no history of its own, so Mod-z
			// unwinds a cell keystroke and a row op in the order they happened.
			'Mod-z': () => undo(this.outer.state, this.outer.dispatch),
			'Mod-y': () => redo(this.outer.state, this.outer.dispatch),
			'Shift-Mod-z': () => redo(this.outer.state, this.outer.dispatch),
			ArrowUp: walk('up'),
			ArrowDown: walk('down'),
			ArrowLeft: walk('left'),
			ArrowRight: walk('right'),
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
			// A row below this one, from anywhere in it: what the seam is with the
			// pointer, for a caret that is already in the row.
			'Mod-Enter': () => {
				this.write(insertRow(this.props(), r), { r: r + 1, c: 0 });
				return true;
			},
			// The innermost Escape: out of the cell, onto the island. What the next one
			// means is the shell's (VISUAL_EDITOR §"Settled and open").
			Escape: () => {
				this.selectIsland();
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
