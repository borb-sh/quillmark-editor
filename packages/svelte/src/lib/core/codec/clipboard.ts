// The table island's clipboard door, both directions: what a copy writes, a paste
// reads. The design and the two wire formats are CODEC §"The table island" and
// §"Markdown at the edges"; what is here is the grammar.
//
// WHAT CROSSES IS A RECTANGLE, never a cell. A `<table>` read in is one; the held cell
// selection written out is one; a rectangle overlaid onto a table at a cell is one. The
// wire therefore carries `TableCell[][]` and no coordinates: each end names its own
// corner.
//
// A ROW 0 IS A HEADER, on both sides, which is the model's own rule (`table.ts`
// §`allRows`): whichever row holds index 0 is the header. So a `<table>` with no `<th>`
// promotes its first row, and a copied rectangle's first row is the header of what it
// pastes.
import { DOMParser as PMDOMParser, DOMSerializer, Fragment, Slice } from 'prosemirror-model';
import type { Node as PMNode, ParseRule, Schema } from 'prosemirror-model';
import { Plugin } from 'prosemirror-state';
import type { TableCell, TableProps } from '@quillmark/wasm';
import { islandMinter } from './islands.js';
import { inlineSchema } from './schema.js';
import {
	ALIGNS,
	cellContent,
	cellFromDoc,
	emptyCell,
	normalizeTable,
	type TableAlign
} from './table.js';
import { decode } from './decode.js';

/** The two keys, spelled once: a reader and a writer that disagreed about which holds
 *  the table would each work alone and never round-trip. */
const HTML = 'text/html';
const PLAIN = 'text/plain';

/** What a clipboard event hands over, which is all either arm needs of it: jsdom has no
 *  `DataTransfer`, and the suite drives these paths with the two methods themselves. */
interface Clipboard {
	getData: (type: string) => string;
	setData: (type: string, data: string) => void;
}

// ── Reading a table in ──────────────────────────────────────────────────────

/** The inline parser, built once: a cell is a `richtext(inline)` content unit, so the
 *  schema that reads one is the schema a cell is edited under. */
let cellParser: PMDOMParser | undefined;

/**
 * One cell from its `<td>` / `<th>`. The inline schema is the whole normalization: it
 * declares one paragraph, no containers and no islands, so a cell holding blocks
 * flattens to its text and an image in one drops out rather than leaving a slot char
 * behind. Whitespace collapses and the ends trim, which is PM's own parse.
 */
function cellFromDOM(dom: Element): TableCell {
	cellParser ??= PMDOMParser.fromSchema(inlineSchema);
	const para = cellParser.parse(dom, { topNode: inlineSchema.nodes.paragraph.create() });
	return cellFromDoc(inlineSchema.nodes.doc.create(null, para), emptyCell());
}

/** A column's alignment off its header cell, which is where a pipe table's delimiter
 *  row puts it. Anything else (`start`, `justify`, absent) is `none`. */
function alignFromDOM(dom: Element): TableAlign {
	const raw = (
		dom.getAttribute('align') ??
		(dom as HTMLElement).style?.textAlign ??
		''
	).toLowerCase();
	return ALIGNS.includes(raw as TableAlign) ? (raw as TableAlign) : 'none';
}

/**
 * A `<table>` element as props. `rowspan` is not carried — a merged cell is not a
 * rectangle, so a table with one arrives with the rows below it short and
 * {@link normalizeTable} pads them at the end. `colspan` IS, as the empty cells it
 * covers, so the columns after it keep their index.
 *
 * Only the table's OWN rows: a `<tr>` inside a nested table belongs to a cell this
 * reader is about to flatten, not to a rank of this one.
 */
export function tableFromDOM(dom: Element): TableProps {
	const rows: TableCell[][] = [];
	const aligns: TableAlign[] = [];
	for (const tr of dom.querySelectorAll('tr')) {
		if (tr.closest('table') !== dom) continue;
		const cells: TableCell[] = [];
		for (const box of tr.children) {
			if (box.tagName !== 'TD' && box.tagName !== 'TH') continue;
			if (!rows.length) aligns.push(alignFromDOM(box));
			cells.push(cellFromDOM(box));
			const span = Number(box.getAttribute('colspan')) || 1;
			for (let i = 1; i < span; i++) {
				if (!rows.length) aligns.push('none');
				cells.push(emptyCell());
			}
		}
		rows.push(cells);
	}
	const [header = [], ...body] = rows;
	return normalizeTable({ header, rows: body, aligns });
}

/** The table a paste is carrying, or `undefined` for a paste that holds none. The FIRST
 *  one: a clipboard holding a table among other blocks is a document paste, and only a
 *  surface that takes nothing but a table (a cell) reads it this way. */
export function tableFromClipboard(data: Clipboard | null | undefined): TableProps | undefined {
	const html = data?.getData(HTML);
	if (!html || !/<table[\s>]/i.test(html)) return undefined;
	const dom = new DOMParser().parseFromString(html, HTML).querySelector('table');
	return dom ? tableFromDOM(dom) : undefined;
}

// ── Writing a rectangle out ─────────────────────────────────────────────────

/** A cell's inline DOM, serialized by the schema that declares its marks, which is what
 *  makes {@link cellFromDOM} its exact inverse. */
function cellToDOM(cell: TableCell, owner: Document): Node {
	const doc = decode(cellContent(cell), inlineSchema);
	const line = doc.firstChild;
	return DOMSerializer.fromSchema(inlineSchema).serializeFragment(
		line ? line.content : Fragment.empty,
		{ document: owner }
	);
}

