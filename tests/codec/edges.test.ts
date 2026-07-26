// The two markdown edges the codec stands on (CODEC §Markdown at the edges).
// Markdown is never the edit representation — paste rebases INTO content and copy
// projects OUT of it, and both verbs are the boundary's. These pin the shape V1
// relies on; the loss profile of a copy (anchors / underline / unknown have no
// markdown projection) has no editor-side consumer yet, so it has no test — the
// warning surface arrives with the paste/copy wiring.
//
// Input-rule coverage lives in inputrules.test.ts, which drives the rules through
// a real view; a plaintext field's suppression is field.test.ts, which drives a
// real leaf. A rule COUNT assertion lived here and proved neither — it broke on
// any addition and could not tell a rule that fires at the wrong position.
import { describe, it, expect } from 'vitest';
import { rebase, exportMarkdown } from '$lib/core';
import { md } from './_util.js';

describe('markdown edges', () => {
	it('paste rebases markdown onto a base and returns a delta', () => {
		const base = md('hello');
		const { content, delta } = rebase(base, 'hello world');
		expect(content.text).toBe('hello world');
		expect(delta.ops.length).toBeGreaterThan(0);
	});

	it('copy projects to markdown', () => {
		expect(exportMarkdown(md('**bold** text')).trim()).toBe('**bold** text');
	});
});
