/**
 * The bin, as an author reaches it: `dist/bin/quillkit.js` spawned against a collection.
 *
 * Every other test in this package imports `src/`, which is what makes this one worth
 * its seconds: what an author reaches is a linked bin, and nothing that imports a module
 * proves one works. It pins the two resolutions the tool is built on (the packer and the
 * engine, each out of the collection's own tree), the client it carries instead, and a
 * real render of every quill's seeded example, that last being what a gate for quills is.
 *
 * It runs against `dist/`, so it needs the package built: both halves, since the verbs
 * that serve reach for the client. The root `npm run build` does that in an order `tsc`
 * here depends on, which is what CI runs before it tests.
 */

import { describe, it, expect, afterEach, beforeAll } from 'vitest';
import { execFile, spawn } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { scratch } from './helpers/collection.js';

const run = promisify(execFile);

/** The bin as npm links it, not the TypeScript behind it. */
const BIN = fileURLToPath(new URL('../../dist/bin/quillkit.js', import.meta.url));
/** The tarball's `dist`, both halves: the compiled tool and the built client. */
const DIST = fileURLToPath(new URL('../../dist/', import.meta.url));
/** The client's half of it, which is a browser program. */
const CLIENT = `client${sep}`;

/** A real Typst backend load and one page compiled. */
const RENDER_MS = 120_000;

const temp = scratch('quillkit-cli-');
afterEach(() => temp.cleanup());

beforeAll(() => {
	expect(
		existsSync(BIN),
		`${BIN} is missing: run \`npm run build -w packages/quillkit\` first`
	).toBe(true);
});

describe('quillkit test', () => {
	it(
		'gates the reference quiver end-to-end',
		async () => {
			// A non-zero exit rejects, carrying the gate's own output as the failure.
			const { stdout } = await run(process.execPath, [BIN, 'test'], {
				cwd: await temp.collection()
			});

			expect(stdout).toContain('pass  usaf_memo@0.2.0');
			expect(stdout).toContain('1/1 passed');
		},
		RENDER_MS
	);

	it('names the install when the collection has no engine or loader', async () => {
		await expect(run(process.execPath, [BIN, 'test'], { cwd: await temp.dir() })).rejects.toThrow(
			/npm install --save-dev @quillmark\/wasm/
		);
	});
});

describe('quillkit build', () => {
	it('packs a collection into the directory it was pointed at', async () => {
		const out = join(await temp.dir(), 'dist');
		const { stdout } = await run(process.execPath, [BIN, 'build', '--out', out], {
			cwd: await temp.collection()
		});

		expect(stdout).toContain('quillkit build:');
		expect(existsSync(join(out, 'latest.json'))).toBe(true);
	}, 60_000);
});

describe('quillkit site', () => {
	it('lays a site out of a collection it was pointed at', async () => {
		const source = await temp.collection();
		const out = join(await temp.dir(), 'site');
		const { stdout } = await run(process.execPath, [BIN, 'site', '--quiver', source, '--out', out]);

		expect(stdout).toContain('quillkit site:');
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
		// quillkit ships no runtime dependencies, so a collection without
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

describe('quillkit studio', () => {
	it('packs, serves the client at the root and the quiver beneath it', async () => {
		const source = await temp.collection();
		const child = spawn(process.execPath, [BIN, 'studio', '--quiver', source, '--port', '0'], {
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

describe('what the tool loads', () => {
	it('names the wasm artifact in no specifier of its own', async () => {
		// The engine is the collection's, reached by a resolved path at runtime, so the
		// artifact is in this process only when `test` puts it there. A static specifier
		// would put it in every verb's, which is what the single-copy rule forbids.
		// Prose naming it is not one.
		//
		// The tool's half of `dist` alone. The client beside it bundles the artifact on
		// purpose, that copy running in a browser tab in a process this one never
		// shares, so scanning it would answer about the wrong process.
		const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;
		const files = (await readdir(DIST, { recursive: true })).filter(
			(f) => f.endsWith('.js') && !f.startsWith(CLIENT)
		);
		expect(files.length).toBeGreaterThan(0);

		for (const file of files) {
			const text = await readFile(join(DIST, file), 'utf8');
			const specifiers = [...text.matchAll(SPECIFIER)].map((m) => m[1]);
			expect(specifiers, `${file} reaches the wasm artifact`).not.toContain('@quillmark/wasm');
		}
	});
});
