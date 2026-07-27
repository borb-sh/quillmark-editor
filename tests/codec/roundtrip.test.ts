// Issue #20 — the two structural gaps the Phase 3 brief implies but the
// fixed-example suites miss:
//   (1) the decode → lower round-trip had no randomized coverage — a SEEDED
//       generator over random line kinds / containers / continues / marks asserts
//       `normalize(pmToContent(decode(rt))) == normalize(rt)`;
//   (2) the position map was only scanned over STATIC docs — these split/join/wrap
//       a block, REBUILD `buildLineIndex`, and re-assert the clean-inverse property.
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { wrapIn } from 'prosemirror-commands';
import type { Node as PMNode } from 'prosemirror-model';
import { decode, blockSchema, pmToContent } from '$lib/core/codec';
import { md, normalize, contentEqual, assertPositionInverse } from './_util.js';

// ── A deterministic PRNG (mulberry32) ───────────────────────────────────────
// Seeded so any failure is reproducible from the reported seed — `Math.random`
// would make a red build un-rerunnable.
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// ── A small markdown content generator ───────────────────────────────────────
// Markdown (not raw `Content`) is the source so every sample is a guaranteed-
// valid content via `importMarkdown` — the generator explores line kinds, list/
// quote containers, the hard-break `continues` flag, and inline marks, while
// staying clear of islands (own round-trip concerns, #16) and mark-on-code
// overlap (a separate normalization edge). At most one mark per word, so no
// overlap that would blur the property under test.
const WORDS = ['alpha', 'beta', 'gamma', 'x', 'the', 'quick', '😀', '🎉', '漢字', '日本語'];

function pick<T>(r: () => number, arr: T[]): T {
	return arr[Math.floor(r() * arr.length)];
}

function genInline(r: () => number): string {
	const n = 1 + Math.floor(r() * 4);
	const parts: string[] = [];
	for (let i = 0; i < n; i++) {
		const w = pick(r, WORDS);
		const roll = r();
		if (roll < 0.18) parts.push(`**${w}**`);
		else if (roll < 0.32) parts.push(`*${w}*`);
		else if (roll < 0.42) parts.push(`\`${w}\``);
		else if (roll < 0.48) parts.push(`[${w}](https://ex.com)`);
		else parts.push(w);
	}
	return parts.join(' ');
}

function genBlock(r: () => number): string {
	const kind = r();
	if (kind < 0.35) return genInline(r); // paragraph
	if (kind < 0.5) return `# ${genInline(r)}`; // heading
	if (kind < 0.68) {
		const n = 1 + Math.floor(r() * 3); // bullet list
		return Array.from({ length: n }, () => `- ${genInline(r)}`).join('\n');
	}
	if (kind < 0.82) {
		const n = 1 + Math.floor(r() * 3); // ordered list
		return Array.from({ length: n }, (_, i) => `${i + 1}. ${genInline(r)}`).join('\n');
	}
	if (kind < 0.92) return `> ${genInline(r)}`; // blockquote
	return `${genInline(r)}\\\n${genInline(r)}`; // hard break → a `continues` line
}

function genMarkdown(r: () => number): string {
	const n = 1 + Math.floor(r() * 5);
	return Array.from({ length: n }, () => genBlock(r)).join('\n\n');
}

describe('generative decode → lower round-trip', () => {
	it('is identity up to normalization over random corpora', () => {
		for (let seed = 1; seed <= 200; seed++) {
			const source = genMarkdown(rng(seed));
			const rt = md(source);
			const back = pmToContent(decode(rt, blockSchema));
			expect(contentEqual(normalize(back), normalize(rt)), `seed ${seed}\n${source}`).toBe(true);
		}
	});
});

// ── Position map across a structural edit + index rebuild ────────────────────
// The inverse property itself is `assertPositionInverse` (_util.ts) — what these
// add over positions.test.ts is that the index is REBUILT after a structural
// mutation, not read off a fresh decode.

describe('position map across structural edits + rebuild', () => {
	it('holds after splitting a paragraph', () => {
		const doc = decode(md('First 😀 para body 漢.'), blockSchema);
		// PM pos 4 is inside the first textblock (after "Fir") — split into two paras.
		const newDoc = EditorState.create({ doc }).tr.split(4).doc;
		expect(newDoc.childCount).toBe(2);
		assertPositionInverse(newDoc, 'split');
	});

	it('holds after joining two paragraphs', () => {
		const doc = decode(md('Alpha 😀.\n\nBeta 🎉 body.'), blockSchema);
		expect(doc.childCount).toBe(2);
		// The boundary between block 0 and block 1 is at block 0's node size.
		const newDoc = EditorState.create({ doc }).tr.join(doc.child(0).nodeSize).doc;
		expect(newDoc.childCount).toBe(1);
		assertPositionInverse(newDoc, 'join');
	});

	it('holds after wrapping a paragraph in a blockquote', () => {
		const doc = decode(md('Wrap 😀 me 漢 up.'), blockSchema);
		const state = EditorState.create({ doc });
		let newDoc = doc;
		const applied = wrapIn(blockSchema.nodes.blockquote)(state, (tr) => {
			newDoc = tr.doc;
		});
		expect(applied).toBe(true);
		expect(newDoc.child(0).type.name).toBe('blockquote');
		assertPositionInverse(newDoc, 'wrap');
	});

	it('holds after a split at every interior offset of a paragraph', () => {
		// ASCII only: sweeping every PM offset would otherwise land between an
		// emoji's surrogate halves, which is not a content edit the map models.
		const doc = decode(md('one two three four five six'), blockSchema);
		for (let pos = 2; pos < doc.content.size - 1; pos++) {
			let newDoc: PMNode;
			try {
				newDoc = EditorState.create({ doc }).tr.split(pos).doc;
			} catch {
				continue; // not a splittable position — skip
			}
			assertPositionInverse(newDoc, `split@${pos}`);
		}
	});
});
