// Markdown edges (paste / copy loss) + input-rule plugin construction. Markdown is
// never the edit representation; these are boundary-format seams. Input-rule
// LOWERING correctness is covered by lower.test.ts (they emit ordinary trs).
import { describe, it, expect } from 'vitest';
import {
	pasteMarkdown,
	copyMarkdown,
	copyWouldDrop,
	markdownInputRules,
	blockSchema,
	inlineSchema
} from '$lib/core/codec';
import type { Content } from '$lib/core';
import { md } from './_util.js';

describe('markdown edges', () => {
	it('paste rebases markdown onto a base and returns a delta', () => {
		const base = md('hello');
		const { content, delta } = pasteMarkdown(base, 'hello world');
		expect(content.text).toBe('hello world');
		expect(delta.ops.length).toBeGreaterThan(0);
	});

	it('copy projects to markdown', () => {
		expect(copyMarkdown(md('**bold** text')).trim()).toBe('**bold** text');
	});

	it('copyWouldDrop flags identity / underline / unknown', () => {
		expect(copyWouldDrop(md('plain **bold**')).any).toBe(false);
		expect(copyWouldDrop(md('<u>underline</u>')).underline).toBe(true);
		const withAnchor: Content = {
			text: 'abc',
			lines: [{ containers: [], kind: 'para' }],
			marks: [{ start: 1, end: 1, type: 'anchor', id: 'x' } as never],
			islands: []
		};
		expect(copyWouldDrop(withAnchor).anchors).toBe(true);
		const withUnknown: Content = {
			text: 'abc',
			lines: [{ containers: [], kind: 'para' }],
			marks: [{ start: 0, end: 3, type: 'sub', attrs: {} } as never],
			islands: []
		};
		expect(copyWouldDrop(withUnknown).unknown).toBe(true);
	});
});

describe('input rules', () => {
	it('the block schema mounts the full shorthand set (marks + blocks)', () => {
		// strong, em, strike, code (4) + heading, code_block, bullet, ordered, quote (5).
		expect(markdownInputRules(blockSchema).length).toBe(9);
	});
	it('the inline schema mounts only mark rules (no block shorthands)', () => {
		// strong, em, strike, code — no heading/list/quote nodes to wrap.
		expect(markdownInputRules(inlineSchema).length).toBe(4);
	});
});
