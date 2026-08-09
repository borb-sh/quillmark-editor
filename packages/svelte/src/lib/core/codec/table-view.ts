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
// THE CHROME IS A BAND AND A MENU. Every band control occupies no layout: a grip is
// absolutely positioned inside a real data cell, so it lines up with the line it names
// by being INSIDE it, and the three corner controls hang off the grid's frame. The menu
// is the one surface that leaves the band, and it does not TRACK what it opened
// against, it DISMISSES: a scroll, a resize or a press outside closes it, so no
// measured rect is held across the thing it was measured from moving. What the band
// costs is `codec/prose.css`'s, which draws it.
//
// A POINTER PRESS RESOLVES TO A CARET, always, except on a band control, which acts on
// a LINE (CODEC §"The table island").
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

/** Everything the island's chrome says. Accessible names and menu labels, not
 *  decoration: a grip is a bar and a menu row is the only place an op is spelled out,
 *  so an untranslated one reads the wrong language rather than merely inconsistent
 *  (VISUAL_EDITOR §"What the surface says"). */
export interface TableChromeStrings {
	/** The island's own name, on the wrapper. */
	tableLabel: string;
	/** Row 0 is the header, which is not "Row 0". */
	tableHeaderRow: string;
	tableRow: (index: number) => string;
	tableColumn: (index: number) => string;
	/** A cell's accessible name: nothing else names a nested leaf. */
	tableCell: (row: string, column: string) => string;
	/** A grip's name. Its FIRST press selects the line, and the verbs are then the
	 *  selection's (Backspace, Alt+arrows) or the menu's, so the name is that press. */
	tableSelectRow: (index: number) => string;
	tableSelectColumn: (index: number) => string;
	/** The corner's, whose line is the whole table. */
	tableSelectTable: string;
	/** The two band caps, each of which grows the table at its own end. */
	tableAddRow: string;
	tableAddColumn: string;
	/** The menu's accessible name, built over whichever subject raised it: a row, a
	 *  column, or the cell a press landed in. One key, so a translator orders the word
	 *  around a subject the three name-builders above already spell. */
	tableMenu: (subject: string) => string;
	tableInsertRowAbove: string;
	tableInsertRowBelow: string;
	tableMoveRowUp: string;
	tableMoveRowDown: string;
	tableDeleteRow: string;
	tableInsertColumnLeft: string;
	tableInsertColumnRight: string;
	tableMoveColumnLeft: string;
	tableMoveColumnRight: string;
	tableDeleteColumn: string;
	/** What the delete row says at the LAST column, where the model keeps the line and
	 *  the gesture empties it instead. */
	tableClearColumn: string;
	/** The alignment group's name. Its four rows name a VALUE rather than a verb, the
	 *  group's own word carrying the instruction for all of them. */
	tableAlign: string;
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
	tableAddRow: 'Add row',
	tableAddColumn: 'Add column',
	tableMenu: (subject) => `${subject} actions`,
	tableInsertRowAbove: 'Insert row above',
	tableInsertRowBelow: 'Insert row below',
	tableMoveRowUp: 'Move row up',
	tableMoveRowDown: 'Move row down',
	tableDeleteRow: 'Delete row',
	tableInsertColumnLeft: 'Insert column left',
	tableInsertColumnRight: 'Insert column right',
	tableMoveColumnLeft: 'Move column left',
	tableMoveColumnRight: 'Move column right',
	tableDeleteColumn: 'Delete column',
	tableClearColumn: 'Clear column',
	tableAlign: 'Align',
	tableAlignDefault: 'Default',
	tableAlignLeft: 'Left',
	tableAlignCenter: 'Center',
	tableAlignRight: 'Right'
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

/** The glyphs this chrome draws, as the path data a DOM node can carry — its own set
 *  rather than `visual/icons/nodes.ts`, this being the one place chrome is built
 *  without Svelte, and `/core` reaching no surface module. Same 24×24 frame and the
 *  same origin, off an earlier release than the thirteen there; `NOTICE` carries the
 *  notices for both. A grip's dots are zero-length strokes under a round cap, which is
 *  how that set draws a dot everywhere it has one. */
const PLUS = ['M5 12h14', 'M12 5v14'];
const GRIP: Record<Axis, string[]> = {
	column: ['M5 9h.01', 'M12 9h.01', 'M19 9h.01', 'M5 15h.01', 'M12 15h.01', 'M19 15h.01'],
	row: ['M9 5h.01', 'M9 12h.01', 'M9 19h.01', 'M15 5h.01', 'M15 12h.01', 'M15 19h.01']
};
const ALIGN_PATHS: Record<TableAlign, string[]> = {
	none: ['M21 6H3', 'M21 12H3', 'M21 18H3'],
	left: ['M21 6H3', 'M15 12H3', 'M17 18H3'],
	center: ['M21 6H3', 'M17 12H7', 'M19 18H5'],
	right: ['M21 6H3', 'M21 12H9', 'M21 18H7']
};

/** How far a menu clears the thing that raised it. Small: the gap says the surface is
 *  attached to that control rather than floating near it. */
const MENU_GAP = 2;

/** A glyph. `weight` is the stroke, heavier for the grip: its marks are dots, and a
 *  dot drawn at the line weight of a stroke disappears at the size the bar renders. */
function svg(paths: string[], weight = 2): SVGElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 24 24');
	el.setAttribute('fill', 'none');
	el.setAttribute('stroke', 'currentColor');
	el.setAttribute('stroke-width', String(weight));
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

/** A band button. It swallows its own `mousedown` (prosemirror-menu's trick, and
 *  the format popover's): without it the browser focuses the button, blurring the
 *  cell whose caret the op is about to be measured against. A grip wants that focus
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

/** What the nested views and the band answer for themselves. `stopEvent` reads it to
 *  hand PM everything else, and the pointer guard reads it to leave those presses
 *  alone: one list, so the two cannot disagree about what a cell owns. The MENU is not
 *  in it and needs no entry: it is portalled out of this subtree, so no event of its
 *  ever reaches either reader. */
const OWNED = '.qm-table-cell-host, .qm-table-grip, .qm-table-corner, .qm-table-add';

/** How far a press travels before it is a drag rather than a click. Under it, a press
 *  that jitters is still the selection gesture it was aimed as. */
const DEAD_ZONE = 3;

/** A line's key in the grip registry, spelled once. */
const lineKey = (line: Line): string => `${line.axis}:${line.index}`;

/** A viewport point: where a press landed, which is the only thing the two bands are
 *  told apart by, and where a menu opens. */
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
	/** The `td`/`th` itself: what a line's wash and a drop's extent are measured and
	 *  painted on. Held rather than queried, so `r`/`c` stay the typed pair above
	 *  instead of a `data-` attribute parsed back out of the DOM. */
	box: HTMLElement;
	unregister: () => void;
	r: number;
	c: number;
}

