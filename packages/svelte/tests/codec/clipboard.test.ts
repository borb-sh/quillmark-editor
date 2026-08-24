// @vitest-environment jsdom
// The DOM rung. A copy and a paste inside one body run the document through the
// schema's own `toDOM`/`parseDOM` pair and nothing else (CODEC §"Markdown at the
// edges"), so what crosses is asserted through that pair rather than read off a spec:
// an attribute a node writes and does not read back is a value an ordinary copy
// destroys, the open sets' carriers included, whose whole job is surviving everything
// but an explicit conversion.
import { describe, it, expect } from 'vitest';
import {
	DOMParser,
	DOMSerializer,
	Slice,
	type Attrs,
	type Node as PMNode
} from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { blockSchema as S, pmToContent, proseLeafPlugins } from '$lib/core/codec';
import { mount } from './_util.js';

// The clipboard's own two halves, as PM registers them by default.
function serialize(doc: PMNode): string {
	const el = document.createElement('div');
	el.appendChild(DOMSerializer.fromSchema(S).serializeFragment(doc.content));
	return el.innerHTML;
}
function parse(html: string): PMNode {
	const el = document.createElement('div');
	el.innerHTML = html;
	return DOMParser.fromSchema(S).parse(el, { preserveWhitespace: 'full' });
}

const doc = (...blocks: PMNode[]): PMNode => S.nodes.doc.create(null, blocks);
const para = (...inline: PMNode[]): PMNode => S.nodes.paragraph.create(null, inline);
const table = (attrs: Attrs): PMNode => S.nodes.island_block.create(attrs);
const TABLE: Attrs = {
	id: 'isl-0',
	islandType: 'table',
	props: { header: ['h'], rows: [['a']] },
	loss: 'lossless'
};

/** A block leaf's plugin stack over `over`, mounted: where a paste lands. */
function leaf(over: PMNode): EditorView {
	const state = EditorState.create({ doc: over, plugins: proseLeafPlugins(S, { inline: false }) });
	return new EditorView(mount(), { state });
}

/** The slice `html` pastes into `view` as, the leaf's own transform pass included. */
function pasted(view: EditorView, html: string): PMNode {
	let slice = new Slice(parse(html).content, 0, 0);
	view.someProp('transformPasted', (f) => {
		slice = f(slice, view, false);
	});
	return doc(...slice.content.content);
}

// Every node and mark the block schema holds that carries something a tag alone does
// not: the attribute set is the assertion, so a node gaining one fails here until it
// crosses too.
describe('a copy and a paste carry the whole node', () => {
	const shapes: [string, PMNode][] = [
		['a fence with a language', doc(S.nodes.code_block.create({ lang: 'py' }, S.text('print(1)')))],
		[
			'an ordered list that starts past one',
			doc(
				S.nodes.ordered_list.create({ start: 7 }, [
					S.nodes.list_item.create(null, para(S.text('a')))
				])
			)
		],
		[
			'a line kind this build does not know',
			doc(S.nodes.paragraph.create({ unknown: { kind: 'footnote', attrs: { n: 1 } } }, S.text('a')))
		],
		[
			'a container this build does not know',
			doc(
				S.nodes.unknown_container.create({ container: 'aside', attrs: { role: 'note' } }, [
					para(S.text('a'))
				])
			)
		],
		[
			'a mark this build does not know',
			doc(para(S.text('a', [S.marks.unknown.create({ type: 'kbd', attrs: { k: 1 } })])))
		],
		['a table island', doc(table(TABLE))],
		[
			'an image island mid-paragraph',
			doc(
				para(
					S.text('before '),
					S.nodes.island_inline.create({
						id: 'isl-1',
						islandType: 'image',
						props: { src: 'a.png' },
						loss: 'lossless'
					}),
					S.text(' after')
				)
			)
		],
		[
			'a heading and a link, which already crossed',
			doc(
				S.nodes.heading.create({ level: 3 }, S.text('h')),
				para(S.text('a', [S.marks.link.create({ href: 'https://x.test' })]))
			)
		]
	];

	for (const [name, before] of shapes) {
		it(name, () => {
			const after = parse(serialize(before));
			expect(after.toJSON()).toEqual(before.toJSON());
		});
	}

	// The rung the round-trip is for: what the leaf would store after the paste.
	it('and the fence still spells its language in the content', () => {
		const back = parse(serialize(doc(S.nodes.code_block.create({ lang: 'py' }, S.text('x')))));
		expect(pmToContent(back).lines[0]).toMatchObject({ kind: 'code', lang: 'py' });
	});

	// Through PM's own copy path rather than the serializer alone: the props a table
	// carries are the table, and a `[table]` label is what is left without them.
	it('through the clipboard a view writes', () => {
		const view = leaf(doc(table(TABLE), para()));
		const copied = view.state.doc.slice(0, view.state.doc.child(0).nodeSize);
		const { dom } = view.serializeForClipboard(copied);
		expect(parse((dom as HTMLElement).innerHTML).child(0).attrs.props).toEqual(TABLE.props);
		view.destroy();
	});
});

