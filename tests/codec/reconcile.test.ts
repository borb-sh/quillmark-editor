// Criterion 7 (gate logic) — the field-scoped external-change gate. The reconciler
// re-hydrates only when the stored content diverges from what the codec last knew;
// the field's own edit (which it commits) does not look external. Field-level
// behavior over a live view is in field.test.ts.
import { describe, it, expect } from 'vitest';
import { createReconciler, contentEqual } from '$lib/core/codec';
import { md } from './_util.js';

describe('reconciliation gate', () => {
	it('no re-hydrate when the content matches the last-known', () => {
		const rt = md('hello world');
		const rec = createReconciler(rt);
		// A fresh, value-equal read (different object identity, possibly different key order).
		expect(rec.shouldRehydrate(md('hello world'))).toBe(false);
	});

	it('re-hydrate when the content diverges (a foreign edit)', () => {
		const rec = createReconciler(md('hello world'));
		expect(rec.shouldRehydrate(md('hello WORLD'))).toBe(true);
	});

	it('commit moves the known state (own edit no longer looks external)', () => {
		const rec = createReconciler(md('v1'));
		const edited = md('v2');
		expect(rec.shouldRehydrate(edited)).toBe(true);
		rec.commit(edited); // the codec applied its own edit and records the new store
		expect(rec.shouldRehydrate(edited)).toBe(false);
	});

	it('contentEqual is key-order-insensitive and mark-aware', () => {
		expect(contentEqual(md('**bold** text'), md('**bold** text'))).toBe(true);
		expect(contentEqual(md('**bold** text'), md('*em* text'))).toBe(false);
	});
});
