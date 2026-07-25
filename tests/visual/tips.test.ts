// @vitest-environment jsdom
// The tips channel (issue #71): the narrowing that feeds `CardModel.tips`, the
// markdown render the card paints, and the load-bearing one — that clearing the
// channel is a MERGE-write, leaving the `title` sibling in the same `editor`
// namespace intact. That failure is silent and only reachable on a document
// carrying both keys, so it is asserted against a real `Document`, not a stub.
import { describe, it, expect, beforeAll } from 'vitest';
import { init, Quill, Document, MAIN_CARD_ADDR } from '$lib/core';
import { tipsChannel, extWithoutTips, renderTip } from '$lib/visual/tips.js';
import { loadFixtureTree } from '../helpers/fixtures.js';

let quill: Quill;
beforeAll(async () => {
	await init();
	quill = Quill.fromTree(loadFixtureTree());
});

/** The `editor` namespace as the Document holds it. */
function editorExt(doc: Document, addr = MAIN_CARD_ADDR): Record<string, unknown> {
	return (doc.getExtNamespace(addr, 'editor') ?? {}) as Record<string, unknown>;
}
/** The dismissal write, exactly as `VisualEditor.clearTips` performs it. */
function clearTips(doc: Document, addr = MAIN_CARD_ADDR): void {
	doc.storeExtNamespace(addr, 'editor', extWithoutTips(editorExt(doc, addr)));
}
/** Render one tip and read back its HTML. */
function html(markdown: string): string {
	const host = document.createElement('div');
	host.appendChild(renderTip(markdown));
	return host.innerHTML;
}

describe('tipsChannel', () => {
	it('passes a list of non-empty strings through', () => {
		expect(tipsChannel(['one', 'two'])).toEqual(['one', 'two']);
	});

	it('narrows an unusable channel to none', () => {
		// Consumer-authored and unvalidated: anything can arrive here, and every
		// unusable shape has to read as "no tips" rather than as an empty card.
		for (const raw of [undefined, null, 'a string', 42, {}, { 0: 'x' }])
			expect(tipsChannel(raw)).toEqual([]);
	});

	it('drops non-string and blank entries, keeping the rest', () => {
		expect(tipsChannel(['keep', '', '   ', 7, null, 'also'])).toEqual(['keep', 'also']);
	});
});

describe('renderTip', () => {
	it('renders the body mark vocabulary', () => {
		expect(html('Use **bold** here')).toBe('<p>Use <strong>bold</strong> here</p>');
		expect(html('_soft_ hint')).toBe('<p><em>soft</em> hint</p>');
		expect(html('Try `npm run dev`')).toBe('<p>Try <code>npm run dev</code></p>');
		expect(html('See [docs](https://example.com)')).toBe(
			'<p>See <a href="https://example.com">docs</a></p>'
		);
	});

	it('always yields one paragraph, whatever the tip', () => {
		// The inline schema is what pins this: a multi-line or block-shaped tip
		// cannot change the card's structure as the cursor advances.
		expect(html('line one\n\nline two')).toBe('<p>line one line two</p>');
		expect(html('- a\n- b')).toBe('<p>a b</p>');
		expect(html('')).toBe('<p></p>');
	});

	it('does not carry raw HTML through', () => {
		// markdown → Content → typed PM nodes → toDOM: the source never becomes
		// markup, so this is not the injection seam an `{@html}` would be.
		const out = html('<img src=x onerror="alert(1)">');
		expect(out).not.toContain('<img');
		expect(out).not.toContain('onerror');
	});
});

describe('clearing the channel', () => {
	it('leaves a renamed card its title', () => {
		// The hazard `removeExtNamespace` would cause: `tips` and `title` are SIBLING
		// keys of one namespace, so clearing the channel by removing the namespace
		// destroys the rename. Asserted on main and on a card, since both write paths
		// exist.
		const doc = quill.seedDocument();
		const kind = Object.keys(quill.schema.card_kinds ?? {})[0];
		const card = quill.seedCard(kind, doc.seedOverlay(kind));
		if (!card) throw new Error(`the reference quill seeded no \`${kind}\` card`);
		doc.insertCard(card);

		for (const addr of [MAIN_CARD_ADDR, { card: 0 }]) {
			doc.storeExtNamespace(addr, 'editor', { title: 'Renamed', tips: ['a', 'b'] });
			clearTips(doc, addr);
			expect(editorExt(doc, addr)).toEqual({ title: 'Renamed' });
		}
	});

	it('empties the channel the card derive reads', () => {
		const doc = quill.seedDocument();
		doc.storeExtNamespace(MAIN_CARD_ADDR, 'editor', { tips: ['only one'] });
		expect(tipsChannel(editorExt(doc).tips)).toEqual(['only one']);
		clearTips(doc);
		expect(tipsChannel(editorExt(doc).tips)).toEqual([]);
	});

	it('preserves sibling namespaces', () => {
		// `storeExtNamespace` replaces the namespace it targets and only that one —
		// another consumer's `$ext` slot is not collateral.
		const doc = quill.seedDocument();
		doc.storeExtNamespace(MAIN_CARD_ADDR, 'other', { keep: 1 });
		doc.storeExtNamespace(MAIN_CARD_ADDR, 'editor', { tips: ['x'] });
		clearTips(doc);
		expect(doc.main.ext).toEqual({ editor: {}, other: { keep: 1 } });
	});

	it('is idempotent on a document that never had tips', () => {
		const doc = quill.seedDocument();
		clearTips(doc);
		expect(tipsChannel(editorExt(doc).tips)).toEqual([]);
	});
});
