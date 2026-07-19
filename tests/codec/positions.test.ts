// Criterion 1 — the position map, the highest-value UTF-16/USV seam. For every USV
// offset (including across astral chars and structural shapes) the map is a clean
// inverse, and offsets land on the right code point.
import { describe, it, expect } from 'vitest';
import { decode, blockSchema, buildLineIndex, usvToPM, pmToUsv, usvLength } from '$lib/core/codec';
import type { Content } from '$lib/core';
import { md } from './_util.js';

/** A synthetic single-para content over `text` (valid: one line, no marks). */
function para(text: string): Content {
	return { text, lines: [{ containers: [], kind: 'para' }], marks: [], islands: [] };
}

/** Assert `pmToUsv ∘ usvToPM` is the identity over every USV offset. */
function assertInverse(rt: Content) {
	const doc = decode(rt, blockSchema);
	const index = buildLineIndex(doc);
	const total = usvLength(rt.text);
	for (let p = 0; p <= total; p++) {
		const pm = usvToPM(doc, index, p);
		expect(pm, `usvToPM(${p}) must be a valid PM position`).toBeGreaterThanOrEqual(0);
		expect(pm).toBeLessThanOrEqual(doc.content.size);
		expect(pmToUsv(doc, index, pm), `roundtrip at USV ${p}`).toBe(p);
	}
}

describe('positions: UTF-16 / USV inverse', () => {
	it('holds over astral chars (emoji, CJK) in one paragraph', () => {
		assertInverse(para('a😀b🎉c'));
		assertInverse(para('日本語テキスト'));
		assertInverse(para('mix 😀 と 漢字 x'));
		assertInverse(para('👨‍👩‍👧‍👦 family zwj'));
	});

	it('holds across multiple lines and structural shapes', () => {
		assertInverse(md('First para.\n\nSecond 😀 para.'));
		assertInverse(md('# Heading 漢\n\nBody 🎉 text'));
		assertInverse(md('- one 😀\n- two 🎉\n- three'));
		assertInverse(md('> quoted 😀 line\n\nafter'));
		assertInverse(md('```js\nconst x = "😀";\nconst y = 2;\n```'));
		assertInverse(md('line one😀\\\nline two🎉'));
	});

	it('holds across leaf blocks (image island, table island, rule)', () => {
		assertInverse(md('before 😀\n\n![alt](img.png)\n\nafter 🎉')); // inline island slot
		assertInverse(md('para\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\ntail')); // block island line
		assertInverse(md('above\n\n---\n\nbelow')); // horizontal rule
	});

	it('lands on the right code point across an emoji', () => {
		// "a😀b": USV a=0, 😀=1, b=2. The caret between 😀 and b is USV 2.
		const rt = para('a😀b');
		const doc = decode(rt, blockSchema);
		const index = buildLineIndex(doc);
		// PM: doc>paragraph, content start at 1. "a"=[1,2], "😀"=[2,4] (2 UTF-16), "b"=[4,5].
		expect(usvToPM(doc, index, 0)).toBe(1); // before 'a'
		expect(usvToPM(doc, index, 1)).toBe(2); // before '😀'
		expect(usvToPM(doc, index, 2)).toBe(4); // before 'b' — skipped the surrogate pair
		expect(usvToPM(doc, index, 3)).toBe(5); // after 'b'
		// Inverse: the PM position after the emoji is USV 2, not 3 (no surrogate drift).
		expect(pmToUsv(doc, index, 4)).toBe(2);
	});

	it('maps a caret at a line boundary to the end of the previous line', () => {
		const rt = md('AB\n\nCD');
		const doc = decode(rt, blockSchema);
		const index = buildLineIndex(doc);
		// USV: A0 B1 \n2 C3 D4. Position 2 (the newline) = end of line 0.
		const pm = usvToPM(doc, index, 2);
		expect(pmToUsv(doc, index, pm)).toBe(2);
		// Position 3 = start of line 1.
		const pm3 = usvToPM(doc, index, 3);
		expect(pmToUsv(doc, index, pm3)).toBe(3);
		expect(pm3).toBeGreaterThan(pm);
	});
});
