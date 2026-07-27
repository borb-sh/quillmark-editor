// Criteria 3 & 4 — lower∘apply matches the optimistic PM up to normalization, and
// formatting / anchor / unknown marks each survive decode→lower→apply→decode.
// Uses a REAL Document so `applyChange` actually runs. PM transactions are built
// on a DOM-free EditorState (works in node).
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import {
	decode,
	pmToContent,
	lower,
	blockSchema,
	insertReintroducesIslandSlot
} from '$lib/core/codec';
import type { Content } from '$lib/core';
import { freshDoc, normalize, contentEqual, md } from './_util.js';

interface AnchorOpts {
	oldAnchors?: { id: string; pos: number }[];
	newAnchors?: { id: string; pos: number }[];
}

/** Install `rt`, build a PM tr, lower+apply, and assert the store matches PM. */
function lowerApply(rt: Content, mkTr: (state: EditorState) => Transaction, opts: AnchorOpts = {}) {
	const doc = freshDoc();
	doc.install({}, rt);
	const oldRt = doc.main.body; // normalized starting content
	const state = EditorState.create({ doc: decode(oldRt, blockSchema) });
	const tr = mkTr(state);
	const newDoc = tr.doc;
	const bundle = lower(oldRt, pmToContent(newDoc), opts);
	doc.applyChange({}, bundle);
	const stored = doc.main.body;
	expect(contentEqual(stored, normalize(pmToContent(newDoc))), 'stored matches optimistic PM').toBe(
		true
	);
	return { doc, stored, bundle, newDoc };
}

describe('lower ∘ apply matches PM', () => {
	it('text insert', () => {
		lowerApply(md('hello world'), (s) => s.tr.insertText('X', 4));
	});
	it('text delete', () => {
		lowerApply(md('hello world'), (s) => s.tr.delete(2, 5));
	});
	it('text insert with an astral char', () => {
		lowerApply(md('hello world'), (s) => s.tr.insertText('😀', 6));
	});
	it('Enter — split a paragraph', () => {
		const { stored } = lowerApply(md('one two three'), (s) => s.tr.split(5));
		expect(stored.lines).toHaveLength(2);
	});
	it('joining Backspace — merge two paragraphs', () => {
		const { stored } = lowerApply(md('first\n\nsecond'), (s) => {
			// Delete the block boundary between the two paragraphs.
			const boundary = s.doc.child(0).nodeSize; // pos at end of para0 / before para1
			return s.tr.delete(boundary - 1, boundary + 1);
		});
		expect(stored.lines).toHaveLength(1);
	});
	it('heading toggle via setBlockType', () => {
		const { stored } = lowerApply(md('a title line'), (s) =>
			s.tr.setBlockType(0, s.doc.content.size, blockSchema.nodes.heading, { level: 2 })
		);
		expect(stored.lines[0].kind).toBe('heading');
	});
	it('multi-op: insert then delete elsewhere', () => {
		lowerApply(md('alpha beta gamma'), (s) => s.tr.insertText('ZZ', 6).delete(0, 2));
	});
	it('Shift+Enter — a hard break lowers via setContinues (op path, not install)', () => {
		const { stored, bundle } = lowerApply(md('one two'), (s) =>
			s.tr.insert(4, blockSchema.nodes.hard_break.create())
		);
		expect(stored.lines).toHaveLength(2);
		expect(!!stored.lines[1].continues).toBe(true);
		expect(bundle.lineOps?.some((op) => op.op === 'setContinues')).toBe(true);
	});
	it('Enter inside a code block — a code-interior line lowers via setContinues', () => {
		const { stored, bundle } = lowerApply(md('```\nab\n```'), (s) => s.tr.insertText('\n', 2));
		expect(stored.lines).toHaveLength(2);
		expect(!!stored.lines[1].continues).toBe(true);
		expect(stored.lines[1].kind).toBe('code');
		expect(bundle.lineOps?.some((op) => op.op === 'setContinues')).toBe(true);
	});
});

