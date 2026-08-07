/**
 * The bin, as an author reaches it: `bin/cli.js` spawned in a collection.
 *
 * Every other test in this package imports `src/node`, which is what makes this one
 * worth its seconds: what a consumer runs is a linked bin, and nothing that imports a
 * module proves one works. It pins the packer resolved out of the collection's own
 * tree, the layout, and the loop coming up and serving.
 *
 * It runs against `bin/`, so it needs the Node half built. `npm run build` does that,
 * and the gate builds before it tests.
 */

import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { scratch } from './helpers/collection.js';

const run = promisify(execFile);

/** The bin as npm links it, not the TypeScript behind it. */
const BIN = fileURLToPath(new URL('../../bin/cli.js', import.meta.url));
/** The compiled Node half, whole: what the tarball carries beside the client. */
const BIN_DIR = fileURLToPath(new URL('../../bin/', import.meta.url));

const temp = scratch('studio-cli-');
afterEach(() => temp.cleanup());

beforeAll(() => {
	expect(existsSync(BIN), `${BIN} is missing: run \`npm run build -w packages/studio\` first`).toBe(
		true
	);
});

describe('quillmark-studio site', () => {
	it('lays a site out of a collection it was pointed at', async () => {
		const source = await temp.collection();
		const out = join(await temp.dir(), 'site');
		const { stdout } = await run(process.execPath, [BIN, 'site', '--quiver', source, '--out', out]);

		expect(stdout).toContain('quillmark-studio site:');
		expect(existsSync(join(out, 'index.html'))).toBe(true);
		expect(existsSync(join(out, 'quiver', 'latest.json'))).toBe(true);
	}, 60_000);

	it('refuses an out that would delete the collection', async () => {
		const source = await temp.collection();
		await expect(
			run(process.execPath, [BIN, 'site', '--quiver', source, '--out', source])
		).rejects.toThrow(/Refusing to lay a site out/);
	});

	it('names the install when the collection has no packer', async () => {
		// Studio ships no runtime dependencies, so a collection without
		// `@quillmark/quiver` has nothing to pack with, and says which install fixes it.
		const bare = await temp.dir();
		await expect(
			run(process.execPath, [
				BIN,
				'site',
				'--quiver',
				bare,
				'--out',
				join(await temp.dir(), 'site')
			])
		).rejects.toThrow(/npm install --save-dev @quillmark\/quiver/);
	});
});

describe('quillmark-studio dev', () => {
	it('packs, serves the client at the root and the quiver beneath it', async () => {
		const source = await temp.collection();
		const child = spawn(process.execPath, [BIN, 'dev', '--quiver', source, '--port', '0'], {
			stdio: ['ignore', 'pipe', 'pipe']
		});

		try {
			const url = await new Promise<string>((ok, no) => {
				let out = '';
				const timer = setTimeout(() => no(new Error(`no address in: ${out}`)), 45_000);
				child.stdout.on('data', (chunk: Buffer) => {
					out += chunk.toString();
					const match = /http:\/\/\S+/.exec(out);
					if (match) {
						clearTimeout(timer);
						ok(match[0]);
					}
				});
				child.on('error', no);
			});

			const index = await fetch(url);
			expect(index.status).toBe(200);
			expect(index.headers.get('content-type')).toContain('text/html');

			const pointer = await fetch(new URL('quiver/latest.json', url));
			expect(pointer.status).toBe(200);
			expect(await pointer.json()).toMatchObject({ format: 1 });
		} finally {
			child.kill('SIGTERM');
		}
	}, 60_000);
});

describe('the bin without a verb', () => {
	it('prints usage and fails', async () => {
		await expect(run(process.execPath, [BIN])).rejects.toThrow(/Usage:/);
	});
});

describe('what the Node half loads', () => {
	it('never names the wasm artifact', async () => {
		// `quillmark-studio dev` instantiates no engine: the WASM boundary and the paint
		// loop are browser concerns, and the one wasm in this picture is the copy inside
		// the client, in a tab, in a process this one never shares. A SPECIFIER is the
		// whole of how the artifact could get into this process, so the compiled half is
		// read for one. Prose naming it is not one.
		const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
		const sources = (await readdir(BIN_DIR)).filter((f) => f.endsWith('.js'));
		expect(sources.length).toBeGreaterThan(0);

		for (const file of sources) {
			const text = await readFile(join(BIN_DIR, file), 'utf8');
			const specifiers = [...text.matchAll(SPECIFIER)].map((m) => m[1]);
			expect(specifiers, `${file} reaches the wasm artifact`).not.toContain('@quillmark/wasm');
		}
	});
});
