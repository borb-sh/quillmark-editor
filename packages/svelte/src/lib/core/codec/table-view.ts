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
// THE CHROME IS A BAND AND A SELECTION, and it raises nothing. Every control is
// absolutely positioned out of the grid: a grip along each line's leading edge, inside
// the cell it names, and an add bar along each axis's trailing edge, against the grid's
// frame. What no control says, the SELECTION says: one rectangle of cells, drawn by a
// grip or swept by the pointer, and one verb over it. `codec/prose.css` draws it.
//
// A POINTER PRESS RESOLVES TO A CARET, always, except on a band control; a press that
// TRAVELS out of the cell it started in draws a block instead (CODEC §"The table
// island").
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
	cellAt,
	cellContent,
	cellEqual,
	cellFromDoc,
	clearCells,
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
	shapeEqual,
	withCell
} from './table.js';

/** Everything the island's chrome says. Accessible names, not decoration: every
 *  control here is a bar, so an untranslated one reads the wrong language rather than
 *  merely inconsistent (VISUAL_EDITOR §"What the surface says"). */
export interface TableChromeStrings {
	/** The island's own name, on the wrapper. */
	tableLabel: string;
	/** Row 0 is the header, which is not "Row 0". */
	tableHeaderRow: string;
	tableRow: (index: number) => string;
	tableColumn: (index: number) => string;
	/** A cell's accessible name: nothing else names a nested leaf. */
	tableCell: (row: string, column: string) => string;
	/** A grip's name. It SELECTS its line, and the verbs are then the selection's
	 *  (Backspace, Alt+arrows) or the drag's, so the name is the gesture. */
	tableSelectRow: (index: number) => string;
	tableSelectColumn: (index: number) => string;
	/** The two trailing bars, each of which grows the table along its own axis. */
	tableAddRow: string;
	tableAddColumn: string;
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
	tableAddRow: 'Add row',
	tableAddColumn: 'Add column'
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

/** The one glyph this chrome draws, as the path data a DOM node can carry — its own set
 *  rather than `visual/icons/nodes.ts`, this being the one place chrome is built without
 *  Svelte, and `/core` reaching no surface module. Same 24×24 frame and the same origin,
 *  off an earlier release than the thirteen there; `NOTICE` carries the notices for
 *  both. The dots are zero-length strokes under a round cap, which is how that set draws
 *  a dot everywhere it has one. */
const GRIP: Record<Axis, string[]> = {
	column: ['M5 9h.01', 'M12 9h.01', 'M19 9h.01', 'M5 15h.01', 'M12 15h.01', 'M19 15h.01'],
	row: ['M9 5h.01', 'M9 12h.01', 'M9 19h.01', 'M15 5h.01', 'M15 12h.01', 'M15 19h.01']
};

/** The grip's marks. The stroke is heavy for a chrome glyph because they are DOTS, and a
 *  dot drawn at the line weight of a stroke disappears at the size the bar renders. */
function svg(paths: string[]): SVGElement {
	const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	el.setAttribute('viewBox', '0 0 24 24');
	el.setAttribute('fill', 'none');
	el.setAttribute('stroke', 'currentColor');
	el.setAttribute('stroke-width', '3');
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

/** The band's controls, each of which answers for its own press. Spelled apart from
 *  {@link OWNED} because the pointer router needs them BEFORE it needs the cells: a grip
 *  is inside the cell it names, so the two selectors overlap on exactly the press whose
 *  reading they disagree about. */
const CONTROLS = '.qm-table-grip, .qm-table-add';

/** What the nested views and the band answer for themselves, which is what `stopEvent`
 *  keeps from PM. */
const OWNED = `.qm-table-cell-host, ${CONTROLS}`;

/** How far a press travels before it is a drag rather than a click. Under it, a press
 *  that jitters is still the gesture it was aimed as. */
const DEAD_ZONE = 3;

/** A line's key in the grip registry, spelled once. */
const lineKey = (line: Line): string => `${line.axis}:${line.index}`;

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
	/** The `td`/`th` itself: what the selection wash and a drop's extent are measured
	 *  and painted on. Held rather than queried, so `r`/`c` stay the typed pair above
	 *  instead of a `data-` attribute parsed back out of the DOM. */
	box: HTMLElement;
	unregister: () => void;
	r: number;
	c: number;
}

/** Which line a gesture acts on. `row` is in the chrome's row space (0 is the
 *  header), `column` in the column space. */
type Axis = 'row' | 'column';

interface Line {
	axis: Axis;
	index: number;
}

/**
 * The selected cells: an inclusive rectangle in the chrome's coordinate space.
 * NodeView-local state rather than a PM `Selection`, because nothing outside this
 * island can name it: a cell index inside one leaf is not a position in the document's
 * coordinate space, and a custom `Selection` would have to be one to be dispatched.
 *
 * ONE state for both gestures — a grip press is the rectangle covering a whole line —
 * because the verb reading it is one verb. What Backspace means is decided by the
 * rectangle's EXTENT rather than by which gesture drew it, so a row swept cell by cell
 * deletes exactly as the row its grip named does.
 */
interface Cells {
	r0: number;
	c0: number;
	r1: number;
	c1: number;
}

const sameCells = (a: Cells, b: Cells): boolean =>
	a.r0 === b.r0 && a.c0 === b.c0 && a.r1 === b.r1 && a.c1 === b.c1;

/** The rectangle two corners span, in either order. */
const spanCells = (a: { r: number; c: number }, b: { r: number; c: number }): Cells => ({
	r0: Math.min(a.r, b.r),
	c0: Math.min(a.c, b.c),
	r1: Math.max(a.r, b.r),
	c1: Math.max(a.c, b.c)
});

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

/** A block selection in flight: the cell the press landed in, and the cell boxes a
 *  pointer resolves against — measured ONCE at engage, for the reason a line drag
 *  measures once. `live` is what keeps a press that jitters inside its own cell a
 *  CARET: the gesture becomes a selection only once it has left that cell. */
interface Sweep {
	origin: { r: number; c: number };
	from: Point;
	engaged: boolean;
	live: boolean;
	boxes: { r: number; c: number; rect: DOMRect }[];
}

class TableIslandView implements NodeView {
	readonly dom: HTMLElement;
	private cells: MountedCell[] = [];
	/** The props the current DOM was built from: what an `update` compares against to
	 *  tell a reseed from a rebuild. */
	private rendered: TableProps | undefined;
	private selected: Cells | undefined;
	private drag: Drag | undefined;
	private sweep: Sweep | undefined;
	/** The grips, by the line each acts on: what selection paint and a drag reach for
	 *  without a query. The typed twin of `cells`. */
	private grips = new Map<string, HTMLButtonElement>();
	/** The grid's own box, and the containing block every out-of-flow control is placed
	 *  against. Not the scroller: an absolute inside a scroll container is placed
	 *  against a padding box the scroll then slides out from under, so a control at the
	 *  grid's far end would drift into the middle of it. */
	private frame: HTMLElement | undefined;
	private dropMark: HTMLElement | undefined;
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
		this.endDrag();
		this.endSweep();
		this.teardownCells();
	}

