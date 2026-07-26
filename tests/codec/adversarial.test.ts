// Independent adversarial validation of the codec (NOT the implementing agent's
// tests). Targets exactly the seams CODEC.md flags as highest-risk: USV↔UTF-16
// drift in the text delta (an astral char is 1 USV but 2 UTF-16 units), and the
// position-map inverse. Everything routes through a REAL Document's applyChange,
// so a miscounted offset surfaces as wrong stored text, not just a unit-test
// artifact.
import { describe, it, expect } from 'vitest';
import { Document } from '$lib/core';
import type { Content, ContentMark } from '$lib/core';
import {
	decode,
	blockSchema,
	buildLineIndex,
	usvToPM,
	pmToUsv,
	lower,
	usvLength
} from '$lib/core/codec';

function rt(text: string, marks: ContentMark[] = [], lines?: Content['lines']): Content {
	return {
		text,
		lines: lines ?? [{ containers: [], kind: 'para' }],
		marks,
		islands: []
	};
}

describe('codec adversarial — position map (independent)', () => {
	it('round-trips at EVERY USV offset across astral/CJK/combining and block boundaries', () => {
		const samples: Content[] = [
			rt('a😀b'), // astral (emoji: 1 USV, 2 UTF-16)
			rt('café ☕ x'), // combining-ish + BMP symbol
			rt('日本語テスト'), // CJK
			rt('👨‍👩‍👧 zwj family'), // ZWJ sequence (multiple code points)
			{
				text: 'first 😀 line\nsecond 日 line',
				lines: [
					{ containers: [], kind: 'para' },
					{ containers: [], kind: 'para' }
				],
				marks: [],
				islands: []
			}
		];
		for (const r of samples) {
			const doc = decode(r, blockSchema);
			const idx = buildLineIndex(doc);
			const n = usvLength(r.text);
			for (let pos = 0; pos <= n; pos++) {
				const pm = usvToPM(idx, pos);
				const back = pmToUsv(idx, pm);
				expect(back, `USV ${pos} in ${JSON.stringify(r.text)}`).toBe(pos);
			}
		}
	});
});

describe('codec adversarial — lower∘apply through a real Document (independent)', () => {
	it('text delta counts USV code points, so an insert after an astral char lands correctly', () => {
		const doc = new Document('usaf_memo@0.2.0');
		doc.install({}, rt('a😀b')); // 3 USV, 4 UTF-16
		const oldRt = doc.main.body;

		const bundle = lower(oldRt, rt('a😀Xb')); // insert 'X' at USV index 2
		// The delta must be USV-coordinate: retain 2 ('a' + the emoji as ONE unit),
		// not retain 3 (its UTF-16 width) — the exact drift CODEC.md warns about.
		expect(bundle.delta?.ops).toEqual([{ retain: 2 }, { insert: 'X' }, { retain: 1 }]);

		doc.applyChange({}, bundle);
		expect(doc.main.body.text).toBe('a😀Xb');
	});

	it('a delete spanning an astral char removes the right code points', () => {
		const doc = new Document('usaf_memo@0.2.0');
		doc.install({}, rt('x😀😀y'));
		const bundle = lower(doc.main.body, rt('xy')); // drop both emoji
		doc.applyChange({}, bundle);
		expect(doc.main.body.text).toBe('xy');
	});

	it('a formatting mark added after an astral char lowers to the right USV range', () => {
		const doc = new Document('usaf_memo@0.2.0');
		doc.install({}, rt('a😀bold')); // USV: a=0, 😀=1, b=2,o=3,l=4,d=5
		const withMark = rt('a😀bold', [{ start: 2, end: 6, type: 'strong' } as ContentMark]);
		const bundle = lower(doc.main.body, withMark);
		doc.applyChange({}, bundle);
		const marks = doc.main.body.marks;
		const strong = marks.find((m) => m.type === 'strong');
		expect(strong, 'strong mark present').toBeTruthy();
		// 'bold' is USV [2,6) even though the emoji is 2 UTF-16 units before it.
		expect([strong!.start, strong!.end]).toEqual([2, 6]);
	});

	it('a paragraph split (new \\n via delta) applies without an install fallback', () => {
		const doc = new Document('usaf_memo@0.2.0');
		doc.install({}, rt('one two'));
		// Split into two paragraphs at the space → "one\ntwo", two para lines.
		const split: Content = {
			text: 'one\ntwo',
			lines: [
				{ containers: [], kind: 'para' },
				{ containers: [], kind: 'para' }
			],
			marks: [],
			islands: []
		};
		const bundle = lower(doc.main.body, split);
		doc.applyChange({}, bundle);
		expect(doc.main.body.text).toBe('one\ntwo');
		expect(doc.main.body.lines.length).toBe(2);
		expect(doc.main.body.lines.every((l) => !l.continues)).toBe(true);
	});
});
