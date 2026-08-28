/**
 * `loadEngine`, over the ways a collection answers: what is absent names an install, what
 * is present and then fails says which module it was and carries what threw.
 *
 * The artifact here is a stub planted in the collection's own `node_modules`, which is
 * what keeps these milliseconds: `loadEngine` resolves, imports and inits whatever answers
 * to `@quillmark/wasm` from the collection, and the real one proves nothing about a
 * corrupt one. The author's end of it — a verb that exits non-zero and prints the cause —
 * is `cli.integration.test.ts`.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadEngine } from '../collection.js';
import { scratch } from './helpers/collection.js';

const temp = scratch('quillkit-engine-');
afterEach(() => temp.cleanup());

/** What `loadEngine` asks of the artifact, and a reading of whether `init()` has run. */
const ARTIFACT = `
let ready = false;
export const initialized = () => ready;
export async function init() { ready = true; }
export class Engine { origin = 'wasm'; }
`;

/** A collection with `source` answering to `@quillmark/wasm` out of its own tree. The
 *  `type` is what makes a `quillkit.config.js` beside it ESM, as an author's package is. */
async function planted(source: string): Promise<string> {
	const at = await temp.dir();
	await writeFile(join(at, 'package.json'), '{ "type": "module" }');
	const artifact = join(at, 'node_modules', '@quillmark', 'wasm');
	await mkdir(artifact, { recursive: true });
	await writeFile(
		join(artifact, 'package.json'),
		JSON.stringify({
			name: '@quillmark/wasm',
			version: '0.0.0',
			type: 'module',
			exports: { '.': { default: './index.js' } }
		})
	);
	await writeFile(join(artifact, 'index.js'), source);
	return at;
}

const configure = (collection: string, source: string): Promise<void> =>
	writeFile(join(collection, 'quillkit.config.js'), source);

/** What a call rejected with, `cause` and all. */
async function caught(run: Promise<unknown>): Promise<Error> {
	try {
		await run;
	} catch (err) {
		return err as Error;
	}
	throw new Error('expected a rejection');
}

describe('absence', () => {
	it('names the install when nothing answers to @quillmark/wasm', async () => {
		await expect(loadEngine(await temp.dir())).rejects.toThrow(
			/npm install --save-dev @quillmark\/wasm/
		);
	});

	it('takes the artifact when no config is there', async () => {
		expect(await loadEngine(await planted(ARTIFACT))).toMatchObject({ origin: 'wasm' });
	});

	it('takes the artifact when a config names no engine', async () => {
		const at = await planted(ARTIFACT);
		await configure(at, 'export const unrelated = true;\n');
		expect(await loadEngine(at)).toMatchObject({ origin: 'wasm' });
	});
});

describe('a fault past absence', () => {
	it('separates an artifact that will not load from one that is not installed', async () => {
		const at = await planted('throw new Error("truncated artifact");\n');
		const err = await caught(loadEngine(at));

		expect(err.message).toContain('Cannot load @quillmark/wasm');
		expect(err.message).not.toContain('npm install');
		expect((err.cause as Error).message).toContain('truncated artifact');
	});

	it('separates an artifact that will not instantiate from one that will not load', async () => {
		const at = await planted(
			'export class Engine {}\nexport async function init() { throw new Error("expected magic word"); }\n'
		);
		const err = await caught(loadEngine(at));

		expect(err.message).toContain('Cannot initialize @quillmark/wasm');
		expect(err.message).not.toContain('npm install');
		expect((err.cause as Error).message).toContain('expected magic word');
	});

	it('fails on a config that throws rather than gating through the artifact', async () => {
		const at = await planted(ARTIFACT);
		await configure(at, 'throw new Error("the author\'s own file");\n');
		const err = await caught(loadEngine(at));

		expect(err.message).toContain('Cannot load quillkit.config.js');
		expect((err.cause as Error).message).toContain("the author's own file");
	});

	it('fails on a config whose own import is absent', async () => {
		// The case no error can rule on: `ERR_MODULE_NOT_FOUND` is what a missing config
		// raises and what a config raises over a specifier of its own, so presence is the
		// filesystem's answer rather than the resolver's.
		const at = await planted(ARTIFACT);
		await configure(at, "export { engine } from './engine.js';\n");
		const err = await caught(loadEngine(at));

		expect(err.message).toContain('Cannot load quillkit.config.js');
	});
});

describe("the config's engine", () => {
	it('wins over the artifact, and is built with init already run', async () => {
		const at = await planted(ARTIFACT);
		await configure(
			at,
			"import { Engine, initialized } from '@quillmark/wasm';\n" +
				'export const engine = new Engine();\n' +
				"engine.origin = 'config';\n" +
				'engine.rodeInit = initialized();\n'
		);

		expect(await loadEngine(at)).toMatchObject({ origin: 'config', rodeInit: true });
	});
});
