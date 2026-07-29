// domid.ts — the leaf key's crossing into `id` syntax. Pure string math, so it
// pins here what the browser tier cannot cheaply enumerate: that no two distinct
// fields can ever land on one DOM id, which is the failure mode `for` resolves
// silently and wrongly rather than reporting.
import { describe, it, expect } from 'vitest';
import { fieldDomIds } from '$lib/visual/domid';
import { fieldKeyToString } from '$lib/visual/diagnostics';

describe('fieldDomIds', () => {
	it('spends only `id`-safe characters, whatever the key held', () => {
		const { control, label, description } = fieldDomIds(
			'u1',
			fieldKeyToString({ field: 'subject' })
		);
		for (const id of [control, label, description]) {
			// No whitespace (which `id` forbids outright), and nothing a bare CSS
			// selector or `querySelector` would need escaped.
			expect(id).toMatch(/^[A-Za-z][A-Za-z0-9_-]*$/);
		}
	});

	it('gives the label and the description their own names, distinct from the control', () => {
		const ids = fieldDomIds('u1', 'main:subject');
		expect(new Set([ids.control, ids.label, ids.description]).size).toBe(3);
	});

	it('separates two editors holding the same field', () => {
		// The leaf-key space is unique per EDITOR: two mounted side by side both hold
		// `main:subject`, and a duplicate id makes `for` resolve to the first.
		const a = fieldDomIds('u1', 'main:subject');
		const b = fieldDomIds('u2', 'main:subject');
		expect(a.control).not.toBe(b.control);
	});

	it('is INJECTIVE — a key that differs by one character keeps its own id', () => {
		// The pairs a plain replace-with-dash would collapse: the key's own separator
		// against a literal dash, and the body sentinel against a field of that name.
		const keys = [
			'main:subject',
			'main-subject',
			'main:$body',
			'main:_body',
			'a:b-c',
			'a-b:c',
			'card1:x',
			'card1:x-',
			'card:1:x'
		];
		const ids = keys.map((k) => fieldDomIds('u1', k).control);
		expect(new Set(ids).size).toBe(keys.length);
	});

	it('carries the real key space — every fixture-shaped key stays distinct', () => {
		const keys = [
			fieldKeyToString({ field: 'subject' }),
			fieldKeyToString({ field: 'memo_for' }),
			fieldKeyToString({}),
			fieldKeyToString({ card: 'c1', field: 'subject' }),
			fieldKeyToString({ card: 'c1' }),
			fieldKeyToString({ card: 2, field: 'subject' })
		];
		const ids = keys.map((k) => fieldDomIds('u1', k).control);
		expect(new Set(ids).size).toBe(keys.length);
	});
});