describe('formatting marks round-trip', () => {
	it('addMark strong', () => {
		const { stored } = lowerApply(md('make this bold'), (s) =>
			s.tr.addMark(5, 9, blockSchema.marks.strong.create())
		);
		expect(stored.marks.some((m) => m.type === 'strong')).toBe(true);
	});
	it('removeMark strong', () => {
		const { stored } = lowerApply(md('**all bold** here'), (s) =>
			s.tr.removeMark(1, 5, blockSchema.marks.strong)
		);
		// The removed sub-range is no longer fully covered.
		const strong = stored.marks.filter((m) => m.type === 'strong');
		expect(strong.every((m) => m.start >= 4)).toBe(true);
	});
	it('link add carries href → url', () => {
		const { stored } = lowerApply(md('go to site'), (s) =>
			s.tr.addMark(6, 10, blockSchema.marks.link.create({ href: 'http://x' }))
		);
		const link = stored.marks.find((m) => m.type === 'link') as { url: string } | undefined;
		expect(link?.url).toBe('http://x');
	});
});

describe('unknown mark round-trip (verbatim)', () => {
	const unknownRt: Content = {
		text: 'abcdef ghi',
		lines: [{ containers: [], kind: 'para' }],
		marks: [{ start: 0, end: 6, type: 'sub', attrs: { x: 1 } } as never],
		islands: []
	};
	it('survives decode → pmToContent verbatim', () => {
		const back = pmToContent(decode(unknownRt, blockSchema));
		const u = back.marks.find((m) => m.type === 'sub') as { attrs: unknown } | undefined;
		expect(u).toBeTruthy();
		expect(u!.attrs).toEqual({ x: 1 });
	});
	it('survives decode → lower(edit) → apply → decode', () => {
		const { stored } = lowerApply(unknownRt, (s) => s.tr.insertText('Z', 8));
		const u = stored.marks.find((m) => m.type === 'sub') as { attrs: unknown } | undefined;
		expect(u).toBeTruthy();
		expect(u!.attrs).toEqual({ x: 1 });
	});
});

describe('identity anchor round-trip (op-based, survives edits)', () => {
	const anchorRt: Content = {
		text: 'hello world',
		lines: [{ containers: [], kind: 'para' }],
		marks: [{ start: 6, end: 6, type: 'anchor', id: 'a1' } as never],
		islands: []
	};

	it('an anchor survives an edit before it (auto-rebase, no op needed)', () => {
		const doc = freshDoc();
		doc.install({}, anchorRt);
		const oldRt = doc.main.body;
		const state = EditorState.create({ doc: decode(oldRt, blockSchema) });
		const tr = state.tr.insertText('XX', 1); // insert before the anchor at USV 6
		const bundle = lower(oldRt, pmToContent(tr.doc), {
			oldAnchors: [{ id: 'a1', pos: 6 }],
			newAnchors: [{ id: 'a1', pos: 8 }] // rebased +2
		});
		doc.applyChange({}, bundle);
		const anchor = doc.main.body.marks.find((m) => m.type === 'anchor') as
			{ id: string; start: number } | undefined;
		expect(anchor?.id).toBe('a1');
		expect(anchor?.start).toBe(8);
	});

	it('adding a new anchor emits an add op', () => {
		const doc = freshDoc();
		doc.install({}, md('plain text'));
		const oldRt = doc.main.body;
		const newDoc = decode(oldRt, blockSchema);
		const bundle = lower(oldRt, pmToContent(newDoc), {
			oldAnchors: [],
			newAnchors: [{ id: 'new1', pos: 3 }]
		});
		doc.applyChange({}, bundle);
		const anchor = doc.main.body.marks.find((m) => m.type === 'anchor') as
			{ id: string } | undefined;
		expect(anchor?.id).toBe('new1');
	});

	it('removing an anchor emits removeAnchor', () => {
		const doc = freshDoc();
		doc.install({}, anchorRt);
		const oldRt = doc.main.body;
		const newDoc = decode(oldRt, blockSchema);
		const bundle = lower(oldRt, pmToContent(newDoc), {
			oldAnchors: [{ id: 'a1', pos: 6 }],
			newAnchors: []
		});
		doc.applyChange({}, bundle);
		expect(doc.main.body.marks.some((m) => m.type === 'anchor')).toBe(false);
	});

	it('an anchor survives a code-block-interior edit (the payoff: op path, not install)', () => {
		// Adding an interior line to a code block lowers via `setContinues`, not
		// `install`, so this field's anchor rebases through the splice instead of
		// being dropped.
		const doc = freshDoc();
		const codeRt: Content = {
			text: 'abc',
			lines: [{ containers: [], kind: 'code' }],
			marks: [{ start: 3, end: 3, type: 'anchor', id: 'c1' } as never],
			islands: []
		};
		doc.install({}, codeRt);
		const oldRt = doc.main.body;
		const state = EditorState.create({ doc: decode(oldRt, blockSchema) });
		const tr = state.tr.insertText('\n', 2); // a code-interior line before the anchor
		const newRt = pmToContent(tr.doc);
		expect(insertReintroducesIslandSlot(oldRt, newRt)).toBe(false); // the op path, not install
		const bundle = lower(oldRt, pmToContent(tr.doc), {
			oldAnchors: [{ id: 'c1', pos: 3 }],
			newAnchors: [{ id: 'c1', pos: 4 }] // the \n inserts before it → +1
		});
		doc.applyChange({}, bundle);
		const body = doc.main.body;
		expect(body.lines).toHaveLength(2);
		expect(!!body.lines[1].continues).toBe(true);
		const anchor = body.marks.find((m) => m.type === 'anchor') as { id: string } | undefined;
		expect(anchor?.id).toBe('c1');
	});
});

