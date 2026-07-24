// The pure join/ordering/identity math (VisualEditor's projection). Unit-tested
// in isolation — no runes, no Document — including against the REAL usaf_memo
// schema so the ordering contract and group layout are asserted on the fixture
// the whole phase runs against.
import { describe, it, expect } from 'vitest';
import { Quill } from '$lib/core';
import type { QuillFieldSchema } from '$lib/core';
import {
	controlKind,
	enumValues,
	elementControl,
	humanize,
	fieldModels,
	groupOrder,
	groupLabel,
	groupSections,
	initialExpandedGroup,
	packRows,
	interpolateTitle,
	cardTitle,
	bodyEnabled,
	IdSeq,
	initIds,
	idIndex
} from '$lib/visual/structure';
import { loadFixtureTree } from '../helpers/fixtures.js';

const f = (over: Partial<QuillFieldSchema>): QuillFieldSchema =>
	({ type: 'string', ...over }) as QuillFieldSchema;

let cached: Quill | undefined;
function quill(): Quill {
	if (!cached) cached = Quill.fromTree(loadFixtureTree());
	return cached;
}

describe('controlKind', () => {
	it('maps each field type to its control', () => {
		expect(controlKind(f({ type: 'richtext' }))).toBe('prose');
		expect(controlKind(f({ type: 'plaintext' }))).toBe('prose');
		expect(controlKind(f({ type: 'string' }))).toBe('text');
		expect(controlKind(f({ type: 'string', enum: ['a', 'b'] }))).toBe('enum');
		expect(controlKind(f({ type: 'enum', values: ['a'] }))).toBe('enum');
		expect(controlKind(f({ type: 'number' }))).toBe('number');
		expect(controlKind(f({ type: 'integer' }))).toBe('number');
		expect(controlKind(f({ type: 'boolean' }))).toBe('boolean');
		expect(controlKind(f({ type: 'date' }))).toBe('date');
		expect(controlKind(f({ type: 'datetime' }))).toBe('date');
		expect(controlKind(f({ type: 'array' }))).toBe('array');
		expect(controlKind(f({ type: 'object' }))).toBe('object');
	});
	it('reads the enum domain from enum or values', () => {
		expect(enumValues(f({ type: 'string', enum: ['x'] }))).toEqual(['x']);
		expect(enumValues(f({ type: 'enum', values: ['y'] }))).toEqual(['y']);
		expect(enumValues(f({ type: 'string' }))).toBeUndefined();
	});
	it('resolves array element controls from items.type', () => {
		expect(elementControl({ type: 'string' } as QuillFieldSchema)).toBe('text');
		expect(elementControl({ type: 'richtext', inline: true } as QuillFieldSchema)).toBe('prose');
		expect(elementControl(undefined)).toBe('text');
	});
});

describe('humanize', () => {
	it('spaces and capitalizes a snake_case name', () => {
		expect(humanize('memo_for')).toBe('Memo for');
		expect(humanize('font_size')).toBe('Font size');
		expect(humanize('date')).toBe('Date');
	});
});

describe('interpolateTitle + cardTitle', () => {
	it('interpolates {field} against live values', () => {
		expect(interpolateTitle('To {for} from {from}', { for: 'A', from: 'B' })).toBe('To A from B');
		expect(interpolateTitle('x {missing} y', {})).toBe('x  y');
	});
	it('override wins, then schema title, then humanized kind', () => {
		const schema = { fields: {}, ui: { title: 'Routing indorsement' } };
		expect(cardTitle(schema, 'indorsement', {}, 'Custom')).toBe('Custom');
		expect(cardTitle(schema, 'indorsement', {}, '')).toBe('Routing indorsement');
		expect(cardTitle({ fields: {} }, 'indorsement', {}, undefined)).toBe('Indorsement');
	});
});

describe('packRows', () => {
	it('packs consecutive compact fields, solos the rest', () => {
		const mk = (name: string, compact: boolean) =>
			({ name, compact }) as unknown as ReturnType<typeof fieldModels>[number];
		const rows = packRows([
			mk('a', false),
			mk('b', true),
			mk('c', true),
			mk('d', false),
			mk('e', true)
		]);
		expect(rows.map((r) => r.map((x) => x.name))).toEqual([['a'], ['b', 'c'], ['d'], ['e']]);
	});
});

