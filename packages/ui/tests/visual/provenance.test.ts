// The provenance channel (FIELD_PROVENANCE): `quill.resolve(doc)` mapped to the
// editor's name-keyed `provenance` map and the ghosted `default:` it feeds. The
// pure helpers are unit-tested; the resolve behavior is asserted against the REAL
// usaf_memo schema, so the authored↔default flip the ghost turns on is pinned to
// the fixture the suite runs against, not a mock.
import { describe, it, expect } from 'vitest';
import type { ResolvedField, Resolved } from '$lib/core';
import {
	provenanceMap,
	resolvedByCardIndex,
	ghostDefault,
	stringifyGhost
} from '$lib/visual/structure';
import { quill } from '../helpers/fixtures.js';

const row = (name: string, value: unknown, source: ResolvedField['source']): ResolvedField => ({
	name,
	value,
	source
});

describe('provenanceMap', () => {
	it('keys resolved rows by field name', () => {
		const map = provenanceMap([row('a', 1, 'authored'), row('b', 2, 'default')]);
		expect(map.a.source).toBe('authored');
		expect(map.b).toEqual(row('b', 2, 'default'));
	});
});

describe('resolvedByCardIndex', () => {
	// Array position 1 carries document index 2; the map keys on `index`, and one
	// entry carries both channels (fields and the `body` sibling).
	const resolved = {
		main: { fields: [], body: null },
		cards: [
			{
				kind: 'k',
				index: 0,
				fields: [row('x', 1, 'authored')],
				body: row('body', 'B0', 'default')
			},
			{ kind: 'k', index: 2, fields: [row('y', 2, 'default')], body: null }
		]
	} as unknown as Resolved;

	it('keys cards by document index, not array position', () => {
		const byCard = resolvedByCardIndex(resolved);
		expect(byCard.get(0)?.fields[0]?.name).toBe('x');
		expect(byCard.get(2)?.fields[0]?.name).toBe('y');
	});
	it('carries each card’s body row alongside its fields', () => {
		const byCard = resolvedByCardIndex(resolved);
		expect(byCard.get(0)?.body?.value).toBe('B0');
		expect(byCard.get(2)?.body).toBeNull();
	});
	it('is empty for a missing index or an absent resolve', () => {
		expect(resolvedByCardIndex(resolved).get(5)).toBeUndefined();
		expect(resolvedByCardIndex(undefined).size).toBe(0);
	});
});

// The two halves of the ghost projection every control and the body leaf share:
// `ghostDefault` decides WHETHER a row ghosts, `stringifyGhost` whether it has a
// text form to show.
describe('the ghost projection', () => {
	it('ghosts only a default-sourced value', () => {
		expect(ghostDefault(row('a', 'D', 'default'))).toBe('D');
		expect(ghostDefault(row('a', 'A', 'authored'))).toBeUndefined();
		expect(ghostDefault(row('a', '', 'zero'))).toBeUndefined();
		expect(ghostDefault(undefined)).toBeUndefined();
	});
	it('renders a scalar ghost as text and declines an object one', () => {
		expect(stringifyGhost('Write it here')).toBe('Write it here');
		expect(stringifyGhost(12)).toBe('12');
		expect(stringifyGhost(undefined)).toBeUndefined();
		// Only text ghosts render a placeholder: a richtext body resolves to a text
		// render, so an object-shaped default is not one.
		expect(stringifyGhost({ lines: [] })).toBeUndefined();
	});
});

describe('resolve over the real usaf_memo schema', () => {
	it('reports unset declared defaults as `default`-sourced with the schema value', () => {
		const doc = quill().seedDocument();
		const main = provenanceMap(quill().resolve(doc).main.fields);
		expect(main.letterhead_title).toMatchObject({
			source: 'default',
			value: 'DEPARTMENT OF THE AIR FORCE'
		});
		expect(main.font_size).toMatchObject({ source: 'default', value: 12 });
		expect(main.letterhead_seal).toMatchObject({ source: 'default', value: 'dow' });
		// The ghost the control shows for each unset field IS that resolved default.
		expect(ghostDefault(main.letterhead_title)).toBe('DEPARTMENT OF THE AIR FORCE');
	});

	it('flips a field to `authored` (no ghost) once a value is stored, back on clear', () => {
		const doc = quill().seedDocument();
		doc.storeField('letterhead_title', 'ACME MEMORANDUMS');
		const authored = provenanceMap(quill().resolve(doc).main.fields);
		expect(authored.letterhead_title).toMatchObject({
			source: 'authored',
			value: 'ACME MEMORANDUMS'
		});
		// An authored field ghosts nothing; the control shows its own value.
		expect(ghostDefault(authored.letterhead_title)).toBeUndefined();

		doc.removeField('letterhead_title');
		const cleared = provenanceMap(quill().resolve(doc).main.fields);
		expect(cleared.letterhead_title.source).toBe('default');
		expect(ghostDefault(cleared.letterhead_title)).toBe('DEPARTMENT OF THE AIR FORCE');
	});
});