	// ── The pointer ───────────────────────────────────────────────────────────

	/**
	 * Route a press to its band (CODEC §"The table island"): inside the frame the
	 * nearest cell's caret, outside it the document's, and a band control answers for
	 * itself.
	 *
	 * A press IN a cell is a caret and the nested view is taking it; what is armed here
	 * is only the promotion, since a press that travels into another cell stops being a
	 * caret and becomes a block. That is the one gesture that has to see a press the
	 * nested view already owns, which is why it runs ahead of the cell host's guard
	 * rather than behind it. A CONTROL is the other way round: a grip is inside the cell
	 * it names, so its guard runs ahead of the cell branch, or a grip press would plant a
	 * caret in that cell and arm a sweep the drag then draws a block with.
	 *
	 * A `mousedown` listener, and it stops the event: PM's own mousedown is what arms
	 * the node selection the matching mouseup then takes. `stopEvent` is the other way
	 * to reach that, and it gates the subtree's keydown and drag routing too.
	 */
	private readonly onPointerDown = (event: MouseEvent): void => {
		// Any other island type is an atom with NO interior: a press on it is
		// unambiguous, and PM's to answer. So is a secondary press, which types nothing.
		if (!this.rendered || event.button !== 0) return;
		const target = event.target as Element | null;
		if (target?.closest?.(CONTROLS)) return; // a control answers for itself
		const point = { x: event.clientX, y: event.clientY };
		const box = target?.closest?.('.qm-table-cell');
		const cell = box && this.cells.find((m) => m.box === box);
		if (cell) {
			// A fresh press in a cell means "caret here", so it retires whatever block was
			// held: a press back into the cell that already has focus raises no `focus`
			// event, and without this the block would survive to eat the next Backspace.
			this.clearSelection();
			// A cell's own padding and its borders are the TABLE's, not the view's: a press
			// there lands the caret it aimed at rather than nothing.
			if (!target?.closest?.('.qm-table-cell-host')) {
				event.preventDefault();
				event.stopPropagation();
				this.focusCell(cell.r, cell.c);
			}
			this.armSweep(cell, point);
			return;
		}
		// Past the control guard and the cell branch, the press is on the island's own
		// space: the band's padding, or the frame beside the grid.
		event.preventDefault();
		event.stopPropagation();
		const grid = this.dom.querySelector('.qm-table');
		if (grid && within(grid.getBoundingClientRect(), point)) this.focusNearestCell(point);
		else this.caretBeside(point);
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

	/** The island as the selection: Escape out of a cell or a line, which is the whole of
	 *  what selects it, and Backspace over it is what deletes the table
	 *  (CODEC §"The table island"). */
	private selectIsland(): void {
		const pos = this.getPos();
		if (pos == null) return;
		this.clearSelection();
		this.outer.focus();
		this.outer.dispatch(
			this.outer.state.tr.setSelection(NodeSelection.create(this.outer.state.doc, pos))
		);
	}

	// ── Sweeping a block of cells ─────────────────────────────────────────────

	private armSweep(origin: MountedCell, from: Point): void {
		this.endSweep();
		this.sweep = {
			origin: { r: origin.r, c: origin.c },
			from,
			engaged: false,
			live: false,
			boxes: []
		};
		document.addEventListener('mousemove', this.onSweepMove, true);
		document.addEventListener('mouseup', this.onSweepUp, true);
	}

	/**
	 * Promote a travelling press to a block. Until the pointer leaves the cell it
	 * started in the gesture is still a caret and the nested view keeps it; from the
	 * first cell it crosses, the block is the selection and the browser's own text drag
	 * is dropped, two selections over one press being one too many.
	 */
	private readonly onSweepMove = (event: MouseEvent): void => {
		const sweep = this.sweep;
		if (!sweep) return;
		const at = { x: event.clientX, y: event.clientY };
		if (!sweep.engaged) {
			if (Math.hypot(at.x - sweep.from.x, at.y - sweep.from.y) < DEAD_ZONE) return;
			sweep.engaged = true;
			sweep.boxes = this.cells.map((m) => ({
				r: m.r,
				c: m.c,
				rect: m.box.getBoundingClientRect()
			}));
		}
		const head = this.cellNear(sweep.boxes, at);
		if (!head) return;
		if (!sweep.live && head.r === sweep.origin.r && head.c === sweep.origin.c) return;
		sweep.live = true;
		this.select(spanCells(sweep.origin, head));
		document.getSelection()?.removeAllRanges();
		event.preventDefault();
	};

	private readonly onSweepUp = (): void => this.endSweep();

	private endSweep(): void {
		if (!this.sweep) return;
		this.sweep = undefined;
		document.removeEventListener('mousemove', this.onSweepMove, true);
		document.removeEventListener('mouseup', this.onSweepUp, true);
	}

	/** The cell a point is in, or the nearest one outside the grid: a sweep that runs
	 *  past the last row still names a cell, which is what lets it reach the edge. */
	private cellNear(
		boxes: { r: number; c: number; rect: DOMRect }[],
		at: Point
	): { r: number; c: number } | undefined {
		let best: { r: number; c: number } | undefined;
		let nearest = Infinity;
		for (const box of boxes) {
			const gap = distance(box.rect, at);
			if (gap >= nearest) continue;
			nearest = gap;
			best = { r: box.r, c: box.c };
		}
		return best;
	}

	// ── The selection ─────────────────────────────────────────────────────────

	/** Take the line's grip: the focus a selection's keys land on. */
	private gripFor(line: Line): HTMLButtonElement | undefined {
		return this.grips.get(lineKey(line));
	}

	/** The rectangle a line covers, which is what selecting one MEANS: a grip draws no
	 *  second kind of selection, it draws this one. */
	private lineCells(line: Line): Cells {
		const props = this.props();
		return line.axis === 'row'
			? { r0: line.index, c0: 0, r1: line.index, c1: columnCount(props) - 1 }
			: { r0: 0, c0: line.index, r1: rowCount(props) - 1, c1: line.index };
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
		this.select(this.lineCells(line));
		this.gripFor(line)?.focus();
	}

	private select(cells: Cells): void {
		// One subject at a time: a cell selection retires an island one, or the surface
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
		this.selected = cells;
		this.paintSelection();
	}

	private clearSelection(): void {
		if (!this.selected) return;
		this.selected = undefined;
		this.paintSelection();
	}

	/** Wash the selected cells and mark the grip of any line the selection exactly
	 *  covers. Imperative rather than a re-render: a rebuild destroys the nested views,
	 *  and a selection is exactly the state that must not cost the carets in them. */
	private paintSelection(): void {
		const held = this.selected;
		for (const [key, grip] of this.grips) {
			const [axis, index] = key.split(':');
			const line = { axis: axis as Axis, index: Number(index) };
			grip.setAttribute('aria-pressed', String(!!held && sameCells(held, this.lineCells(line))));
		}
		for (const cell of this.cells)
			cell.box.toggleAttribute(
				'data-selected',
				!!held && cell.r >= held.r0 && cell.r <= held.r1 && cell.c >= held.c0 && cell.c <= held.c1
			);
	}

	/**
	 * A selected line's keys, bound to the line its own grip names rather than read off
	 * the selection: focus and selection are separate, and a Tab between grips would
	 * otherwise aim the next key at whichever line was last pressed.
	 *
	 * Undo is forwarded for the reason a cell forwards it: one undo stack per leaf, and
	 * a `button` has no history of its own.
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
			const acts = along.includes(key) || ['Backspace', 'Delete', 'Enter', 'Escape'].includes(key);
			if (!acts) return;
			event.preventDefault();
			event.stopPropagation();
			if (key === 'Escape') return this.selectIsland();
			if (key === 'Enter') {
				this.clearSelection();
				return line.axis === 'row' ? this.focusCell(line.index, 0) : this.focusCell(0, line.index);
			}
			if (key === 'Backspace' || key === 'Delete') return this.deleteSelection();
			const by = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1;
			if (event.altKey) return this.moveLine(line, by);
			const { floor, limit } = this.bounds(line.axis, this.props());
			this.selectLine({
				axis: line.axis,
				index: Math.max(floor, Math.min(line.index + by, limit))
			});
		};
	}

	/**
	 * What Backspace means over the selection, decided by its EXTENT rather than by the
	 * gesture that drew it (CODEC §"The table island"): a rectangle spanning every row
	 * covers whole COLUMNS and deletes them, one spanning every column covers whole
	 * ROWS, and anything else covers no rank at all and is CLEARED. The rectangle
	 * spanning BOTH is the whole table, which is no rank deletion — one leaves a table
	 * with fewer ranks — so it clears with the rest.
	 */
	private deleteSelection(): void {
		const held = this.selected;
		if (!held) return;
		const props = this.props();
		const wide = held.c0 === 0 && held.c1 === columnCount(props) - 1;
		const tall = held.r0 === 0 && held.r1 === rowCount(props) - 1;
		if (tall && !wide) return this.dropColumns(held);
		if (wide && !tall) return this.dropRows(held);
		this.write(clearCells(props, held.r0, held.c0, held.r1, held.c1));
		this.select(held);
	}

	/** Drop the body rows the selection covers, high index first so the ones still to go
	 *  keep their indices, and empty the header's cells if the selection reached them:
	 *  `header: []` is not a table, so that rank cannot go and its cells are cleared
	 *  instead. One `write`, so the whole gesture is one undo step. */
	private dropRows(held: Cells): void {
		const from = Math.max(1, held.r0);
		let props = this.props();
		if (held.r0 === 0) props = clearCells(props, 0, held.c0, 0, held.c1);
		for (let r = held.r1; r >= from; r--) props = deleteRow(props, r);
		this.write(props);
		// A header-only selection deleted nothing, so it still names what it named.
		if (held.r1 < from) return this.select(held);
		const rows = rowCount(this.props());
		if (rows > 1) this.selectLine({ axis: 'row', index: Math.max(1, Math.min(from, rows - 1)) });
		else this.clearSelection();
	}

	/** Drop the columns the selection covers. It never covers them all — that is the
	 *  clear case above — so the rectangle's floor of one is never reached here, and
	 *  every selected cell leaves with its column. */
	private dropColumns(held: Cells): void {
		let props = this.props();
		for (let c = held.c1; c >= held.c0; c--) props = deleteColumn(props, c);
		this.write(props);
		this.selectLine({ axis: 'column', index: Math.max(0, held.c0 - 1) });
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
		// Optional for the reason the release is: pointer capture is the browser's, and a
		// DOM without it still routes the move and up events the drag reads.
		grip.setPointerCapture?.(event.pointerId);
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
		for (const cell of this.boxesOf(drag.line)) cell.classList.add('qm-table-lifted');
		const frame = this.frame;
		if (!frame) return;
		const box = frame.getBoundingClientRect();
		drag.origin0 = { left: box.left, top: box.top };
		const { floor, limit } = this.bounds(drag.line.axis, this.props());
		for (let i = floor; i <= limit; i++) {
			const cells = this.boxesOf({ axis: drag.line.axis, index: i });
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

	private boxesOf(line: Line): HTMLElement[] {
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
		this.endSweep();
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

		// The frame is the grid's own box, and the two controls about an AXIS rather than
		// about a line hang off its edges: an add bar along each trailing edge. A cell
		// would have served for neither — a table with no body rows has no last row to
		// hang the row bar in, and a bar spans the whole edge rather than one line of it.
		const frame = el('div', 'qm-table-frame');
		frame.append(table, this.addBar('column', s.tableAddColumn), this.addBar('row', s.tableAddRow));
		const scroller = el('div', 'qm-table-scroller');
		scroller.appendChild(frame);
		this.frame = frame;
		this.dom.appendChild(scroller);
		this.paintSelection();
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

	/** A line's grip, and the whole of that line's chrome: a press SELECTS the line, a
	 *  press that travels DRAGS it. Both are "this line", asked once with the pointer,
	 *  and the dead zone is what tells them apart. */
	private grip(line: Line, label: string): HTMLButtonElement {
		const btn = chromeButton('qm-table-grip', label, () => {
			if (this.suppressClick) this.suppressClick = false;
			else this.selectLine(line);
		});
		btn.setAttribute('aria-pressed', 'false');
		btn.setAttribute('data-axis', line.axis);
		const bar = el('span', 'qm-table-grip-bar');
		bar.appendChild(svg(GRIP[line.axis]));
		btn.appendChild(bar);
		btn.addEventListener('pointerdown', (e) => this.onGripDown(line, btn, e));
		btn.addEventListener('keydown', this.lineKeys(line));
		this.grips.set(lineKey(line), btn);
		return btn;
	}

	/** A trailing bar: the whole edge past the last line of its axis, and the one way a
	 *  pointer grows the table. It spans the edge rather than capping it, because what
	 *  it appends to is the AXIS and not a line — there is no line out there to sit
	 *  against, and an edge-long target is the easiest thing on the island to hit.
	 *
	 *  It draws no glyph: a bar the length of the edge it would grow, appearing under the
	 *  pointer out past the last line, is the claim. Its NAME still carries the verb, for
	 *  the pointer that hovers and everything that does not use one. */
	private addBar(axis: Axis, label: string): HTMLButtonElement {
		const btn = chromeButton('qm-table-add', label, () => {
			const props = this.props();
			if (axis === 'row')
				this.write(insertRow(props, props.rows.length), { r: rowCount(props), c: 0 });
			else this.write(insertColumn(props, columnCount(props) - 1), { r: 0, c: columnCount(props) });
		});
		btn.setAttribute('data-axis', axis);
		btn.appendChild(el('span', 'qm-table-add-bar'));
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
					this.clearSelection();
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
		// A block selection outranks the caret it was swept from: the origin cell still
		// holds the focus, so its own view is where the block's Backspace lands. Declining
		// when no block is held is what leaves an ordinary Backspace to `baseKeymap`.
		const erase: Command = () => {
			if (!this.selected) return false;
			this.deleteSelection();
			return true;
		};
		return {
			...marks,
			// One undo stack per leaf: a cell carries no history of its own, so Mod-z
			// unwinds a cell keystroke and a row op in the order they happened.
			'Mod-z': () => undo(this.outer.state, this.outer.dispatch),
			'Mod-y': () => redo(this.outer.state, this.outer.dispatch),
			'Shift-Mod-z': () => redo(this.outer.state, this.outer.dispatch),
			Backspace: erase,
			Delete: erase,
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