describe('initialExpandedGroup', () => {
	const sec = (group: string | undefined) =>
		({ group, label: group ?? '', fields: [] }) as ReturnType<typeof groupSections>[number];

	it('opens the sole group even when a body exists', () => {
		expect(initialExpandedGroup([sec('a')], true)).toBe('a');
		expect(initialExpandedGroup([sec('a')], false)).toBe('a');
	});
	it('collapses all when many groups sit above a body', () => {
		expect(initialExpandedGroup([sec('a'), sec('b')], true)).toBeNull();
	});
	it('opens the first group when many groups and no body', () => {
		expect(initialExpandedGroup([sec('a'), sec('b')], false)).toBe('a');
	});
	it('ignores ungrouped sections when counting groups', () => {
		// One real group + an ungrouped section → still the sole-group case.
		expect(initialExpandedGroup([sec(undefined), sec('a')], true)).toBe('a');
		// No groups at all → nothing to expand.
		expect(initialExpandedGroup([sec(undefined)], false)).toBeNull();
	});
});

describe('IdSeq identity', () => {
	it('assigns stable, unique ids and resolves index', () => {
		const seq = new IdSeq();
		const ids = initIds(3, seq);
		expect(new Set(ids).size).toBe(3);
		expect(idIndex(ids, ids[1])).toBe(1);
		expect(idIndex(ids, 'nope')).toBe(-1);
	});
});

describe('against the real usaf_memo schema', () => {
	it('projects main fields in declaration order with correct controls', () => {
		const schema = quill().schema;
		const models = fieldModels(schema.main);
		// 22 declared main fields, key order = declaration order (the contract).
		expect(models.length).toBe(22);
		expect(models[0].name).toBe('memo_for');
		expect(models[0].control).toBe('array');
		const byName = Object.fromEntries(models.map((m) => [m.name, m]));
		expect(byName.subject.control).toBe('prose');
		expect(byName.subject.inline).toBe(true);
		expect(byName.classification.control).toBe('enum');
		expect(enumValues(byName.classification.schema)).toContain('UNCLASSIFIED');
		expect(byName.font_size.control).toBe('number');
		expect(byName.date.control).toBe('date');
		expect(byName.references.control).toBe('array');
		expect(byName.references.schema.items?.type).toBe('richtext');
	});

	it('reads group order from the typed ui.groups registry', () => {
		const schema = quill().schema;
		expect(groupOrder(schema.main)).toEqual([
			'addressing',
			'letterhead',
			'classification',
			'additional'
		]);
	});

	it('labels a group from its ui.groups title override, else the humanized id', () => {
		const schema = quill().schema;
		// The fixture's group registry carries no title overrides, so the label
		// humanizes the id.
		expect(groupLabel(schema.main, 'addressing')).toBe('Addressing');
		// A registry that declares a title override wins over the humanized id.
		const withTitle = {
			fields: {},
			ui: { groups: { memo_for: { title: 'Memo For' } } }
		} as unknown as Parameters<typeof groupLabel>[0];
		expect(groupLabel(withTitle, 'memo_for')).toBe('Memo For');
	});

	it('sections fields into the declared group order', () => {
		const schema = quill().schema;
		const models = fieldModels(schema.main);
		const sections = groupSections(models, groupOrder(schema.main));
		expect(sections.map((s) => s.group)).toEqual([
			'addressing',
			'letterhead',
			'classification',
			'additional'
		]);
		// `addressing` carries memo_for, memo_from, subject, signature_block (in order).
		expect(sections[0].fields.map((m) => m.name)).toEqual([
			'memo_for',
			'memo_from',
			'subject',
			'signature_block'
		]);
	});

	it('main and indorsement bodies are enabled (no body.enabled:false)', () => {
		const schema = quill().schema;
		expect(bodyEnabled(schema.main)).toBe(true);
		expect(bodyEnabled(schema.card_kinds?.indorsement)).toBe(true);
	});

	it('indorsement title resolves to its schema ui.title', () => {
		const schema = quill().schema;
		const k = schema.card_kinds!.indorsement;
		expect(cardTitle(k, 'indorsement', {}, undefined)).toBe('Routing indorsement');
	});
});
