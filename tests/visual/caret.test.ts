// caret.ts — the editor→preview field-path mapping (Phase 5). Pure address math;
// the live bridge round-trip is exercised in the browser (e2e/editor.spec.ts).
// This pins the canonical `DocPath` grammar and its inverse relationship with the
// `parsePath` route.
import { describe, it, expect } from 'vitest';
import { fieldPathForAddr } from '$lib/visual/caret';
import { parsePath } from '$lib/visual/diagnostics';

describe('fieldPathForAddr', () => {
	it('maps the main body and main fields', () => {
		expect(fieldPathForAddr({}, [])).toBe('main.body');
		expect(fieldPathForAddr({ field: 'subject' }, [])).toBe('main.subject');
	});

	it('maps a card body and card field by ABSOLUTE document index', () => {
		const kinds = ['indorsement', 'indorsement'];
		expect(fieldPathForAddr({ card: 0 }, kinds)).toBe('cards.indorsement[0].body');
		expect(fieldPathForAddr({ card: 1 }, kinds)).toBe('cards.indorsement[1].body');
		expect(fieldPathForAddr({ card: 1, field: 'from' }, kinds)).toBe('cards.indorsement[1].from');
	});

	it('addresses by absolute index across interleaved kinds — no per-kind counting', () => {
		const kinds = ['note', 'indorsement', 'note', 'indorsement'];
		// The 2nd indorsement sits at absolute index 3 and is addressed as [3].
		expect(fieldPathForAddr({ card: 3, field: 'from' }, kinds)).toBe('cards.indorsement[3].from');
		expect(fieldPathForAddr({ card: 2 }, kinds)).toBe('cards.note[2].body');
	});

	it('uses the unknown-kind form (cards[i]) for a blank kind', () => {
		expect(fieldPathForAddr({ card: 0, field: 'from' }, [''])).toBe('cards[0].from');
	});

	it('drops an out-of-range or malformed card index', () => {
		expect(fieldPathForAddr({ card: 5 }, ['indorsement'])).toBeUndefined();
		expect(fieldPathForAddr({ card: -1 }, ['indorsement'])).toBeUndefined();
	});

	it('is the inverse of parsePath for routable addresses (absolute index round-trips)', () => {
		const kinds = ['note', 'indorsement', 'indorsement'];
		for (const addr of [
			{},
			{ field: 'subject' },
			{ card: 1, field: 'from' },
			{ card: 2 }
		] as const) {
			const path = fieldPathForAddr(addr, kinds);
			expect(path).toBeDefined();
			const parsed = parsePath(path!);
			expect(parsed).toBeDefined();
			// The absolute index and field survive the round-trip directly — no
			// per-kind resolution, since `DocPath` addresses cards by document index.
			expect(parsed!.card).toBe(addr.card == null ? undefined : addr.card);
			expect(parsed!.field).toBe('field' in addr ? addr.field : undefined);
		}
	});
});
