// Independent adversarial validation of the codec (NOT the implementing agent's
// tests). Targets the seam CODEC.md flags as highest-risk: USV↔UTF-16 drift (an
// astral char is 1 USV but 2 UTF-16 units) surviving a REAL Document's
// applyChange; so a miscounted offset surfaces as wrong STORED text, not just a
// unit-test artifact. That end-to-end route is what these add; the position map's
// own inverse is positions.test.ts, over a strictly wider corpus.
import { describe, it, expect } from 'vitest';
import { Document, type Content, type ContentMark } from '@quillmark/wasm';
import { contentEdit, lower } from '$lib/core/codec';

function rt(text: string, marks: ContentMark[] = [], lines?: Content['lines']): Content {
	return {
		text,
		lines: lines ?? [{ containers: [], kind: 'para' }],
		marks,
		islands: []
	};
}

describe('codec adversarial — lower∘apply through a real Document (independent)', () => {
	it('text delta counts USV code points, so an insert after an astral char lands correctly', () => {
		const doc = new Document('usaf_memo@0.2.0');
		doc.overwrite({}, rt('a😀b')); // 3 USV, 4 UTF-16
		const oldRt = doc.main.body;

		const bundle = lower(contentEdit(oldRt, rt('a😀Xb'))); // insert 'X' at USV index 2
		// The delta must be USV-coordinate: retain 2 ('a' + the emoji as ONE unit),
		// not retain 3 (its UTF-16 width): the exact drift CODEC.md warns about.
		expect(bundle.delta?.ops).toEqual([{ retain: 2 }, { insert: 'X' }, { retain: 1 }]);

		doc.applyChange({}, bundle);
		expect(doc.main.body.text).toBe('a😀Xb');
	});

	it('a delete spanning an astral char removes the right code points', () => {
		const doc = new Document('usaf_memo@0.2.0');
		doc.overwrite({}, rt('x😀😀y'));
		const bundle = lower(contentEdit(doc.main.body, rt('xy'))); // drop both emoji
		doc.applyChange({}, bundle);
		expect(doc.main.body.text).toBe('xy');
	});

	it('a formatting mark added after an astral char lowers to the right USV range', () => {
		const doc = new Document('usaf_memo@0.2.0');
		doc.overwrite({}, rt('a😀bold')); // USV: a=0, 😀=1, b=2,o=3,l=4,d=5
		const withMark = rt('a😀bold', [{ start: 2, end: 6, type: 'strong' } as ContentMark]);
		const bundle = lower(contentEdit(doc.main.body, withMark));
		doc.applyChange({}, bundle);
		const marks = doc.main.body.marks;
		const strong = marks.find((m) => m.type === 'strong');
		expect(strong, 'strong mark present').toBeTruthy();
		// 'bold' is USV [2,6) even though the emoji is 2 UTF-16 units before it.
		expect([strong!.start, strong!.end]).toEqual([2, 6]);
	});

	it('a paragraph split (new \\n via delta) applies without an install fallback', () => {
		const doc = new Document('usaf_memo@0.2.0');
		doc.overwrite({}, rt('one two'));
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
		const bundle = lower(contentEdit(doc.main.body, split));
		doc.applyChange({}, bundle);
		expect(doc.main.body.text).toBe('one\ntwo');
		expect(doc.main.body.lines.length).toBe(2);
		expect(doc.main.body.lines.every((l) => !l.continues)).toBe(true);
	});
});
