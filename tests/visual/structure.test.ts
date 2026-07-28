// The pure join/ordering/identity math (VisualEditor's projection). Unit-tested
// in isolation — no runes, no Document — including against the REAL usaf_memo
// schema so the ordering contract and group layout are asserted on the fixture
// the whole phase runs against.
import { describe, it, expect } from 'vitest';
import type { QuillFieldSchema } from '$lib/core';
import {
	controlKind,
	enumValues,
	humanize,
	fieldModels,
	groupOrder,
	groupLabel,
	groupSections,
	initialExpandedGroup,
	placeFields,
	interpolateTitle,
	cardTitle,
	bodyEnabled,
	IdSeq
} from '$lib/visual/structure';
import { quill } from '../helpers/fixtures.js';

const f = (over: Partial<QuillFieldSchema>): QuillFieldSchema =>
	({ type: 'string', ...over }) as QuillFieldSchema;

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

describe('placeFields', () => {
	const mk = (name: string, compact: boolean, extra: Record<string, unknown> = {}) =>
		({ name, compact, control: 'text', inline: false, ...extra }) as unknown as ReturnType<
			typeof fieldModels
		>[number];
	const spans = (fields: ReturnType<typeof mk>[]) =>
		placeFields(fields).map((p) => [p.field.name, p.span]);

	it('shares a row across a compact run, solos the rest', () => {
		expect(
			spans([mk('a', false), mk('b', true), mk('c', true), mk('d', true), mk('e', false)])
		).toEqual([
			['a', 'full'],
			['b', 'cell'],
			['c', 'cell'],
			['d', 'cell'],
			['e', 'full']
		]);
	});

	it('gives a compact run of one the half-width span, wherever it sits', () => {
		// Trailing, leading, and sandwiched: a run of one is a run of one.
		expect(spans([mk('a', false), mk('b', true)])).toEqual([
			['a', 'full'],
			['b', 'lone']
		]);
		expect(spans([mk('a', true), mk('b', false)])).toEqual([
			['a', 'lone'],
			['b', 'full']
		]);
		expect(spans([mk('a', true)])).toEqual([['a', 'lone']]);
	});

	it('keeps a run of two as cells — `lone` is only ever a run of ONE', () => {
		expect(spans([mk('a', true), mk('b', true)])).toEqual([
			['a', 'cell'],
			['b', 'cell']
		]);
	});

	it('declines the compact hint for shapes that grow under their neighbours', () => {
		// Block richtext (`inline` absent) holds paragraphs; an array owns its own rows;
		// an object nests a field set. All three take a full row despite `ui.compact`.
		expect(
			spans([
				mk('block', true, { control: 'prose', inline: false }),
				mk('arr', true, { control: 'array' }),
				mk('obj', true, { control: 'object' })
			])
		).toEqual([
			['block', 'full'],
			['arr', 'full'],
			['obj', 'full']
		]);
	});

	it('packs an inline prose leaf like any scalar', () => {
		// `tag_line` in the reference quill: richtext + inline + compact, one line tall.
		expect(
			spans([mk('seal', true), mk('tag_line', true, { control: 'prose', inline: true })])
		).toEqual([
			['seal', 'cell'],
			['tag_line', 'cell']
		]);
	});

	it('does not let a declined field fuse the runs on either side of it', () => {
		// The block field breaks the run, so each neighbour is a run of one.
		expect(
			spans([mk('a', true), mk('block', true, { control: 'prose', inline: false }), mk('b', true)])
		).toEqual([
			['a', 'lone'],
			['block', 'full'],
			['b', 'lone']
		]);
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
	it('takes unique ids, and keeps taking them across calls', () => {
		const seq = new IdSeq();
		const ids = [...seq.take(3), ...seq.take(2)];
		expect(new Set(ids).size).toBe(5);
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

	it('projects each field schema description into the model', () => {
		const schema = quill().schema;
		const byName = Object.fromEntries(fieldModels(schema.main).map((m) => [m.name, m]));
		// `memo_from` carries a description in the fixture; it threads verbatim.
		expect(byName.memo_from.description).toBe(byName.memo_from.schema.description);
		expect(byName.memo_from.description).toMatch(/office symbol/i);
	});

	it('marks a no-default field required, a defaulted field not', () => {
		const schema = quill().schema;
		const byName = Object.fromEntries(fieldModels(schema.main).map((m) => [m.name, m]));
		// No `default:` → required (Unendorsed); a declared `default:` (incl. `""`/`[]`)
		// → not required. `subject`/`memo_for` declare none; `memo_from`/`letterhead_title` do.
		expect(byName.subject.required).toBe(true);
		expect(byName.memo_for.required).toBe(true);
		expect(byName.memo_from.required).toBe(false);
		expect(byName.letterhead_title.required).toBe(false);
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
		const sections = groupSections(models, groupOrder(schema.main), (g) =>
			groupLabel(schema.main, g)
		);
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