/**
 * A rectangle as a `<table>`: the wire the HTML arm writes and reads. Its first row is
 * a `<th>` row whatever row of the source it came from, that being the row index 0 a
 * paste lands it at.
 */
export function tableToDOM(block: TableCell[][], aligns: TableAlign[], owner: Document): Element {
	const table = owner.createElement('table');
	block.forEach((cells, r) => {
		const tr = owner.createElement('tr');
		cells.forEach((cell, c) => {
			const box = owner.createElement(r === 0 ? 'th' : 'td');
			const align = aligns[c] ?? 'none';
			if (align !== 'none') box.style.textAlign = align;
			box.appendChild(cellToDOM(cell, owner));
			tr.appendChild(box);
		});
		table.appendChild(tr);
	});
	return table;
}

/** A cell's text as one pipe-table field: the delimiter escaped, since a `|` inside a
 *  cell would otherwise open a column that is not there. Marks are dropped, markdown
 *  being the lossy arm. */
const pipeCell = (cell: TableCell): string => cell.text.replaceAll('|', '\\|');

/**
 * A rectangle as pipe rows, delimiter row included: what a plain-text target reads as a
 * table and what markdown carries. The delimiter follows the FIRST row for the reason
 * that row serializes as `<th>` — a pasted rectangle's row 0 is a header.
 */
export function tableToPipe(block: TableCell[][], aligns: TableAlign[]): string {
	const width = block[0]?.length ?? 0;
	const rule = Array.from({ length: width }, (_, c) => {
		const align = aligns[c] ?? 'none';
		if (align === 'center') return ':---:';
		return align === 'left' ? ':---' : align === 'right' ? '---:' : '---';
	});
	const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
	const [head = [], ...body] = block;
	return [line(head.map(pipeCell)), line(rule), ...body.map((row) => line(row.map(pipeCell)))].join(
		'\n'
	);
}

/** Put a rectangle on the clipboard, both arms. The caller is a `copy` / `cut` handler
 *  over a selection its own surface holds, so the rectangle arrives already cut out and
 *  claiming the event is the caller's. */
export function writeRectangle(
	data: Clipboard,
	block: TableCell[][],
	aligns: TableAlign[],
	owner: Document
): void {
	data.setData(HTML, (tableToDOM(block, aligns, owner) as HTMLElement).outerHTML);
	data.setData(PLAIN, tableToPipe(block, aligns));
}

// ── The paste door ──────────────────────────────────────────────────────────

/** The `<table>` rule: a clipboard table becomes the island the model already holds
 *  rather than the paragraph its text flattens to. `id` is left empty for
 *  {@link stampIslandIds}, a parse rule having no document to mint against. `loss` is
 *  authored: what this reader produces IS a pipe table, so markdown carries it whole. */
function tableParseRule(): ParseRule {
	return {
		tag: 'table',
		node: 'island_block',
		getAttrs: (dom: HTMLElement) => ({
			id: '',
			islandType: 'table',
			props: tableFromDOM(dom),
			loss: 'lossless'
		})
	};
}

/** The clipboard's parser: the schema's own rules with the table rule ahead of them.
 *  Ahead, because a `<table>` otherwise matches nothing and its cells' text falls
 *  through to the enclosing block. */
export function tableClipboardParser(schema: Schema): PMDOMParser {
	return new PMDOMParser(schema, [tableParseRule(), ...PMDOMParser.fromSchema(schema).rules]);
}

/** An island node a parse rule produced, which is the only kind carrying no id. */
const unstamped = (node: PMNode): boolean =>
	(node.type.name === 'island_block' || node.type.name === 'island_inline') && !node.attrs.id;

/** Mint an id for every island a paste is carrying. An id is part of the document's
 *  canonical bytes and the channel that addresses an island (CODEC §Islands), so a
 *  pasted island with none reaches the store as an insert nothing can name afterwards.
 *  One minter for the whole slice, or a paste placing two tables hands them one id. */
export function stampIslandIds(slice: Slice, doc: PMNode): Slice {
	const mint = islandMinter(doc);
	const walk = (fragment: Fragment): Fragment => {
		const out: PMNode[] = [];
		let changed = false;
		fragment.forEach((node) => {
			let next = node;
			if (node.content.size) {
				const inner = walk(node.content);
				if (inner !== node.content) next = node.copy(inner);
			}
			if (unstamped(next)) next = next.type.create({ ...next.attrs, id: mint() }, next.content);
			if (next !== node) changed = true;
			out.push(next);
		});
		return changed ? Fragment.fromArray(out) : fragment;
	};
	const content = walk(slice.content);
	return content === slice.content ? slice : new Slice(content, slice.openStart, slice.openEnd);
}

/**
 * The block leaf's clipboard plugin: the table rule on the way in, and the id mint over
 * what it produced. A `clipboardParser` rather than the schema's own `parseDOM`,
 * because what a `<table>` in the DOM means is a question only the CLIPBOARD asks — the
 * schema's parse rules are also what a re-parse of the editor's own DOM runs through,
 * where an island is already a node and a `<table>` is the chrome drawing one.
 */
export function tableClipboardPlugin(schema: Schema): Plugin {
	const parser = tableClipboardParser(schema);
	return new Plugin({
		props: {
			clipboardParser: parser,
			transformPasted: (slice, view) => stampIslandIds(slice, view.state.doc)
		}
	});
}
