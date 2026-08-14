// diagnostics.ts routing/merge; pure logic, no Document. VisualEditor's
// `$derived.by` glue is the thin part; the math it feeds on is here. The path→key
// walk itself is `/core`'s `addrForFieldPath` and is tested there.
import { describe, it, expect } from 'vitest';
import type { Diagnostic } from '@quillmark/wasm';
import {
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
			[err('e0', 'main.subject'), err('e1', 'cards.indorsement[1].from')],
			cardIds
		);
		expect(out).toEqual([
			{ key: { field: 'subject' }, diagnostic: err('e0', 'main.subject') },
			{ key: { card: 'c1', field: 'from' }, diagnostic: err('e1', 'cards.indorsement[1].from') }
		]);
	});

	it('drops warnings rather than routing them', () => {
		expect(routeAndResolve([warn('w1', 'main.subject')], cardIds)).toEqual([]);
	});

	it('drops rather than mis-routes: no path, an unplaceable path, an out-of-range card', () => {
		expect(
			routeAndResolve(
				[
					{ severity: 'error', message: 'no path' },
					err('unplaceable', 'main.keywords[0]'),
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
		const a = [{ key: { field: 'subject' } as FieldKey, diagnostic: err('e1') }];
		const b = [{ key: { field: 'subject' } as FieldKey, diagnostic: err('e2') }];
		const m = mergeDiagnostics(a, b);
		expect(m.get('main:subject')?.map((d) => d.message)).toEqual(['e1', 'e2']);
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
});