// The parse rules read this package's own `data-*` names, which nothing on the web
// spells, so the foreign door is where a rule deliberately widens it and nowhere else.
describe('what a paste from outside the editor states', () => {
	it.each([
		[
			'language- on the code, which every highlighter emits',
			'<pre><code class="language-rust">fn main() {}</code></pre>'
		],
		['lang- on the pre', '<pre class="lang-rust"><code>fn main() {}</code></pre>']
	])('a fence carrying its language: %s', (_name, html) => {
		expect(parse(html).child(0).attrs.lang).toBe('rust');
	});

	it('a fence stating none carries none', () => {
		expect(parse('<pre><code>plain</code></pre>').child(0).attrs.lang).toBe(null);
	});

	it('an ordered list carrying its start', () => {
		expect(parse('<ol start="5"><li>a</li></ol>').child(0).attrs.start).toBe(5);
	});

	// The absence `toDOM` writes for the common case, which is not a zero.
	it('an ordered list stating none starts at one', () => {
		expect(parse('<ol><li>a</li></ol>').child(0).attrs.start).toBe(1);
	});

	// The door that stays shut: a table is markup no `data-island` names, so it
	// flattens to its cells' text exactly as it did.
	it('a table flattens to its cells, minting no island', () => {
		expect(parse('<table><tr><td>a</td><td>b</td></tr></table>').toString()).toBe(
			'doc(paragraph("ab"))'
		);
	});
});

// An island id is an identity in the content and unique across the field, so the one
// thing a paste must not carry verbatim is an id the field already holds.
describe('the paste pass re-mints a colliding island id', () => {
	it('a copy lands beside the original under a fresh id, props intact', () => {
		const view = leaf(doc(table(TABLE), para()));
		const landed = pasted(view, serialize(doc(table(TABLE)))).child(0);
		expect(landed.attrs.id).not.toBe(TABLE.id);
		expect(landed.attrs.props).toEqual(TABLE.props);
		view.destroy();
	});

	it('a cut and pasted back keeps the identity it had', () => {
		const view = leaf(doc(para(S.text('a'))));
		expect(pasted(view, serialize(doc(table(TABLE)))).child(0).attrs.id).toBe(TABLE.id);
		view.destroy();
	});

	it('two of one id inside a single slice come apart', () => {
		const view = leaf(doc(para()));
		const landed = pasted(view, serialize(doc(table(TABLE), table(TABLE))));
		expect(landed.child(0).attrs.id).not.toBe(landed.child(1).attrs.id);
		view.destroy();
	});

	it('a slice with no island is the slice it arrived as', () => {
		const view = leaf(doc(para(S.text('a'))));
		expect(pasted(view, '<p>b</p>').toString()).toBe('doc(paragraph("b"))');
		view.destroy();
	});
});

// A field's own selection is where the copy starts, so the pair is asserted once over
// a caret rather than over a constructed slice.
describe('a body copies from where the caret is', () => {
	it('a fence selected in the body keeps its language through the pair', () => {
		const before = doc(para(S.text('a')), S.nodes.code_block.create({ lang: 'sh' }, S.text('ls')));
		const view = leaf(before);
		const at = before.child(0).nodeSize;
		view.dispatch(
			view.state.tr.setSelection(
				TextSelection.create(before, at + 1, at + before.child(1).nodeSize - 1)
			)
		);
		const { dom } = view.serializeForClipboard(view.state.selection.content());
		expect(parse((dom as HTMLElement).innerHTML).child(0).attrs.lang).toBe('sh');
		view.destroy();
	});
});
