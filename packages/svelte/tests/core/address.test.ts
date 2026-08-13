// address.ts: the one hop between the `DocPath` grammar and the `Addr` the document
// verbs take, both directions. Pure address math, no document and no surface.
import { describe, it, expect } from 'vitest';
import { fieldPathForAddr, addrForFieldPath } from '$lib/core';
// Not on `/core`'s entry: the element split is the editor's ladder, not a hop a host
// needs (`core/index.ts` carries what more than one surface speaks).
import { elementAddrForFieldPath } from '$lib/core/address.js';
import { cardPath } from '$lib/core/address.js';

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
});

describe('cardPath', () => {
	it('names the CARD, not the body leaf inside it', () => {
		const kinds = ['note', 'indorsement'];
		expect(cardPath(1, kinds)).toBe('cards.indorsement[1]');
		// The distinction the structure lane rides: a card op is about the card.
		expect(fieldPathForAddr({ card: 1 }, kinds)).toBe('cards.indorsement[1].body');
	});

	it('uses the unknown-kind form, and drops an out-of-range index', () => {
		expect(cardPath(0, [''])).toBe('cards[0]');
		expect(cardPath(2, ['note'])).toBeUndefined();
	});
});

describe('addrForFieldPath', () => {
	it('maps main and card paths back to the mutator currency', () => {
		expect(addrForFieldPath('main.body')).toEqual({});
		expect(addrForFieldPath('main.subject')).toEqual({ field: 'subject' });
		expect(addrForFieldPath('cards.indorsement[1].from')).toEqual({ card: 1, field: 'from' });
	});

	it('lands a bare card and a .body terminal on the same field-less addr', () => {
		expect(addrForFieldPath('cards.indorsement[2]')).toEqual({ card: 2 });
		expect(addrForFieldPath('cards.indorsement[2].body')).toEqual({ card: 2 });
	});

	it('reads the unknown-kind card form', () => {
		expect(addrForFieldPath('cards[1].from')).toEqual({ card: 1, field: 'from' });
	});

	it('rejects a path that names no single commit address', () => {
		// A nested / array-element path, a field-rooted one, and a malformed one.
		expect(addrForFieldPath('main.keywords.0')).toBeUndefined();
		expect(addrForFieldPath('recipients[0].name')).toBeUndefined();
		expect(addrForFieldPath('')).toBeUndefined();
		expect(addrForFieldPath('cards.indorsement[x].from')).toBeUndefined();
		expect(addrForFieldPath('cards.indorsement[-1].from')).toBeUndefined();
	});

	it('round-trips every routable address', () => {
		const kinds = ['note', 'indorsement', 'indorsement'];
		for (const addr of [{}, { field: 'subject' }, { card: 1, field: 'from' }, { card: 2 }]) {
			const path = fieldPathForAddr(addr, kinds);
			expect(path).toBeDefined();
			expect(addrForFieldPath(path!)).toEqual(addr);
		}
		// And the card form, whose inverse is the field-less addr.
		expect(addrForFieldPath(cardPath(1, kinds)!)).toEqual({ card: 1 });
	});
});

describe('elementAddrForFieldPath', () => {
	it('reads the bracketed index the boundary emits', () => {
		expect(elementAddrForFieldPath('main.keywords[0]')).toEqual({
			field: { field: 'keywords' },
			index: 0
		});
		expect(elementAddrForFieldPath('cards.indorsement[1].signature_block[2]')).toEqual({
			field: { card: 1, field: 'signature_block' },
			index: 2
		});
	});

	it('does not read a dotted trailing digit as an index', () => {
		expect(elementAddrForFieldPath('main.keywords.0')).toBeUndefined();
	});

	it('takes only a trailing index under a field', () => {
		// A whole field, a card, and a body have no element; a deeper nesting names no
		// single array either. Whether the field is an array is the caller's guard: this
		// module holds the grammar and no schema.
		expect(elementAddrForFieldPath('main.keywords')).toBeUndefined();
		expect(elementAddrForFieldPath('main.body')).toBeUndefined();
		expect(elementAddrForFieldPath('cards.indorsement[1]')).toBeUndefined();
		expect(elementAddrForFieldPath('main.author.name')).toBeUndefined();
		expect(elementAddrForFieldPath('')).toBeUndefined();
	});
});
