// caret.ts — the editor→preview field-path mapping (Phase 5). Pure address math;
// the live bridge round-trip is exercised in the browser (e2e/editor.spec.ts).
// This pins the grammar and its inverse relationship with the parse side.
import { describe, it, expect } from 'vitest';
import { fieldPathForAddr } from '$lib/visual/caret';
import { parsePath, perKindCardIndex } from '$lib/visual/diagnostics';

describe('fieldPathForAddr', () => {
	it('maps the main body and main fields', () => {
		expect(fieldPathForAddr({}, [])).toBe('$body');
		expect(fieldPathForAddr({ field: 'subject' }, [])).toBe('subject');
	});

	it('maps a card body and card field to the per-kind ordinal grammar', () => {
		const kinds = ['indorsement', 'indorsement'];
		expect(fieldPathForAddr({ card: 0 }, kinds)).toBe('$cards.indorsement.0');
		expect(fieldPathForAddr({ card: 1 }, kinds)).toBe('$cards.indorsement.1');
		expect(fieldPathForAddr({ card: 1, field: 'from' }, kinds)).toBe('$cards.indorsement.1.from');
	});

	it('counts the ordinal PER KIND, not by absolute index', () => {
		const kinds = ['note', 'indorsement', 'note', 'indorsement'];
		// The 2nd indorsement sits at absolute index 3 but is per-kind ordinal 1.
		expect(fieldPathForAddr({ card: 3, field: 'from' }, kinds)).toBe('$cards.indorsement.1.from');
		expect(fieldPathForAddr({ card: 2 }, kinds)).toBe('$cards.note.1');
	});

	it('drops an out-of-range or malformed card index', () => {
		expect(fieldPathForAddr({ card: 5 }, ['indorsement'])).toBeUndefined();
		expect(fieldPathForAddr({ card: -1 }, ['indorsement'])).toBeUndefined();
	});

	it('is the inverse of parsePath (+ perKindCardIndex) for routable addresses', () => {
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
			// parsePath yields a per-kind ordinal in `card` + the `cardKind`; resolve
			// it back to the absolute index and compare to the original addr.
			if (parsed!.card != null && parsed!.cardKind != null) {
				const abs = perKindCardIndex(kinds, parsed!.cardKind, parsed!.card as number);
				expect(abs).toBe(addr.card);
				expect(parsed!.field).toBe(addr.field);
			} else {
				expect(parsed!.field).toBe(addr.field);
			}
		}
	});
});