/** Which line a gesture acts on. `row` is in the chrome's row space (0 is the
 *  header), `column` in the column space. */
type Axis = 'row' | 'column';

/** The selected line: what Backspace deletes, Alt+arrow moves, and the menu is about.
 *  NodeView-local state rather than a PM `Selection`, because nothing outside this
 *  island can name it: a row index inside one leaf is not a position in the document's
 *  coordinate space, and a custom `Selection` would have to be one to be dispatched. */
interface Line {
	axis: Axis;
	index: number;
}

/** One row of a menu: a complete instruction, or one value of the alignment SET, which
 *  is what `align` marks. An item that would act on nothing is `disabled` rather than
 *  withheld: a menu whose rows move is a menu that has to be re-read every time. */
interface MenuItem {
	label: string;
	run: () => void;
	disabled?: boolean;
	align?: TableAlign;
}

/** A run of items. `label` heads a mutually exclusive set and names the instruction its
 *  rows drop; a section of complete instructions carries none, and the separator
 *  between sections is the whole of what divides them. `value` is that set's live
 *  member, carried by the SECTION because the mark is a property of the set: an item
 *  cannot know whether it is the chosen one without being told what was chosen.
 *
 *  `inline` lays the set out as one row of glyphs beside its heading rather than as a
 *  stack of labelled rows. That is a legibility decision with a threshold behind it:
 *  the four alignments as rows push a cell's menu (both of its lines) past a screen,
 *  and four glyphs under one word are read at a glance where thirteen rows are
 *  scrolled. */
interface MenuSection {
	label?: string;
	inline?: boolean;
	value?: TableAlign;
	items: MenuItem[];
}

/** A drag in flight: the line lifted, where the press started, and whether it has
 *  passed the dead zone yet.
 *
 *  `lines` is the geometry, read ONCE when the drag engages. Nothing reflows between
 *  the press and the release (the lift is a tone and the drop rule is out of flow), so
 *  a rect per pointermove would re-measure an unchanged table: at 20x8 that is 150
 *  forced layouts an event. */
interface Drag {
	line: Line;
	origin: Point;
	engaged: boolean;
	/** Where the line would land on release, in the same space as `line.index`. */
	drop: number;
	/** The last drop index PAINTED, so a move inside the same line draws nothing. */
	painted: number;
	pointerId: number;
	grip: HTMLButtonElement;
	/** Each line's extent along the drag's axis, by index, plus the frame's origin. */
	lines: { index: number; start: number; end: number; cross: number; span: number }[];
	origin0: { left: number; top: number };
}