describe('insertReintroducesIslandSlot — the one op-unreachable edit', () => {
	const island = '￼';
	const mkIsland = (text: string): Content => ({
		text,
		lines: [{ containers: [], kind: 'para' }],
		marks: [],
		islands: [{ id: 'i1', type: 'image', props: {} } as never]
	});

	it('flags a splice whose insert re-carries an island slot (IslandSlotInInsert)', () => {
		// Two edits (X after `b`, Y before `r`) collapse to one splice spanning the
		// slot, so its insert contains U+FFFC — `applyChange` would throw.
		const oldRt = mkIsland(`before ${island} after`);
		const newRt = mkIsland(`bXefore ${island} afteYr`);
		expect(insertReintroducesIslandSlot(oldRt, newRt)).toBe(true);
	});
	it('flags island creation (a paste inserting a fresh slot)', () => {
		const plain = md('before  after');
		const withIsland = mkIsland(`before ${island} after`);
		expect(insertReintroducesIslandSlot(plain, withIsland)).toBe(true);
	});
	it('does NOT flag an edit around an existing island (the slot is retained, not re-inserted)', () => {
		const oldRt = mkIsland(`before ${island} after`);
		const newRt = mkIsland(`before ${island} afterX`);
		expect(insertReintroducesIslandSlot(oldRt, newRt)).toBe(false);
	});
	it('does NOT flag a new hard break or code-interior line (they lower via setContinues)', () => {
		const oneLine = md('one two');
		const withBreak: Content = {
			text: 'one\ntwo',
			lines: [
				{ containers: [], kind: 'para' },
				{ containers: [], continues: true, kind: 'para' }
			],
			marks: [],
			islands: []
		};
		expect(insertReintroducesIslandSlot(oneLine, withBreak)).toBe(false);

		const code1 = md('```\nab\n```');
		const code2: Content = {
			text: code1.text.replace('ab', 'a\nb'),
			lines: [...code1.lines, { containers: [], continues: true, kind: 'code' } as never],
			marks: [],
			islands: []
		};
		expect(insertReintroducesIslandSlot(code1, code2)).toBe(false);
	});
});
