// Decode: idempotence up to normalization, overlapping-mark inline splits, island
// round-trip, and the inline/plaintext constraints.
import { describe, it, expect } from 'vitest';
import { decode, pmToContent, blockSchema, inlineSchema } from '$lib/core/codec';
import type { Content } from '@quillmark/wasm';
import { md, normalize, contentEqual, subjectContent, bodyContent } from './_util.js';

/** decode → pmToContent, both sides normalized through the real content. */
function reContent(rt: Content): Content {
	return normalize(pmToContent(decode(rt, blockSchema)));
}

describe('decode idempotence (up to normalization)', () => {
	const cases: Record<string, Content> = {
		twoParas: md('First para.\n\nSecond para.'),
		heading: md('# Title\n\nBody text with a tail.'),
		bulletList: md('- one\n- two\n- three'),
		nestedList: md('- outer\n    - inner1\n    - inner2'),
		orderedList: md('1. first\n2. second\n3. third'),
		blockquote: md('> quoted line\n\nafter the quote'),
		nestedQuoteList: md('> - quoted bullet'),
		codeFence: md('```js\nconst x = 1;\nconst y = 2;\n```'),
		hardBreak: md('line one\\\nline two'),
		marks: md('normal **bold** *italic* `code` [link](http://x)'),
		overlap: md('**bold _both_ italic**'),
		strike: md('~~struck~~ and plain'),
		underline: md('<u>underlined</u> text'),
		astral: md('emoji 😀 and 漢字 **bold 🎉**'),
		realSubject: subjectContent(),
		realBody: bodyContent()
	};
	for (const [name, rt] of Object.entries(cases)) {
		it(name, () => {
			expect(contentEqual(reContent(rt), normalize(rt)), name).toBe(true);
		});
	}
});

describe('overlapping formatting → correct inline node splits', () => {
	it('strong[0,4)+emph[2,6) yields {strong},{strong,emph},{emph}', () => {
		const rt: Content = {
			text: 'abcdef',
			lines: [{ containers: [], kind: 'para' }],
			marks: [
				{ start: 0, end: 4, type: 'strong' },
				{ start: 2, end: 6, type: 'emph' }
			],
			islands: []
		};
		const para = decode(rt, blockSchema).child(0);
		const runs = para.children.map((n) => ({
			text: n.text,
			marks: n.marks.map((m) => m.type.name).sort()
		}));
		expect(runs).toEqual([
			{ text: 'ab', marks: ['strong'] },
			{ text: 'cd', marks: ['em', 'strong'] },
			{ text: 'ef', marks: ['em'] }
		]);
	});
});

describe('island round-trip (id preserved)', () => {
	it('image (inline island) survives decode → pmToContent → normalize', () => {
		const rt = md('![alt text](img.png)');
		expect(rt.islands[0].type).toBe('image');
		const back = pmToContent(decode(rt, blockSchema));
		expect(back.islands).toHaveLength(1);
		expect(back.islands[0].type).toBe('image');
		expect(back.islands[0].id).toBe(rt.islands[0].id);
		expect(back.text).toContain('￼');
		expect(contentEqual(normalize(back), normalize(rt))).toBe(true);
	});

	it('table (block island) survives with id preserved', () => {
		const rt = md('| a | b |\n|---|---|\n| 1 | 2 |');
		expect(rt.islands[0].type).toBe('table');
		const decoded = decode(rt, blockSchema);
		expect(decoded.child(0).type.name).toBe('island_block');
		const back = pmToContent(decoded);
		expect(back.islands[0].type).toBe('table');
		expect(back.islands[0].id).toBe(rt.islands[0].id);
		expect(contentEqual(normalize(back), normalize(rt))).toBe(true);
	});
});

describe('inline / plaintext constraints', () => {
	it('inline schema decodes to exactly one paragraph', () => {
		const doc = decode(md('a\n\nb\n\nc'), inlineSchema);
		expect(doc.childCount).toBe(1);
		expect(doc.child(0).type.name).toBe('paragraph');
	});

	it('inline keeps marks', () => {
		const doc = decode(md('plain **bold** end'), inlineSchema);
		const hasStrong = doc
			.child(0)
			.children.some((n) => n.marks.some((m) => m.type.name === 'strong'));
		expect(hasStrong).toBe(true);
	});

	it('plaintext strips marks', () => {
		const doc = decode(md('plain **bold** *em*'), inlineSchema, { plaintext: true });
		const anyMark = doc.child(0).children.some((n) => n.marks.length > 0);
		expect(anyMark).toBe(false);
		expect(doc.child(0).textContent).toBe('plain bold em');
	});
});

describe('adjacent sibling lists (ordinal reset)', () => {
	const item = (ordinal: number) =>
		({ container: 'list_item', ordered: false, start: 1, ordinal }) as never;
	// Two adjacent bullet lists: ordinals [0,1] then a reset to [0].
	const twoLists: Content = {
		text: 'a\nb\nc',
		lines: [
			{ containers: [item(0)], kind: 'para' },
			{ containers: [item(1)], kind: 'para' },
			{ containers: [item(0)], kind: 'para' }
		],
		marks: [],
		islands: []
	};

	it('decodes an ordinal reset as a NEW list, not a merged one', () => {
		const doc = decode(twoLists, blockSchema);
		expect(doc.childCount).toBe(2);
		expect(doc.child(0).type.name).toBe('bullet_list');
		expect(doc.child(0).childCount).toBe(2);
		expect(doc.child(1).type.name).toBe('bullet_list');
		expect(doc.child(1).childCount).toBe(1);
	});

	it('round-trips through the content (the exit-criterion shape)', () => {
		// Normalization preserves the two-list shape, so a merged decode would
		// re-encode ordinals [0,1,2] and fail this equality.
		const canon = normalize(twoLists);
		expect(contentEqual(normalize(pmToContent(decode(canon, blockSchema))), canon)).toBe(true);
	});
});

describe('mark-set run keying', () => {
	it('does not alias a link url containing `|` with a mark set', () => {
		// url "a|strong" on [0,1) next to {link "a", strong} on [1,2): the two mark
		// sets must key differently, or the runs merge and the second set is dropped.
		const rt: Content = {
			text: 'ab',
			lines: [{ containers: [], kind: 'para' }],
			marks: [
				{ start: 0, end: 1, type: 'link', url: 'a|strong' } as never,
				{ start: 1, end: 2, type: 'link', url: 'a' } as never,
				{ start: 1, end: 2, type: 'strong' } as never
			],
			islands: []
		};
		const para = decode(rt, blockSchema).child(0);
		expect(para.childCount).toBe(2);
		expect(para.child(0).marks.map((m) => [m.type.name, m.attrs.href])).toEqual([
			['link', 'a|strong']
		]);
		const second = para
			.child(1)
			.marks.map((m) => m.type.name)
			.sort();
		expect(second).toEqual(['link', 'strong']);
		expect(para.child(1).marks.find((m) => m.type.name === 'link')?.attrs.href).toBe('a');
	});
});