class TableIslandView implements NodeView {
	readonly dom: HTMLElement;
	private cells: MountedCell[] = [];
	/** The props the current DOM was built from: what an `update` compares against to
	 *  tell a reseed from a rebuild. */
	private rendered: TableProps | undefined;
	private selected: Line | undefined;
	private drag: Drag | undefined;
	/** The grips, by the line each acts on: what selection paint and a drag reach for
	 *  without a query. The typed twin of `cells`. */
	private grips = new Map<string, HTMLButtonElement>();
	/** The grid's own box, and the containing block every out-of-flow control is placed
	 *  against. Not the scroller: an absolute inside a scroll container is placed
	 *  against a padding box the scroll then slides out from under, so a control at the
	 *  grid's far end would drift into the middle of it. */
	private frame: HTMLElement | undefined;
	private dropMark: HTMLElement | undefined;
	/** The open menu, and the control to hand focus back to when it closes. */
	private menu: HTMLElement | undefined;
	private menuReturn: HTMLElement | undefined;
	/** A drag's trailing `click`, which would otherwise re-select the moved line. */
	private suppressClick = false;

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
		this.dom.addEventListener('contextmenu', this.onContextMenu);
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
		this.dom.removeEventListener('contextmenu', this.onContextMenu);
		this.closeMenu();
		this.endDrag();
		this.teardownCells();
	}

	// ── The pointer ───────────────────────────────────────────────────────────

	/**
	 * Route a press to its band (CODEC §"The table island"): inside the frame the
	 * nearest cell's caret, outside it the document's, and a band control answers for
	 * itself.
	 *
	 * A `mousedown` listener, and it stops the event: PM's own mousedown is what arms
	 * the node selection the matching mouseup then takes. `stopEvent` is the other way
	 * to reach that, and it gates the subtree's keydown and drag routing too.
	 */
	private readonly onPointerDown = (event: MouseEvent): void => {
		// Any other island type is an atom with NO interior: a press on it is
		// unambiguous, and PM's to answer. So is a secondary press, which types nothing
		// and is on its way to the menu below.
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

	/**
	 * The secondary press, and the one gesture that reaches every op from anywhere on
	 * the island. On a GRIP it is that line's menu, the line selected first so the menu
	 * and the wash name the same subject; in a CELL it is both lines at once, the column
	 * the press is in and the row it is in, which is the menu a table is read from
	 * rather than aimed at. The header carries no row section: it is a separate field
	 * from `rows`, so it neither moves nor deletes.
	 */
	private readonly onContextMenu = (event: MouseEvent): void => {
		if (!this.rendered) return;
		const target = event.target as Element | null;
		if (target?.closest?.('.qm-table-corner, .qm-table-add')) return;
		const s = this.deps.strings();
		const grip = target?.closest?.('.qm-table-grip');
		if (grip instanceof HTMLButtonElement) {
			const line = this.lineOf(grip);
			if (!line) return;
			event.preventDefault();
			this.selectLine(line);
			this.openLineMenu(line, grip);
			return;
		}
		const box = target?.closest?.('.qm-table-cell');
		const cell = box && this.cells.find((m) => m.box === box);
		if (!cell) return;
		event.preventDefault();
		const sections = [
			...this.columnSections(cell.c),
			...(cell.r === 0 ? [] : this.rowSections(cell.r))
		];
		const name = s.tableCell(
			cell.r === 0 ? s.tableHeaderRow : s.tableRow(cell.r),
			s.tableColumn(cell.c + 1)
		);
		this.openMenu(sections, s.tableMenu(name), { x: event.clientX, y: event.clientY });
	};

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
	 *  where it holds one.
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
	 *  deletes the table (CODEC §"The table island"). */
	private selectIsland(): void {
		const pos = this.getPos();
		if (pos == null) return;
		this.closeMenu();
		this.clearLine();
		this.outer.focus();
		this.outer.dispatch(
			this.outer.state.tr.setSelection(NodeSelection.create(this.outer.state.doc, pos))
		);
	}

	// ── The line selection ────────────────────────────────────────────────────

	/** Take the line's grip: the focus a selection's keys land on. */
	private gripFor(line: Line): HTMLButtonElement | undefined {
		return this.grips.get(lineKey(line));
	}

	/** The line a grip acts on, read back off the registry rather than off a `data-`
	 *  attribute: the map is already the typed answer. */
	private lineOf(grip: Element): Line | undefined {
		for (const [key, held] of this.grips)
			if (held === grip) {
				const [axis, index] = key.split(':');
				return { axis: axis as Axis, index: Number(index) };
			}
		return undefined;
	}

	/** The index space an axis allows. Stated once, because "the header is the floor"
	 *  is a rule three callers would otherwise each spell out. */
	private bounds(axis: Axis, props: TableProps): { floor: number; limit: number } {
		return axis === 'row'
			? { floor: 1, limit: rowCount(props) - 1 }
			: { floor: 0, limit: columnCount(props) - 1 };
	}

	/** Select a line. The grip takes the FOCUS, because the selection's keys bind
	 *  there and need somewhere to land. */
	private selectLine(line: Line): void {
		// One subject at a time: a line selection retires an island one, or the surface
		// paints a washed row inside an outlined table and the next Backspace has two
		// honest readings.
		const pos = this.getPos();
		const outer = this.outer.state.selection;
		if (pos != null && outer instanceof NodeSelection && outer.from === pos) {
			const $at = this.outer.state.doc.resolve(pos);
			const beside =
				this.outer.someProp('createSelectionBetween', (f) => f(this.outer, $at, $at)) ??
				Selection.findFrom($at, -1, true);
			if (beside) this.outer.dispatch(this.outer.state.tr.setSelection(beside));
		}
		this.selected = line;
		this.paintLine();
		this.gripFor(line)?.focus();
	}

	private clearLine(): void {
		if (!this.selected) return;
		this.selected = undefined;
		this.paintLine();
	}

	/** Whether `line` is the one already selected: what tells a grip's first press from
	 *  its second, which are the two rungs one control carries. */
	private isSelected(line: Line): boolean {
		return this.selected?.axis === line.axis && this.selected.index === line.index;
	}

	/** Wash the selected line's cells and mark its grip. Imperative rather than a
	 *  re-render: a rebuild destroys the nested views, and a selection is exactly the
	 *  state that must not cost the carets in them. */
	private paintLine(): void {
		const line = this.selected;
		const key = line && lineKey(line);
		for (const [at, grip] of this.grips) grip.setAttribute('aria-pressed', String(at === key));
		for (const cell of this.cells) {
			const on = line && (line.axis === 'row' ? line.index === cell.r : line.index === cell.c);
			if (on) cell.box.setAttribute('data-line', line.axis);
			else cell.box.removeAttribute('data-line');
		}
		this.paintArmed();
	}

	/** The band stays out while there is a held subject to act on, which is what keeps
	 *  a selection legible once the pointer has left the island and what keeps an open
	 *  menu from pointing at a grip that faded under it. */
	private paintArmed(): void {
		this.dom.classList.toggle('qm-table-armed', !!this.selected || !!this.menu);
	}

	/**
	 * A selected line's keys, bound to the line its own grip names rather than read
	 * off `selected`: focus and selection are separate, and a Tab between grips would
	 * otherwise aim the next key at whichever line was last pressed.
	 *
	 * Backspace CLEARS rather than deletes at the last column, which the model keeps
	 * (CODEC §"The table island"). Undo is forwarded for the reason a cell forwards it:
	 * one undo stack per leaf, and a `button` has no history of its own.
	 */
	private lineKeys(line: Line): (event: KeyboardEvent) => void {
		return (event: KeyboardEvent) => {
			const key = event.key;
			const mod = event.ctrlKey || event.metaKey;
			if (mod && (key === 'z' || key === 'Z' || key === 'y')) {
				event.preventDefault();
				const redoing = key === 'y' || (key === 'Z' && event.shiftKey);
				(redoing ? redo : undo)(this.outer.state, this.outer.dispatch);
				return;
			}
			const along = line.axis === 'row' ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
			const raises = key === ' ' || key === 'ContextMenu';
			const acts =
				raises || along.includes(key) || ['Backspace', 'Delete', 'Enter', 'Escape'].includes(key);
			if (!acts) return;
			event.preventDefault();
			event.stopPropagation();
			// Space rather than Enter, which already means "put the caret in this line":
			// the two are the keyboard's whole answer to a grip, and a menu is what the
			// second press of one does with the pointer.
			if (raises) return this.openLineMenu(line, this.gripFor(line));
			if (key === 'Escape') return this.selectIsland();
			if (key === 'Enter') {
				this.clearLine();
				return line.axis === 'row' ? this.focusCell(line.index, 0) : this.focusCell(0, line.index);
			}
			if (key === 'Backspace' || key === 'Delete') return this.deleteLine(line);
			const by = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1;
			if (event.altKey) return this.moveLine(line, by);
			const { floor, limit } = this.bounds(line.axis, this.props());
			this.selectLine({
				axis: line.axis,
				index: Math.max(floor, Math.min(line.index + by, limit))
			});
		};
	}

	/** Delete the line, or clear it where the model keeps it. The two arms are two
	 *  model rules rather than one shape: a row runs out (`rows: []` is a legal
	 *  header-only table), a column cannot (the rectangle floors at one). */
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

	/** Move the line and keep it selected: a move whose selection did not travel would
	 *  leave the next Alt+arrow acting on whatever took the index. */
	private moveLine(line: Line, by: number): void {
		const props = this.props();
		const { floor, limit } = this.bounds(line.axis, props);
		const to = Math.max(floor, Math.min(line.index + by, limit));
		if (to === line.index) return;
		this.write(
			line.axis === 'row' ? moveRow(props, line.index, by) : moveColumn(props, line.index, by)
		);
		this.selectLine({ axis: line.axis, index: to });
	}

	// ── The menu ──────────────────────────────────────────────────────────────

	/** A column's whole vocabulary: where a column opens, where it goes, what it is
	 *  aligned to, and what removing it means. Read off the props at RUN time, not at
	 *  build time: a menu outlives nothing, but the props it acts on are the store's. */
	private columnSections(c: number): MenuSection[] {
		const s = this.deps.strings();
		const cols = columnCount(this.props());
		const align = (value: TableAlign, label: string): MenuItem => ({
			label,
			align: value,
			run: () => {
				this.write(setAlign(this.props(), c, value));
				this.selectLine({ axis: 'column', index: c });
			}
		});
		const labels: Record<TableAlign, string> = {
			none: s.tableAlignDefault,
			left: s.tableAlignLeft,
			center: s.tableAlignCenter,
			right: s.tableAlignRight
		};
		return [
			{
				items: [
					{
						label: s.tableInsertColumnLeft,
						run: () => this.write(insertColumn(this.props(), c - 1), { r: 0, c })
					},
					{
						label: s.tableInsertColumnRight,
						run: () => this.write(insertColumn(this.props(), c), { r: 0, c: c + 1 })
					},
					{
						label: s.tableMoveColumnLeft,
						disabled: c === 0,
						run: () => this.moveLine({ axis: 'column', index: c }, -1)
					},
					{
						label: s.tableMoveColumnRight,
						disabled: c === cols - 1,
						run: () => this.moveLine({ axis: 'column', index: c }, 1)
					}
				]
			},
			{
				label: s.tableAlign,
				inline: true,
				value: this.props().aligns[c] ?? 'none',
				items: ALIGNS.map((value) => align(value, labels[value]))
			},
			{
				items: [
					{
						// The last column names what it will do rather than what it is called:
						// the model keeps the line, so "delete" would be a promise the surface
						// cannot make (CODEC §"The table island").
						label: cols <= 1 ? s.tableClearColumn : s.tableDeleteColumn,
						run: () => this.deleteLine({ axis: 'column', index: c })
					}
				]
			}
		];
	}

	/** A body row's vocabulary. Shorter than a column's by the alignment group, which
	 *  a row has no analogue of: `aligns` is per column and there is no per-row field. */
	private rowSections(r: number): MenuSection[] {
		const s = this.deps.strings();
		const rows = rowCount(this.props());
		return [
			{
				items: [
					{
						label: s.tableInsertRowAbove,
						run: () => this.write(insertRow(this.props(), r - 1), { r, c: 0 })
					},
					{
						label: s.tableInsertRowBelow,
						run: () => this.write(insertRow(this.props(), r), { r: r + 1, c: 0 })
					},
					{
						label: s.tableMoveRowUp,
						disabled: r <= 1,
						run: () => this.moveLine({ axis: 'row', index: r }, -1)
					},
					{
						label: s.tableMoveRowDown,
						disabled: r >= rows - 1,
						run: () => this.moveLine({ axis: 'row', index: r }, 1)
					}
				]
			},
			{
				items: [{ label: s.tableDeleteRow, run: () => this.deleteLine({ axis: 'row', index: r }) }]
			}
		];
	}

	/** One line's menu, opened against its own grip. */
	private openLineMenu(line: Line, at: HTMLElement | undefined): void {
		if (!at) return;
		const s = this.deps.strings();
		const sections =
			line.axis === 'column' ? this.columnSections(line.index) : this.rowSections(line.index);
		const name = line.axis === 'column' ? s.tableColumn(line.index + 1) : s.tableRow(line.index);
		const box = at.getBoundingClientRect();
		// Beside a row's grip and beneath a column's: each menu leaves along the axis the
		// band does not already occupy, so it never opens over the line it is about.
		const point =
			line.axis === 'column' ? { x: box.left, y: box.bottom } : { x: box.right, y: box.top };
		this.openMenu(sections, s.tableMenu(name), point, at);
	}

	/**
	 * Raise the menu at `point`, focus its first live row, and arm its dismissals.
	 *
	 * It does not TRACK the control it opened against — it CLOSES on anything that
	 * would move one. That is what keeps the surface's live-anchor rule (VISUAL_EDITOR
	 * §Chrome) rather than breaking it: the rule forbids holding a rect across a
	 * scroll or a reflow, and a menu that is gone by then holds none.
	 */
	private openMenu(sections: MenuSection[], name: string, point: Point, ret?: HTMLElement): void {
		this.closeMenu();
		const menu = el('div', 'qm-table-menu');
		menu.setAttribute('role', 'menu');
		menu.setAttribute('aria-label', name);
		let first: HTMLButtonElement | undefined;
		sections.forEach((section, i) => {
			if (i) {
				const rule = el('div', 'qm-table-menu-sep');
				rule.setAttribute('role', 'separator');
				menu.appendChild(rule);
			}
			let box = menu;
			if (section.label) {
				box = el('div', 'qm-table-menu-group');
				box.setAttribute('role', 'group');
				box.setAttribute('aria-label', section.label);
				const heading = el('span', 'qm-table-menu-heading');
				heading.textContent = section.label;
				// The group's own `aria-label` already carries the word; the element is the
				// sighted half of the same fact and would otherwise be read twice.
				heading.setAttribute('aria-hidden', 'true');
				box.appendChild(heading);
				menu.appendChild(box);
				if (section.inline) box.appendChild(el('span', 'qm-table-menu-set'));
			}
			const into = section.inline ? (box.lastElementChild as HTMLElement) : box;
			for (const item of section.items) {
				const row = section.inline
					? this.menuGlyph(item, section.value)
					: this.menuRow(item, section.value);
				into.appendChild(row);
				if (!first && !item.disabled) first = row;
			}
		});
		menu.addEventListener('keydown', this.onMenuKeys);
		// PORTALLED to the nearest `[data-qm-root]`, the rule every floating surface in
		// the package keeps (VISUAL_EDITOR §Chrome). Here it is load-bearing twice over:
		// the marker carries the consumer's dials, and the card stack isolates a stacking
		// context around its first card, so a menu left inside the leaf carries a
		// `z-index` scoped to that card and every later card paints through it.
		(this.dom.closest('[data-qm-root]') ?? this.dom).appendChild(menu);
		this.menu = menu;
		this.menuReturn = ret;
		this.place(menu, point);
		document.addEventListener('pointerdown', this.onOutside, true);
		window.addEventListener('scroll', this.onDismiss, true);
		window.addEventListener('resize', this.onDismiss);
		this.paintArmed();
		first?.focus();
	}

	/** One menu row: a whole instruction in words. A real `button`, so Enter, Space and
	 *  the disabled state are the UA's; what is added is the role and the pick. */
	private menuRow(item: MenuItem, align: TableAlign | undefined): HTMLButtonElement {
		return this.menuAct(item, align, el('button', 'qm-table-menu-item'), (btn) => {
			const label = el('span');
			label.textContent = item.label;
			btn.appendChild(label);
		});
	}

	/** One member of an inline set: the glyph alone, its label the accessible name. A
	 *  glyph is legible here and nowhere else in the menu because the four alignments
	 *  are a picture of themselves; every other row is a verb, which has none. */
	private menuGlyph(item: MenuItem, align: TableAlign | undefined): HTMLButtonElement {
		return this.menuAct(item, align, el('button', 'qm-table-menu-glyph'), (btn) => {
			btn.title = item.label;
			btn.setAttribute('aria-label', item.label);
			btn.appendChild(svg(ALIGN_PATHS[item.align ?? 'none']));
		});
	}

	/** What the two shapes share: the role its set wants, the mark of a live radio, the
	 *  disabled state, and the pick that closes the menu before it acts. */
	private menuAct(
		item: MenuItem,
		align: TableAlign | undefined,
		btn: HTMLButtonElement,
		draw: (btn: HTMLButtonElement) => void
	): HTMLButtonElement {
		btn.type = 'button';
		btn.setAttribute('role', item.align ? 'menuitemradio' : 'menuitem');
		if (item.align) {
			btn.setAttribute('data-align', item.align);
			btn.setAttribute('aria-checked', String(item.align === align));
		}
		btn.disabled = !!item.disabled;
		draw(btn);
		btn.addEventListener('click', () => {
			this.closeMenu();
			item.run();
		});
		return btn;
	}

	/** Where the menu opens: below the point the gesture named, flipped above it where
	 *  it would not fit, and pinned to the viewport where NEITHER side fits, so a menu
	 *  taller than the screen starts at the top of it rather than off it. One measure,
	 *  at open; the surface's own `max-height` is what keeps the pinned case scrollable
	 *  rather than clipped. */
	private place(menu: HTMLElement, at: Point): void {
		const box = menu.getBoundingClientRect();
		const room = { w: window.innerWidth, h: window.innerHeight };
		const above = at.y - MENU_GAP - box.height;
		const below = at.y + MENU_GAP;
		menu.style.left = `${Math.max(0, Math.min(at.x, room.w - box.width))}px`;
		menu.style.top = `${
			below + box.height <= room.h ? below : above >= 0 ? above : Math.max(0, room.h - box.height)
		}px`;
	}

	/** Move focus within the open menu. The rows are real buttons, so Enter, Space and
	 *  the disabled state come from the UA; what is bound is the wrap-around walk a menu
	 *  owes, and the two ways out that have to hand focus back. */
	private readonly onMenuKeys = (event: KeyboardEvent): void => {
		const menu = this.menu;
		if (!menu) return;
		if (event.key === 'Escape' || event.key === 'Tab') {
			event.preventDefault();
			event.stopPropagation();
			this.closeMenu(true);
			return;
		}
		const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
		const end = event.key === 'Home' ? 0 : event.key === 'End' ? -1 : undefined;
		if (!step && end === undefined) return;
		event.preventDefault();
		// By ROLE, not by class: the inline set's glyphs are members of the same walk as
		// the rows above them, so pressing down four times crosses the alignments and
		// arrives at what follows. Two selectors here is how one of them gets forgotten.
		const rows = [...menu.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')];
		if (!rows.length) return;
		if (end !== undefined) return rows.at(end)!.focus();
		const at = rows.indexOf(document.activeElement as HTMLButtonElement);
		const from = at < 0 ? (step > 0 ? -1 : 0) : at;
		rows[(from + step + rows.length) % rows.length]!.focus();
	};

	private readonly onOutside = (event: Event): void => {
		if (!this.menu?.contains(event.target as Node)) this.closeMenu();
	};

	private readonly onDismiss = (): void => this.closeMenu();

	/** Drop the menu. `restore` hands focus back to the control that raised it, which
	 *  is what the two keyboard exits owe and what an activated row does not: an op
	 *  lands the focus itself, on the line or the cell it just made. */
	private closeMenu(restore = false): void {
		const menu = this.menu;
		if (!menu) return;
		this.menu = undefined;
		document.removeEventListener('pointerdown', this.onOutside, true);
		window.removeEventListener('scroll', this.onDismiss, true);
		window.removeEventListener('resize', this.onDismiss);
		menu.remove();
		const back = this.menuReturn;
		this.menuReturn = undefined;
		this.paintArmed();
		if (restore) back?.focus();
	}

	// ── Drag to reorder ───────────────────────────────────────────────────────

	/**
	 * Press-and-drag a grip moves its line. The press still SELECTS: the dead zone is
	 * what tells the two apart, so a click that jitters is the gesture it was aimed as
	 * and only a real travel becomes a drag.
	 */
	private readonly onGripDown = (
		line: Line,
		grip: HTMLButtonElement,
		event: PointerEvent
	): void => {
		if (event.button !== 0) return;
		this.closeMenu();
		this.drag = {
			line,
			origin: { x: event.clientX, y: event.clientY },
			engaged: false,
			drop: line.index,
			painted: -1,
			pointerId: event.pointerId,
			grip,
			lines: [],
			origin0: { left: 0, top: 0 }
		};
		grip.setPointerCapture(event.pointerId);
		grip.addEventListener('pointermove', this.onGripMove);
		grip.addEventListener('pointerup', this.onGripUp);
		grip.addEventListener('pointercancel', this.onGripUp);
	};

	private readonly onGripMove = (event: PointerEvent): void => {
		const drag = this.drag;
		if (!drag) return;
		const travel = Math.hypot(event.clientX - drag.origin.x, event.clientY - drag.origin.y);
		if (!drag.engaged && travel < DEAD_ZONE) return;
		if (!drag.engaged) this.engage(drag);
		drag.drop = this.dropIndex(drag, drag.line.axis === 'row' ? event.clientY : event.clientX);
		this.paintDrop(drag);
	};

	/** The drag becomes one: lift the line, and measure the table ONCE. */
	private engage(drag: Drag): void {
		drag.engaged = true;
		this.dom.classList.add('qm-table-dragging');
		drag.grip.classList.add('qm-table-lifted');
		for (const cell of this.lineCells(drag.line)) cell.classList.add('qm-table-lifted');
		const frame = this.frame;
		if (!frame) return;
		const box = frame.getBoundingClientRect();
		drag.origin0 = { left: box.left, top: box.top };
		const { floor, limit } = this.bounds(drag.line.axis, this.props());
		for (let i = floor; i <= limit; i++) {
			const cells = this.lineCells({ axis: drag.line.axis, index: i });
			if (!cells.length) continue;
			const head = cells[0]!.getBoundingClientRect();
			const tail = cells[cells.length - 1]!.getBoundingClientRect();
			drag.lines.push(
				drag.line.axis === 'row'
					? {
							index: i,
							start: head.top,
							end: head.bottom,
							cross: head.left,
							span: tail.right - head.left
						}
					: {
							index: i,
							start: head.left,
							end: head.right,
							cross: head.top,
							span: tail.bottom - head.top
						}
			);
		}
	}

	private readonly onGripUp = (): void => {
		const drag = this.drag;
		if (!drag) return;
		const { line, drop, engaged } = drag;
		this.endDrag();
		if (!engaged) return;
		// The press that ends a drag is not the press that selects: the click still to
		// come would re-select the line the drag just moved off.
		this.suppressClick = true;
		if (drop !== line.index) this.moveLine(line, drop - line.index);
		else this.selectLine(line);
	};

	private endDrag(): void {
		const drag = this.drag;
		if (!drag) return;
		this.drag = undefined;
		this.dropMark?.remove();
		this.dropMark = undefined;
		this.dom.classList.remove('qm-table-dragging');
		for (const lifted of this.dom.querySelectorAll('.qm-table-lifted'))
			lifted.classList.remove('qm-table-lifted');
		drag.grip.removeEventListener('pointermove', this.onGripMove);
		drag.grip.removeEventListener('pointerup', this.onGripUp);
		drag.grip.removeEventListener('pointercancel', this.onGripUp);
		if (drag.grip.hasPointerCapture?.(drag.pointerId))
			drag.grip.releasePointerCapture(drag.pointerId);
	}

	/** Which line the pointer is over, along the drag's axis: the nearest by the extents
	 *  measured at engage. One dimension, because every cell of a row shares its top and
	 *  bottom and every cell of a column shares its left and right, so the cross-axis
	 *  term is identical across the candidates and cancels out of the comparison. */
	private dropIndex(drag: Drag, at: number): number {
		let best = drag.line.index;
		let nearest = Infinity;
		for (const line of drag.lines) {
			const gap = at < line.start ? line.start - at : at > line.end ? at - line.end : 0;
			if (gap >= nearest) continue;
			nearest = gap;
			best = line.index;
		}
		return best;
	}

	private lineCells(line: Line): HTMLElement[] {
		return this.cells
			.filter((m) => (line.axis === 'row' ? m.r === line.index : m.c === line.index))
			.map((m) => m.box);
	}

	/** The drop indicator: one rule on the boundary the line would land against, drawn
	 *  in the frame so it spans the grid and travels with it. Redrawn only when the
	 *  boundary changes, which is once per line crossed rather than once per move. */
	private paintDrop(drag: Drag): void {
		if (drag.drop === drag.painted) return;
		const line = drag.lines.find((l) => l.index === drag.drop);
		const frame = this.frame;
		if (!line || !frame) return;
		drag.painted = drag.drop;
		if (!this.dropMark) {
			this.dropMark = el('div', 'qm-table-drop');
			this.dropMark.setAttribute('data-axis', drag.line.axis);
			frame.appendChild(this.dropMark);
		}
		const edge = (drag.drop > drag.line.index ? line.end : line.start) - 1;
		const mark = this.dropMark;
		if (drag.line.axis === 'row') {
			mark.style.top = `${edge - drag.origin0.top}px`;
			mark.style.left = `${line.cross - drag.origin0.left}px`;
			mark.style.width = `${line.span}px`;
		} else {
			mark.style.left = `${edge - drag.origin0.left}px`;
			mark.style.top = `${line.cross - drag.origin0.top}px`;
			mark.style.height = `${line.span}px`;
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
		this.closeMenu();
		this.teardownCells();
		this.grips.clear();
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

		// The frame is the grid's own box, and the three band CAPS hang off its corners
		// rather than off a cell: the corner where the two bands meet, and one `+` at
		// each band's far end. A cell would have served for two of them and not for the
		// third — a table with no body rows has no last row to hang the row `+` in — and
		// a cap is about the grid rather than about a line in any case.
		const frame = el('div', 'qm-table-frame');
		frame.append(
			table,
			this.corner(s),
			this.cap('column', s.tableAddColumn),
			this.cap('row', s.tableAddRow)
		);
		const scroller = el('div', 'qm-table-scroller');
		scroller.appendChild(frame);
		this.frame = frame;
		this.dom.appendChild(scroller);
		this.paintLine();
	}

	/** One table row: its cells, each carrying whatever chrome hangs off it. */
	private row(props: TableProps, r: number, s: TableChromeStrings): HTMLElement {
		const tr = el('tr', r === 0 ? 'qm-table-header-row' : undefined);
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
			// first cell. Both are absolutely positioned into the frame's own padding, so
			// neither is in the grid's layout and neither is a cell of its own. The header
			// carries no row grip: it cannot be deleted (`header: []` is not a table) and
			// nothing goes above it, so there is no line to select.
			if (r === 0)
				box.appendChild(this.grip({ axis: 'column', index: c }, s.tableSelectColumn(c + 1)));
			else if (c === 0) box.appendChild(this.grip({ axis: 'row', index: r }, s.tableSelectRow(r)));
			tr.appendChild(box);
			this.mountCell(box, host, r, c, s);
		});
		return tr;
	}

	/** A line's grip, and the whole of that line's chrome. It carries three gestures at
	 *  one target, ordered by how much each commits to: a press SELECTS the line, a
	 *  press on the line already selected raises its menu, and a press that travels
	 *  drags it. Nothing is hidden behind a mode — the first press is always the
	 *  cheapest reading, and the drag is told from the click by the dead zone. */
	private grip(line: Line, label: string): HTMLButtonElement {
		const btn = chromeButton('qm-table-grip', label, () => {
			if (this.suppressClick) {
				this.suppressClick = false;
				return;
			}
			const held = this.isSelected(line);
			this.selectLine(line);
			if (held) this.openLineMenu(line, btn);
		});
		btn.setAttribute('aria-pressed', 'false');
		btn.setAttribute('aria-haspopup', 'menu');
		btn.setAttribute('data-axis', line.axis);
		const bar = el('span', 'qm-table-grip-bar');
		bar.appendChild(svg(GRIP[line.axis], 3));
		btn.appendChild(bar);
		btn.addEventListener('pointerdown', (e) => this.onGripDown(line, btn, e));
		btn.addEventListener('keydown', this.lineKeys(line));
		this.grips.set(lineKey(line), btn);
		return btn;
	}

	/** The island's own handle, at the grid origin: the spreadsheet's select-all
	 *  position, where the two bands meet. A press selects the island, which is the
	 *  state Backspace deletes the whole table from. */
	private corner(s: TableChromeStrings): HTMLButtonElement {
		const btn = chromeButton('qm-table-corner', s.tableSelectTable, () => this.selectIsland());
		btn.appendChild(el('span', 'qm-table-corner-mark'));
		return btn;
	}

	/** A band's far cap: the `+` that appends a line at the end of the axis it sits on.
	 *  Appending is the op a table wants most and the only one worth a control of its
	 *  own; every interior insert is a row of the menu. */
	private cap(axis: Axis, label: string): HTMLButtonElement {
		const btn = chromeButton('qm-table-add', label, () => {
			const props = this.props();
			if (axis === 'row')
				this.write(insertRow(props, props.rows.length), { r: rowCount(props), c: 0 });
			else this.write(insertColumn(props, columnCount(props) - 1), { r: 0, c: columnCount(props) });
		});
		btn.setAttribute('data-axis', axis);
		btn.appendChild(svg(PLUS));
		return btn;
	}

	private mountCell(
		box: HTMLElement,
		host: HTMLElement,
		r: number,
		c: number,
		s: TableChromeStrings
	): void {
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
					this.closeMenu();
					this.clearLine();
					this.deps.onCellFocus();
					return false;
				}
			}
		});
		this.cells.push({ view, host, box, unregister: this.deps.register(view), r, c });
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
		// Up and down are the grid's own walk: nothing else moves the caret vertically,
		// and `focusCell` clamps, so neither can grow the table. Left and right are
		// deliberately absent: at a text edge they would call what Tab and Shift-Tab
		// already call, and inherit the append-past-the-last-cell that makes Tab a
		// growth affordance and would make a caret key one.
		const walk = (dir: 'up' | 'down'): Command => {
			return (_state, _dispatch, view) => {
				const { selection } = view?.state ?? {};
				if (!view || !(selection instanceof TextSelection) || !selection.empty) return false;
				if (!view.endOfTextblock(dir)) return false;
				this.focusCell(dir === 'up' ? r - 1 : r + 1, c);
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
