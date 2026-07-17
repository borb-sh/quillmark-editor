// Criteria 3 & 4 — lower∘apply matches the optimistic PM up to normalization, and
// formatting / anchor / unknown marks each survive decode→lower→apply→decode.
// Uses a REAL Document so `applyChange` actually runs. PM transactions are built
// on a DOM-free EditorState (works in node).
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import type { Transaction } from 'prosemirror-state';
import { decode, pmToRichText, lower, blockSchema, structureNeedsInstall } from '$lib/core/codec';
import type { RichText } from '$lib/core';
import { freshDoc, normalize, corpusEqual, md } from './_util.js';

interface AnchorOpts {
	oldAnchors?: { id: string; pos: number }[];
	newAnchors?: { id: string; pos: number }[];
}

/** Install `rt`, build a PM tr, lower+apply, and assert the store matches PM. */
function lowerApply(
	rt: RichText,
	mkTr: (state: EditorState) => Transaction,
	opts: AnchorOpts = {}
) {
	const doc = freshDoc();
	doc.install({}, rt);
	const oldRt = doc.main.body; // normalized starting corpus
	const state = EditorState.create({ doc: decode(oldRt, blockSchema) });
	const tr = mkTr(state);
	const newDoc = tr.doc;
	const bundle = lower(oldRt, newDoc, opts);
	doc.applyChange({}, bundle);
	const stored = doc.main.body;
	expect(corpusEqual(stored, normalize(pmToRichText(newDoc))), 'stored matches optimistic PM').toBe(
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
	const unknownRt: RichText = {
		text: 'abcdef ghi',
		lines: [{ containers: [], kind: 'para' }],
		marks: [{ start: 0, end: 6, type: 'sub', attrs: { x: 1 } } as never],
		islands: []
	};
	it('survives decode → pmToRichText verbatim', () => {
		const back = pmToRichText(decode(unknownRt, blockSchema));
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
	const anchorRt: RichText = {
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
		const bundle = lower(oldRt, tr.doc, {
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
		const bundle = lower(oldRt, newDoc, {
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
		const bundle = lower(oldRt, newDoc, { oldAnchors: [{ id: 'a1', pos: 6 }], newAnchors: [] });
		doc.applyChange({}, bundle);
		expect(doc.main.body.marks.some((m) => m.type === 'anchor')).toBe(false);
	});
});

describe('structureNeedsInstall — the continues-line boundary gap gate', () => {
	const oneLine: RichText = {
		text: 'one two',
		lines: [{ containers: [], kind: 'para' }],
		marks: [],
		islands: []
	};
	it('flags a new hard-break (continues) line as un-lowerable', () => {
		const withBreak: RichText = {
			text: 'one\ntwo',
			lines: [
				{ containers: [], kind: 'para' },
				{ containers: [], continues: true, kind: 'para' }
			],
			marks: [],
			islands: []
		};
		expect(structureNeedsInstall(oneLine, withBreak)).toBe(true);
	});
	it('does NOT flag an ordinary block split (both continues:false)', () => {
		const split: RichText = {
			text: 'one\ntwo',
			lines: [
				{ containers: [], kind: 'para' },
				{ containers: [], kind: 'para' }
			],
			marks: [],
			islands: []
		};
		expect(structureNeedsInstall(oneLine, split)).toBe(false);
	});
	it('does NOT flag a text edit inside an existing code block (continues preserved)', () => {
		const code2 = md('```\na\nb\n```'); // 2 code lines, 2nd continues
		const edited = { ...code2, text: code2.text.replace('a', 'aa') };
		expect(structureNeedsInstall(code2, edited)).toBe(false);
	});
	it('flags a break↔split swap at UNCHANGED text (no delta, flags flipped)', () => {
		// A hard break replaced by a real paragraph split: net text identical, so
		// the count heuristic alone would take the op path — but `applyChange`
		// has no continues op in either direction, so the store would keep the
		// break while PM shows a split, forever.
		const withBreak = md('one\\\ntwo'); // para + continues line
		const split: RichText = {
			...withBreak,
			lines: withBreak.lines.map((l) => ({ containers: l.containers, kind: 'para' }) as never)
		};
		expect(structureNeedsInstall(withBreak, split)).toBe(true);
		expect(structureNeedsInstall(split, withBreak)).toBe(true);
	});
	it('flags a MOVED continues line at equal counts', () => {
		const mk = (flags: boolean[], text: string): RichText => ({
			text,
			lines: flags.map(
				(c) => ({ containers: [], kind: 'para', ...(c ? { continues: true } : {}) }) as never
			),
			marks: [],
			islands: []
		});
		// [F,T,F] -> [F,F,T] with a text edit elsewhere: same count, wrong shape.
		expect(
			structureNeedsInstall(
				mk([false, true, false], 'a\nb\nc'),
				mk([false, false, true], 'a\nb\ncX')
			)
		).toBe(true);
	});
	it('does NOT flag an edit that merely shifts an existing continues line', () => {
		const withBreak = md('one\\\ntwo');
		// Insert text before the break: the boundary survives, flags unchanged.
		const edited = { ...withBreak, text: 'X' + withBreak.text };
		expect(structureNeedsInstall(withBreak, edited)).toBe(false);
	});
	it('does NOT flag deleting the hard break (join — the flag vanishes with its \\n)', () => {
		const withBreak = md('one\\\ntwo');
		const joined = md('onetwo');
		expect(structureNeedsInstall(withBreak, joined)).toBe(false);
	});
	it('flags a NEW code-internal line (inserted \\n must be a real line, corpus says continues)', () => {
		const code1 = md('```\nab\n```');
		const code2: RichText = {
			text: code1.text.replace('ab', 'a\nb'),
			lines: [...code1.lines, { containers: [], continues: true, kind: 'code' } as never],
			marks: [],
			islands: []
		};
		expect(structureNeedsInstall(code1, code2)).toBe(true);
	});
	it('flags a delta whose insert carries an island slot (IslandSlotInInsert at the boundary)', () => {
		const island = '\uFFFC';
		const mkIsland = (text: string): RichText => ({
			text,
			lines: [{ containers: [], kind: 'para' }],
			marks: [],
			islands: [{ id: 'i1', type: 'image', props: {} } as never]
		});
		// One splice spanning the slot re-inserts it: X at 1 and Y at 14 collapse
		// to a single delta whose insert contains U+FFFC.
		const oldRt = mkIsland(`before ${island} after`);
		const newRt = mkIsland(`bXefore ${island} afteYr`);
		expect(structureNeedsInstall(oldRt, newRt)).toBe(true);
		// Island CREATION (paste containing an image) likewise inserts a slot.
		const plain = md('before  after');
		const withIsland = mkIsland(`before ${island} after`);
		expect(structureNeedsInstall(plain, withIsland)).toBe(true);
	});
});
