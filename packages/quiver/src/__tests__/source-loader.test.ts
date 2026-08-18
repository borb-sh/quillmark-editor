import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { scanSourceQuiver, readQuillTree } from '../source-loader.js';

const SAMPLE_FIXTURE = new URL('./fixtures/sample-quiver', import.meta.url).pathname;

function makeTempDir(): string {
	return join(tmpdir(), `quiver-test-${randomUUID()}`);
}

async function buildMinimalQuiver(
	root: string,
	opts: {
		quiverYaml?: string;
		quills?: Array<{ name: string; version: string; hasQuillYaml?: boolean }>;
		noQuillsDir?: boolean;
	} = {}
): Promise<void> {
	await mkdir(root, { recursive: true });

	const quiverYaml = opts.quiverYaml ?? 'name: test\n';
	await writeFile(join(root, 'Quiver.yaml'), quiverYaml);

	if (!opts.noQuillsDir) {
		const quillsDir = join(root, 'quills');
		await mkdir(quillsDir, { recursive: true });

		for (const { name, version, hasQuillYaml = true } of opts.quills ?? []) {
			const versionDir = join(quillsDir, name, version);
			await mkdir(versionDir, { recursive: true });
			if (hasQuillYaml) {
				await writeFile(join(versionDir, 'Quill.yaml'), `name: ${name}\n`);
			}
			await writeFile(join(versionDir, 'template.typ'), '// content\n');
		}
	}
}

