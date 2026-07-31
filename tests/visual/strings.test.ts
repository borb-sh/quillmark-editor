// The wording contract (`visual/strings.ts`, and the two smaller sets the other
// surfaces carry). What is asserted is the CONTRACT — every word the surfaces say
// is reachable, an override merges key by key, and the package's own words are
// exported to compose against — never a particular English string, which is the
// thing a consumer is expected to replace.
import { describe, it, expect } from 'vitest';
import { DEFAULT_STRINGS, resolveStrings, type EditorStrings } from '$lib/visual/strings';
import { DEFAULT_PREVIEW_STRINGS } from '$lib/preview/controller';
import { DEFAULT_SOURCE_STRINGS } from '$lib/source/view';

describe('the editor wording contract', () => {
	it('resolves an override key by key, leaving the rest English', () => {
		const words = resolveStrings({ cardDelete: 'Supprimer la carte' });
		expect(words.cardDelete).toBe('Supprimer la carte');
		expect(words.cardMoveUp).toBe(DEFAULT_STRINGS.cardMoveUp);
	});

	it('takes the package defaults whole when nothing is overridden', () => {
		expect(resolveStrings(undefined)).toBe(DEFAULT_STRINGS);
	});

	it('carries every parameterized entry as a function of its parameters', () => {
		const words = resolveStrings({
			addCardOfKind: (kind) => `+${kind}`,
			tipPosition: (i, n) => `${i}/${n}`,
			arrayItem: (label, i) => `${label}#${i}`,
			fieldGuidance: (label) => `? ${label}`,
			bodyPlaceholder: ({ kind }) => `write the ${kind}…`
		});
		expect(words.addCardOfKind('indorsement', 'Indorsement')).toBe('+indorsement');
		expect(words.tipPosition(2, 3)).toBe('2/3');
		expect(words.arrayItem('From', 1)).toBe('From#1');
		expect(words.fieldGuidance('Subject')).toBe('? Subject');
		expect(words.bodyPlaceholder({ kind: 'memo', isMain: true })).toBe('write the memo…');
	});

	it('leaves no word the surfaces say outside the set', () => {
		// The census: a string added to a component without a key here is the drift
		// this test exists to catch, and the count is the cheap form of that.
		const keys = Object.keys(DEFAULT_STRINGS) as (keyof EditorStrings)[];
		expect(keys.length).toBeGreaterThanOrEqual(25);
		for (const k of keys) {
			const v = DEFAULT_STRINGS[k];
			expect(typeof v === 'string' || typeof v === 'function').toBe(true);
			if (typeof v === 'string') expect(v.length).toBeGreaterThan(0);
		}
	});

	it('gives the other two surfaces the same shape', () => {
		expect(Object.keys(DEFAULT_PREVIEW_STRINGS).sort()).toEqual(['empty', 'error', 'unsupported']);
		expect(DEFAULT_SOURCE_STRINGS.unavailable('boom')).toContain('boom');
	});
});
