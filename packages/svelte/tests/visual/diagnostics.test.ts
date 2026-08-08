// diagnostics.ts routing/merge/precedence; pure logic, no Document. VisualEditor's
// `$derived.by` glue is the thin part; the math it feeds on is here. The path→key
// walk itself is `/core`'s `addrForFieldPath` and is tested there.
import { describe, it, expect } from 'vitest';
import type { Diagnostic } from '@quillmark/wasm';
import {
	fieldKeyToString,
	resolveCardKey,
	routeAndResolve,
	mergeDiagnostics,
	type FieldKey
} from '$lib/visual/diagnostics';

const err = (message: string, path?: string): Diagnostic => ({ severity: 'error', message, path });
const warn = (message: string, path?: string): Diagnostic => ({
	severity: 'warning',
	message,
	path
});

describe('fieldKeyToString', () => {
	it('keys the main card by "main"', () => {
		expect(fieldKeyToString({ field: 'subject' })).toBe('main:subject');
		expect(fieldKeyToString({})).toBe('main:$body');
	});
	it('keys a composable card by its card slot (id or index)', () => {
		expect(fieldKeyToString({ card: 'c0', field: 'from' })).toBe('c0:from');
		expect(fieldKeyToString({ card: 0, field: 'from' })).toBe('0:from');
		expect(fieldKeyToString({ card: 'c0' })).toBe('c0:$body');
	});
});

describe('resolveCardKey', () => {
	const cardIds = ['c0', 'c1', 'c2'];
	it('resolves an absolute document index to the live stable id', () => {
		expect(resolveCardKey({ card: 1, field: 'from' }, cardIds)).toEqual({
			card: 'c1',
			field: 'from'
		});
	});
	it('drops a positional key whose index is out of the current card array', () => {
		expect(resolveCardKey({ card: 5, field: 'from' }, cardIds)).toBeUndefined();
	});
	it('passes an already id-keyed or main key through unchanged', () => {
		expect(resolveCardKey({ card: 'c1', field: 'from' }, cardIds)).toEqual({
			card: 'c1',
			field: 'from'
		});
		expect(resolveCardKey({ field: 'subject' }, cardIds)).toEqual({ field: 'subject' });
	});
});

describe('routeAndResolve', () => {
	const cardIds = ['c0', 'c1'];

	it('routes a mix of main and card paths to the live stable-id keying', () => {
		const out = routeAndResolve(
			[warn('w1', 'main.subject'), err('e1', 'cards.indorsement[1].from')],
			cardIds
		);
		expect(out).toEqual([
			{ key: { field: 'subject' }, diagnostic: warn('w1', 'main.subject') },
			{ key: { card: 'c1', field: 'from' }, diagnostic: err('e1', 'cards.indorsement[1].from') }
		]);
	});

	it('drops rather than mis-routes: no path, an unplaceable path, an out-of-range card', () => {
		expect(
			routeAndResolve(
				[
					{ severity: 'error', message: 'no path' },
					err('unplaceable', 'main.references.0'),
					err('gone', 'cards.indorsement[9].from')
				],
				cardIds
			)
		).toEqual([]);
	});

	it('handles an undefined/empty list', () => {
		expect(routeAndResolve(undefined, cardIds)).toEqual([]);
		expect(routeAndResolve([], cardIds)).toEqual([]);
	});
});

describe('mergeDiagnostics', () => {
	it('merges multiple groups by field key', () => {
		const a = [{ key: { field: 'subject' } as FieldKey, diagnostic: warn('w1') }];
		const b = [{ key: { field: 'subject' } as FieldKey, diagnostic: err('e1') }];
		const m = mergeDiagnostics(a, b);
		expect(m.get('main:subject')?.map((d) => d.message)).toEqual(['e1', 'w1']);
	});
	it('sorts errors before warnings within a field, without dropping either', () => {
		const group = [
			{ key: { field: 'x' } as FieldKey, diagnostic: warn('w1') },
			{ key: { field: 'x' } as FieldKey, diagnostic: err('e1') },
			{ key: { field: 'x' } as FieldKey, diagnostic: warn('w2') },
			{ key: { field: 'x' } as FieldKey, diagnostic: err('e2') }
		];
		const m = mergeDiagnostics(group);
		expect(m.get('main:x')?.map((d) => d.message)).toEqual(['e1', 'e2', 'w1', 'w2']);
	});
	it('dedupes an identical (key, severity, message) triple across groups', () => {
		const a = [{ key: { field: 'x' } as FieldKey, diagnostic: err('same') }];
		const b = [{ key: { field: 'x' } as FieldKey, diagnostic: err('same') }];
		const m = mergeDiagnostics(a, b);
		expect(m.get('main:x')?.map((d) => d.message)).toEqual(['same']);
	});
	it('keeps the same message at DIFFERENT keys distinct (dedupe is per-key)', () => {
		const a = [{ key: { field: 'x' } as FieldKey, diagnostic: err('same') }];
		const b = [{ key: { field: 'y' } as FieldKey, diagnostic: err('same') }];
		const m = mergeDiagnostics(a, b);
		expect(m.get('main:x')?.length).toBe(1);
		expect(m.get('main:y')?.length).toBe(1);
	});
	it('routes card and main fields into separate keys', () => {
		const group = [
			{ key: { field: 'from' } as FieldKey, diagnostic: err('main-from') },
			{ key: { card: 'c0', field: 'from' } as FieldKey, diagnostic: err('card-from') }
		];
		const m = mergeDiagnostics(group);
		expect(m.get('main:from')?.[0].message).toBe('main-from');
		expect(m.get('c0:from')?.[0].message).toBe('card-from');
	});
});