describe('scanSourceQuiver', () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		for (const dir of tempDirs.splice(0)) {
			await rm(dir, { recursive: true, force: true });
		}
	});

	// --- Fixture happy path ---

	it("scans sample fixture: meta name is 'sample'", async () => {
		const { meta } = await scanSourceQuiver(SAMPLE_FIXTURE);
		expect(meta.name).toBe('sample');
	});

	it('scans sample fixture: catalog has memo with [1.1.0, 1.0.0] descending', async () => {
		const { catalog } = await scanSourceQuiver(SAMPLE_FIXTURE);
		expect(catalog.get('memo')).toEqual(['1.1.0', '1.0.0']);
	});

	// --- Non-canonical version dir ---

	it("throws quiver_invalid for non-canonical version dir '1.0' (missing patch)", async () => {
		const root = makeTempDir();
		tempDirs.push(root);
		await buildMinimalQuiver(root, {
			quills: [{ name: 'myquill', version: '1.0' }]
		});

		await expect(scanSourceQuiver(root)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});

	// --- Missing Quill.yaml ---

	it('throws quiver_invalid when Quill.yaml is missing in a version dir', async () => {
		const root = makeTempDir();
		tempDirs.push(root);
		await buildMinimalQuiver(root, {
			quills: [{ name: 'myquill', version: '1.0.0', hasQuillYaml: false }]
		});

		await expect(scanSourceQuiver(root)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});

	// --- Missing quills/ directory ---

	it('returns empty catalog when quills/ dir is absent', async () => {
		const root = makeTempDir();
		tempDirs.push(root);
		await buildMinimalQuiver(root, { noQuillsDir: true });

		const { catalog } = await scanSourceQuiver(root);
		expect(catalog.size).toBe(0);
	});

	// --- Missing Quiver.yaml ---

	it('throws transport_error when Quiver.yaml is missing', async () => {
		// ENOENT on Quiver.yaml is transport_error (missing-path condition) — the
		// path doesn't point to a quiver at all, not a structural violation within
		// one. Contrast: missing Quill.yaml inside a version dir is quiver_invalid.
		const root = makeTempDir();
		tempDirs.push(root);
		await mkdir(root, { recursive: true });
		// No Quiver.yaml written

		await expect(scanSourceQuiver(root)).rejects.toThrow(
			expect.objectContaining({ code: 'transport_error' })
		);
	});

	// --- Invalid Quiver.yaml content ---

	it('throws quiver_invalid when Quiver.yaml has unknown fields', async () => {
		const root = makeTempDir();
		tempDirs.push(root);
		await buildMinimalQuiver(root, { quiverYaml: 'name: test\nextra: bad\n' });

		await expect(scanSourceQuiver(root)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});
});

describe('readQuillTree', () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		for (const dir of tempDirs.splice(0)) {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('reads memo/1.0.0 from fixture with POSIX-style keys', async () => {
		const quillDir = join(SAMPLE_FIXTURE, 'quills', 'memo', '1.0.0');
		const tree = await readQuillTree(quillDir);
		expect(tree.has('Quill.yaml')).toBe(true);
		expect(tree.has('template.typ')).toBe(true);
	});

	it('reads nested files with forward-slash POSIX paths', async () => {
		const root = makeTempDir();
		tempDirs.push(root);
		await mkdir(join(root, 'subdir'), { recursive: true });
		await writeFile(join(root, 'Quill.yaml'), 'name: x\n');
		await writeFile(join(root, 'subdir', 'asset.svg'), '<svg/>');

		const tree = await readQuillTree(root);
		expect(tree.has('subdir/asset.svg')).toBe(true);
		expect(tree.has('Quill.yaml')).toBe(true);
	});

	it('throws transport_error when directory does not exist', async () => {
		await expect(readQuillTree('/nonexistent/path/quill')).rejects.toThrow(
			expect.objectContaining({ code: 'transport_error' })
		);
	});
});

describe('the symlink refusal', () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		for (const dir of tempDirs.splice(0)) {
			await rm(dir, { recursive: true, force: true });
		}
	});

	/** A quiver holding one quill, plus `secret.txt` beside the root for a link to reach. */
	async function quiverWithOutsideFile(): Promise<{ root: string; secret: string }> {
		const base = makeTempDir();
		tempDirs.push(base);
		const root = join(base, 'quiver');
		await buildMinimalQuiver(root, { quills: [{ name: 'memo', version: '1.0.0' }] });
		const secret = join(base, 'secret.txt');
		await writeFile(secret, 'SECRET\n');
		return { root, secret };
	}

	it('refuses a linked file rather than reading what it points at', async () => {
		// Followed, the target is quill content: the backend can typeset it and
		// `build` packs it into the published artifact.
		const { root, secret } = await quiverWithOutsideFile();
		const quillDir = join(root, 'quills', 'memo', '1.0.0');
		await symlink(secret, join(quillDir, 'stolen.txt'));

		await expect(readQuillTree(quillDir)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});

	it('refuses a linked directory, which smuggles a tree rather than a file', async () => {
		const { root } = await quiverWithOutsideFile();
		const quillDir = join(root, 'quills', 'memo', '1.0.0');
		await mkdir(join(root, 'outside'), { recursive: true });
		await writeFile(join(root, 'outside', 'a.txt'), 'x\n');
		await symlink(join(root, 'outside'), join(quillDir, 'assets'));

		await expect(readQuillTree(quillDir)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});

	it('refuses a linked quill directory at the scan', async () => {
		const { root } = await quiverWithOutsideFile();
		await symlink(join(root, 'quills', 'memo'), join(root, 'quills', 'alias'));

		await expect(scanSourceQuiver(root)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});

	it('refuses a linked version directory at the scan', async () => {
		const { root } = await quiverWithOutsideFile();
		const memo = join(root, 'quills', 'memo');
		await symlink(join(memo, '1.0.0'), join(memo, '2.0.0'));

		await expect(scanSourceQuiver(root)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});

	it('leaves an ordinary tree alone', async () => {
		const { root } = await quiverWithOutsideFile();
		const { catalog } = await scanSourceQuiver(root);
		expect(catalog.get('memo')).toEqual(['1.0.0']);
	});
});

describe('the quill-name charset', () => {
	const tempDirs: string[] = [];

	afterEach(async () => {
		for (const dir of tempDirs.splice(0)) {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it('refuses a directory name no ref can spell', async () => {
		// Seated, it would be a quill `quillNames` lists and `getQuill` refuses.
		const root = makeTempDir();
		tempDirs.push(root);
		await buildMinimalQuiver(root, { quills: [{ name: 'my.quill', version: '1.0.0' }] });

		await expect(scanSourceQuiver(root)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});

	it('admits the charset a ref spells', async () => {
		const root = makeTempDir();
		tempDirs.push(root);
		await buildMinimalQuiver(root, {
			quills: [{ name: 'Memo_2-b', version: '1.0.0' }]
		});

		const { catalog } = await scanSourceQuiver(root);
		expect(catalog.get('Memo_2-b')).toEqual(['1.0.0']);
	});
});
