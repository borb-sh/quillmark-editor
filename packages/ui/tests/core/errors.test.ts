// The error channel (`core/errors.ts`): what a surface hands a consumer's sink,
// and what it does when there is none. The two claims a consumer builds on are
// the `severity` default and the live sink read — a sink swapped after a surface
// mounted is the case a captured reference silently breaks.
import { describe, it, expect, vi } from 'vitest';
import { createReport, type EditorError, type ErrorSink } from '$lib/core';

/** A sink and the list it fills. */
function collect(): { sink: ErrorSink; seen: EditorError[] } {
	const seen: EditorError[] = [];
	return { sink: (e) => seen.push(e), seen };
}

describe('createReport', () => {
	it('reports code, message and cause verbatim, at `error` by default', () => {
		const { sink, seen } = collect();
		const cause = new Error('boom');
		createReport(() => sink)('preview.paint', 'page 2 failed to paint', { cause });
		expect(seen).toEqual([
			{ code: 'preview.paint', message: 'page 2 failed to paint', severity: 'error', cause }
		]);
	});

	it('carries `dev` for a violation of the package contract', () => {
		// The whole point of the field: a telemetry sink drops the class on this
		// rather than by listing the codes that happen to be dev-only today.
		const { sink, seen } = collect();
		createReport(() => sink)('surface.rebind', 'doc swapped in place', { severity: 'dev' });
		expect(seen[0].severity).toBe('dev');
	});

	it('omits `cause` when the site reports none', () => {
		const { sink, seen } = collect();
		createReport(() => sink)('surface.rebind', 'doc swapped in place', { severity: 'dev' });
		expect('cause' in seen[0]).toBe(false);
	});

	it('falls to console.error when the consumer passed no sink', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			createReport(() => undefined)('source.serialize', 'toMarkdown failed');
			expect(spy).toHaveBeenCalledWith(
				'[quillmark/ui] source.serialize: toMarkdown failed',
				undefined
			);
		} finally {
			spy.mockRestore();
		}
	});

	it('reads the sink per report, so a swapped hook takes effect without a remount', () => {
		// A surface holds its options for its lifetime; a consumer's `onError` closing
		// over live state is a new function on every render.
		let sink: ErrorSink | undefined;
		const report = createReport(() => sink);
		const first = collect();
		sink = first.sink;
		report('quill.validate', 'first');
		const second = collect();
		sink = second.sink;
		report('quill.validate', 'second');
		expect(first.seen.map((e) => e.message)).toEqual(['first']);
		expect(second.seen.map((e) => e.message)).toEqual(['second']);
	});
});
