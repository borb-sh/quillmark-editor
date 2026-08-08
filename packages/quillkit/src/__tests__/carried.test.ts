/**
 * The stamp a bundle carries. Every form is measured against a real checkout rather than
 * asserted from the shape of the string: what the stamp is FOR is a consumer holding a
 * tarball nobody can `npm ls`, so a form that reads right and counts wrong is the failure
 * this suite exists to catch.
 *
 * The scratch workspaces are two package manifests and a git history, which is the whole
 * of what `carried()` reads for a sibling. `@quillmark/wasm` it resolves, so the
 * workspace's `node_modules` is linked in beside them.
 */

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { carried, line } from '../../../../scripts/carried.mjs';
import { scratch } from './helpers/collection.js';

const WORKSPACE = fileURLToPath(new URL('../../../..', import.meta.url));
const WORKSPACE_MODULES = join(WORKSPACE, 'node_modules');

const files = scratch('quillkit-carried-');
afterAll(() => files.cleanup());

const git = (at: string, ...args: string[]): string =>
	execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
		cwd: at,
		encoding: 'utf8'
	}).trim();

/** A workspace holding the two siblings at the given versions, uncommitted. */
async function workspace(svelte: string, quiver: string): Promise<string> {
	const at = await files.dir();
	await writeFile(join(at, 'package.json'), JSON.stringify({ name: 'w', private: true }));
	await mkdir(join(at, 'node_modules'), { recursive: true });
	await symlink(join(WORKSPACE_MODULES, '@quillmark'), join(at, 'node_modules', '@quillmark'));

	for (const [dir, version] of [
		['svelte', svelte],
		['quiver', quiver]
	]) {
		await mkdir(join(at, 'packages', dir, 'src'), { recursive: true });
		await mkdir(join(at, 'packages', dir, 'prose'), { recursive: true });
		await writeFile(
			join(at, 'packages', dir, 'package.json'),
			JSON.stringify({ name: `@quillmark/${dir}`, version })
		);
		await writeFile(join(at, 'packages', dir, 'src', 'index.ts'), 'export {};\n');
		await writeFile(join(at, 'packages', dir, 'prose', 'NOTES.md'), '# notes\n');
	}
	return at;
}

/** Commit everything currently in the tree. */
function commit(at: string, message: string): void {
	git(at, 'add', '-A');
	git(at, 'commit', '-m', message);
}

const head = (at: string): string => git(at, 'rev-parse', '--short', 'HEAD');

describe('carried', () => {
	it('stamps a version bare when nothing under the shipped paths has moved since its tag', async () => {
		const at = await workspace('0.1.0', '0.19.0');
		git(at, 'init', '-q');
		commit(at, 'first');
		git(at, 'tag', 'svelte-v0.1.0');
		git(at, 'tag', 'quiver-v0.19.0');

		expect(carried(at)).toMatchObject({
			'@quillmark/svelte': '0.1.0',
			'@quillmark/quiver': '0.19.0'
		});
	});

	it('names the distance and the commit when a sibling is ahead of its tag', async () => {
		const at = await workspace('0.1.0', '0.19.0');
		git(at, 'init', '-q');
		commit(at, 'first');
		git(at, 'tag', 'svelte-v0.1.0');
		git(at, 'tag', 'quiver-v0.19.0');

		await writeFile(join(at, 'packages', 'svelte', 'src', 'index.ts'), 'export const a = 1;\n');
		commit(at, 'second');
		await writeFile(join(at, 'packages', 'svelte', 'src', 'b.ts'), 'export const b = 2;\n');
		commit(at, 'third');

		const what = carried(at);
		expect(what['@quillmark/svelte']).toBe(`0.1.0+2.${head(at)}`);
		// Its own tag, its own commits: the pathspec is per package.
		expect(what['@quillmark/quiver']).toBe('0.19.0');
	});

	it('does not count a commit that touches only paths no bundle reaches', async () => {
		const at = await workspace('0.1.0', '0.19.0');
		git(at, 'init', '-q');
		commit(at, 'first');
		git(at, 'tag', 'svelte-v0.1.0');

		await writeFile(join(at, 'packages', 'svelte', 'prose', 'NOTES.md'), '# more notes\n');
		await writeFile(join(at, 'packages', 'svelte', 'CHANGELOG.md'), '# changelog\n');
		commit(at, 'prose only');

		expect(carried(at)['@quillmark/svelte']).toBe('0.1.0');
	});

	it('says untagged where there is no tag to measure against', async () => {
		const at = await workspace('0.0.0', '0.19.0');
		git(at, 'init', '-q');
		commit(at, 'first');

		expect(carried(at)['@quillmark/svelte']).toBe(`0.0.0+untagged.${head(at)}`);
	});

	it('says nogit outside a checkout', async () => {
		const at = await workspace('0.1.0', '0.19.0');

		expect(carried(at)).toMatchObject({
			'@quillmark/svelte': '0.1.0+nogit',
			'@quillmark/quiver': '0.19.0+nogit'
		});
	});

	it('stamps the resolved engine bare', async () => {
		const at = await workspace('0.1.0', '0.19.0');
		const wasm = JSON.parse(
			await readFile(join(WORKSPACE_MODULES, '@quillmark', 'wasm', 'package.json'), 'utf8')
		);

		expect(carried(at)['@quillmark/wasm']).toBe(wasm.version);
	});

	it('renders one sentence naming all three', () => {
		expect(line({ '@quillmark/svelte': '0.1.0', '@quillmark/wasm': '0.102.0' })).toBe(
			'Carries `@quillmark/svelte` 0.1.0, `@quillmark/wasm` 0.102.0.'
		);
	});
});

describe('the built client', () => {
	it('carries the stamp beside the bundle', async () => {
		const at = join(WORKSPACE, 'packages', 'quillkit', 'dist', 'client', 'carried.json');

		expect(JSON.parse(await readFile(at, 'utf8'))).toEqual(carried());
	});
});
