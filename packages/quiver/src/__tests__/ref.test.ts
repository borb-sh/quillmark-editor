import { describe, it, expect } from 'vitest';
import { parseQuillRef } from '../ref.js';
import { QuiverError } from '../errors.js';

describe('parseQuillRef — valid refs', () => {
	it('parses bare name: showcase', () => {
		const result = parseQuillRef('showcase');
		expect(result.name).toBe('showcase');
		expect(result.selector).toBeUndefined();
	});

	it('parses name@major: showcase@1', () => {
		const result = parseQuillRef('showcase@1');
		expect(result.name).toBe('showcase');
		expect(result.selector).toBe('1');
	});

	it('parses name@major.minor: showcase@1.2', () => {
		const result = parseQuillRef('showcase@1.2');
		expect(result.name).toBe('showcase');
		expect(result.selector).toBe('1.2');
	});

	it('parses name@x.y.z: showcase@1.2.3', () => {
		const result = parseQuillRef('showcase@1.2.3');
		expect(result.name).toBe('showcase');
		expect(result.selector).toBe('1.2.3');
	});

	it('parses hyphenated and mixed name: a-b_c@1.0.0', () => {
		const result = parseQuillRef('a-b_c@1.0.0');
		expect(result.name).toBe('a-b_c');
		expect(result.selector).toBe('1.0.0');
	});

	it('parses name with uppercase letters', () => {
		const result = parseQuillRef('MyQuill@2.0.1');
		expect(result.name).toBe('MyQuill');
		expect(result.selector).toBe('2.0.1');
	});

	it('parses name with digits', () => {
		const result = parseQuillRef('quill2024');
		expect(result.name).toBe('quill2024');
		expect(result.selector).toBeUndefined();
	});
});

describe('parseQuillRef — invalid refs', () => {
	function expectInvalidRef(ref: string) {
		expect(() => parseQuillRef(ref), `expected "${ref}" to throw invalid_ref`).toThrow(QuiverError);
		try {
			parseQuillRef(ref);
		} catch (err) {
			expect(err).toBeInstanceOf(QuiverError);
			expect((err as QuiverError).code).toBe('invalid_ref');
		}
	}

	it('rejects empty string', () => expectInvalidRef(''));
	it('rejects bare @', () => expectInvalidRef('@'));
	it('rejects foo@ (missing selector)', () => expectInvalidRef('foo@'));
	it('rejects @1 (missing name)', () => expectInvalidRef('@1'));
	it('rejects foo@^1 (caret range)', () => expectInvalidRef('foo@^1'));
	it('rejects foo@~1 (tilde range)', () => expectInvalidRef('foo@~1'));
	it('rejects foo@>=1 (gte range)', () => expectInvalidRef('foo@>=1'));
	it('rejects foo@* (wildcard)', () => expectInvalidRef('foo@*'));
	it('rejects foo@1.2.3-beta (prerelease)', () => expectInvalidRef('foo@1.2.3-beta'));
	it('rejects foo@1.2.3+build (build metadata)', () => expectInvalidRef('foo@1.2.3+build'));
	it('rejects foo!bar (invalid name char)', () => expectInvalidRef('foo!bar'));
	it('rejects foo@1.2.3.4 (four-part selector)', () => expectInvalidRef('foo@1.2.3.4'));
	it('rejects foo.bar (dot in name)', () => expectInvalidRef('foo.bar'));
	it('rejects foo@1.x (non-digit in selector)', () => expectInvalidRef('foo@1.x'));
});
