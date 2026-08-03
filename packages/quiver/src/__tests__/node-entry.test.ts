/**
 * Regression tests for the Node entry design.
 *
 * The filesystem factories are free functions in `@quillmark/quiver/node`; the
 * `Quiver` class is the browser-safe one from the main entry, unmodified.
 * Importing `/node` must therefore leave the shared constructor exactly as the
 * main entry left it — the import-order hazard the old runtime patch carried
 * (a `Quiver` binding whose statics depend on what else got imported first)
 * cannot come back.
 */

import { describe, it, expect } from 'vitest';
import { Quiver as MainQuiver } from '../index.js';
import { Quiver as NodeQuiver, fromDir, fromPackage, fromBuiltDir, build } from '../node.js';

describe('node entry — the class is untouched', () => {
	it('re-exports the same constructor as the main entry', () => {
		expect(NodeQuiver).toBe(MainQuiver);
	});

	it('installs no statics on it', () => {
		for (const verb of ['fromDir', 'fromPackage', 'fromBuiltDir', 'build', 'buildPackage']) {
			expect(MainQuiver).not.toHaveProperty(verb);
		}
	});

	it('leaves the browser-safe statics in place', () => {
		expect(typeof MainQuiver.fromBuiltUrl).toBe('function');
		expect(typeof MainQuiver.fromManifest).toBe('function');
	});
});

describe('node entry — the factories', () => {
	it('exports each filesystem factory as a free function', () => {
		expect([fromDir, fromPackage, fromBuiltDir, build].map((f) => typeof f)).toEqual([
			'function',
			'function',
			'function',
			'function'
		]);
	});

	it('returns an instance of the constructor the main entry exports', async () => {
		const fixture = new URL('./fixtures/sample-quiver', import.meta.url).pathname;
		expect(await fromDir(fixture)).toBeInstanceOf(MainQuiver);
	});
});
