// The pure join/ordering/layout math (VisualEditor's projection). Unit-tested
// in isolation (no runes, no Document) including against the real specimen
// schema so the ordering contract and group layout are asserted on the fixture
// the suite runs against.
import { describe, it, expect } from 'vitest';
import type { QuillFieldSchema } from '@quillmark/wasm';
import {
	controlKind,
	humanize,
	fieldModels,
	groupOrder,
	groupLabel,
	groupSections,
	initialExpandedGroup,
	placeFields,
	interpolateTitle,
	cardTitle,
	bodyEnabled
} from '$lib/visual/structure';
import { quill } from '../helpers/fixtures.js';

const f = (over: Partial<QuillFieldSchema>): QuillFieldSchema =>
	({ type: 'string', ...over }) as QuillFieldSchema;

describe('controlKind', () => {
	it('maps each field type to its control', () => {
		expect(controlKind(f({ type: 'richtext' }))).toBe('prose');
		expect(controlKind(f({ type: 'plaintext' }))).toBe('prose');
		expect(controlKind(f({ type: 'string' }))).toBe('text');
		expect(controlKind(f({ type: 'enum', values: ['a'] }))).toBe('enum');
		expect(controlKind(f({ type: 'number' }))).toBe('number');
		expect(controlKind(f({ type: 'integer' }))).toBe('number');
		expect(controlKind(f({ type: 'boolean' }))).toBe('boolean');
		expect(controlKind(f({ type: 'date' }))).toBe('date');
		expect(controlKind(f({ type: 'datetime' }))).toBe('date');
		expect(controlKind(f({ type: 'array' }))).toBe('array');
		expect(controlKind(f({ type: 'object' }))).toBe('object');
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
	// A projected field, minus the projection: `control`/`inline` are what `packable`
	// reads. The schema rides along because a model carries one, and the array cases
	// vary its `items` to hold that the decline reads none of them.
	const mk = (name: string, compact: boolean, extra: Record<string, unknown> = {}) =>
		({
			name,
			compact,
			control: 'text',
			inline: false,
			schema: { type: 'string' },
			...extra
		}) as unknown as ReturnType<typeof fieldModels>[number];
	/** An array field of `items`, with the control the projection would give it. */
	const arr = (name: string, compact: boolean, items?: Record<string, unknown>) =>
		mk(name, compact, { control: 'array', schema: { type: 'array', items } });
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
		// Block richtext (`inline` absent) holds paragraphs and an object nests a field
		// set: either one stands its neighbours in a column of whitespace, so both take
		// a full row despite `ui.compact`.
		expect(
			spans([
				mk('block', true, { control: 'prose', inline: false }),
				mk('obj', true, { control: 'object', schema: { type: 'object' } })
			])
		).toEqual([
			['block', 'full'],
			['obj', 'full']
		]);
	});

	it('declines the compact hint for an array whatever its items are', () => {
		// `memo_for` in the reference quill: an address block of one-line strings, the
		// shape that packs on any per-items reading. The element count is the document's,
		// so a packed array pays a cell of whitespace for every element its neighbour has
		// past it. An array with no `items` has text elements and declines the same.
		expect(
			spans([
				arr('strings', true, { type: 'string' }),
				arr('untyped', true),
				arr('inline_prose', true, { type: 'richtext', inline: true }),
				arr('blocks', true, { type: 'richtext' }),
				arr('objects', true, { type: 'object' })
			])
		).toEqual([
			['strings', 'full'],
			['untyped', 'full'],
			['inline_prose', 'full'],
			['blocks', 'full'],
			['objects', 'full']
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

	it('opens the first group in order', () => {
		expect(initialExpandedGroup([sec('a')])).toBe('a');
		expect(initialExpandedGroup([sec('a'), sec('b')])).toBe('a');
	});
	it('opens the first group whether or not the card carries a body', () => {
		// A body leaf is no substitute for a field: the card opens on one either way.
		expect(initialExpandedGroup([sec('a'), sec('b'), sec('c'), sec('d')])).toBe('a');
	});
	it('skips ungrouped sections, which render outside the accordion', () => {
		expect(initialExpandedGroup([sec(undefined), sec('a')])).toBe('a');
		// No groups at all → nothing to expand.
		expect(initialExpandedGroup([sec(undefined)])).toBeNull();
		expect(initialExpandedGroup([])).toBeNull();
	});
});

describe('groupOrder', () => {
	it('takes the typed ui.groups registry, in registry order', () => {
		const schema = {
			fields: { a: f({ ui: { group: 'two' } }) },
			ui: { groups: { one: {}, two: {} } }
		} as unknown as Parameters<typeof groupOrder>[0];
		expect(groupOrder(schema)).toEqual(['one', 'two']);
	});

	it('falls back to first-declaration order when no registry is declared', () => {
		const schema = {
			fields: {
				a: f({ ui: { group: 'second' } }),
				b: f({ ui: { group: 'first' } }),
				c: f({ ui: { group: 'second' } }),
				d: f({})
			}
		} as unknown as Parameters<typeof groupOrder>[0];
		// Order of first appearance, each group once, and an ungrouped field adds none.
		expect(groupOrder(schema)).toEqual(['second', 'first']);
	});
});

describe('groupLabel', () => {
	it('takes the registry title override, else humanizes the group id', () => {
		const schema = {
			fields: {},
			ui: { groups: { memo_for: { title: 'Memo For' }, addressing: {} } }
		} as unknown as Parameters<typeof groupLabel>[0];
		expect(groupLabel(schema, 'memo_for')).toBe('Memo For');
		expect(groupLabel(schema, 'addressing')).toBe('Addressing');
	});
});

describe('bodyEnabled', () => {
	it('is true unless the card schema turns it off explicitly', () => {
		const body = (enabled?: boolean) =>
			({ fields: {}, body: enabled === undefined ? {} : { enabled } }) as unknown as Parameters<
				typeof bodyEnabled
			>[0];
		expect(bodyEnabled(body(false))).toBe(false);
		expect(bodyEnabled(body(true))).toBe(true);
		expect(bodyEnabled(body())).toBe(true);
		expect(bodyEnabled({ fields: {} } as unknown as Parameters<typeof bodyEnabled>[0])).toBe(true);
		expect(bodyEnabled(undefined)).toBe(true);
	});
});

describe('required', () => {
	it('is the absence of a `default:`, which an empty string or array still counts as', () => {
		const byName = Object.fromEntries(
			fieldModels({
				fields: {
					none: f({}),
					empty: f({ default: '' }),
					list: f({ type: 'array', default: [] })
				}
			} as unknown as Parameters<typeof fieldModels>[0]).map((m) => [m.name, m])
		);
		expect(byName.none.required).toBe(true);
		expect(byName.empty.required).toBe(false);
		expect(byName.list.required).toBe(false);
	});
});

// The real schema is here to prove the fixture's YAML shapes reach the projection
// as the synthetic cases above assume. It asserts contracts, never the fixture's
// inventory: a count, a group list or a field's copy pinned here fails on every
// edit to the reference quill, and the failure is answered by pasting the new
// value (CLAUDE.md §Verification).
describe('against the real specimen schema', () => {
	const main = () => quill().schema.main;

	it('projects fields in declaration order, with the real shapes mapping to controls', () => {
		const schema = main();
		const models = fieldModels(schema);
		expect(models.map((m) => m.name)).toEqual(Object.keys(schema.fields));
		const byName = Object.fromEntries(models.map((m) => [m.name, m]));
		// One of each shape the synthetic table covers: an inline richtext leaf, an
		// enum, and an array whose items are themselves richtext.
		expect(byName.title.control).toBe('prose');
		expect(byName.title.inline).toBe(true);
		expect(byName.status.control).toBe('enum');
		expect(byName.keywords.control).toBe('array');
		expect(byName.keywords.schema.items?.type).toBe('richtext');
	});

	it('threads a field schema description into the model verbatim', () => {
		const byName = Object.fromEntries(fieldModels(main()).map((m) => [m.name, m]));
		expect(byName.authors.description).toBe(byName.authors.schema.description);
		expect(byName.authors.description).toBeTruthy(); // the fixture declares one to thread
	});

	it('sections every field into the declared group order, losing none', () => {
		const schema = main();
		const models = fieldModels(schema);
		const sections = groupSections(models, groupOrder(schema), (g) => groupLabel(schema, g));
		// Grouped sections follow the registry; an ungrouped one may trail them.
		expect(sections.map((s) => s.group).filter((g) => g != null)).toEqual(groupOrder(schema));
		// And it is a partition; every projected field lands in exactly one section.
		expect(sections.flatMap((s) => s.fields.map((m) => m.name)).sort()).toEqual(
			models.map((m) => m.name).sort()
		);
	});
});
