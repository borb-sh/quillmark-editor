// The error channel's own contract: it reports, it never gates, and it never
// becomes a second failure. Every call site sits on a recovery path, so a missing
// handler and a throwing handler both have to leave the recovery intact.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportError, errorMessage, type EditorError } from '$lib/core';

const err = (over: Partial<EditorError> = {}): EditorError => ({
	code: 'paint-failed',
	severity: 'error',
	message: 'boom',
	...over
});

afterEach(() => vi.restoreAllMocks());

describe('reportError', () => {
	it('hands the error to the handler', () => {
		const seen: EditorError[] = [];
		reportError((e) => seen.push(e), err({ page: 3 }));
		expect(seen).toHaveLength(1);
		expect(seen[0].code).toBe('paint-failed');
		expect(seen[0].page).toBe(3);
	});

	it('logs when nothing is listening, so an unwired consumer still sees it', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		reportError(undefined, err());
		expect(spy).toHaveBeenCalledOnce();
		expect(String(spy.mock.calls[0][0])).toContain('paint-failed');
	});

	it('swallows a handler that throws', () => {
		// The consumer's bug must not become the package's: this runs inside a catch
		// that has already recovered, and a second throw would undo the recovery.
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		expect(() =>
			reportError(() => {
				throw new Error('handler is broken');
			}, err())
		).not.toThrow();
		expect(spy).toHaveBeenCalledOnce();
	});

	it('carries the cause unwrapped', () => {
		const cause = new Error('the original');
		let seen: EditorError | undefined;
		reportError((e) => (seen = e), err({ cause }));
		expect(seen?.cause).toBe(cause);
	});
});

describe('errorMessage', () => {
	it('reads an Error and stringifies anything else', () => {
		expect(errorMessage(new Error('nope'))).toBe('nope');
		expect(errorMessage('bare string')).toBe('bare string');
		expect(errorMessage(undefined)).toBe('undefined');
	});
});
