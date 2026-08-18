import { describe, it, expect, afterEach } from 'vitest';
import { mkdir, rm, writeFile, readFile, access, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { buildQuiver } from '../build.js';
import { unpackFiles } from '../bundle.js';
import { NAME_DIGEST_WIDTH, sha256Hex } from '../digest.js';
import { MANIFEST_VERSION, POINTER_FORMAT } from '../format.js';

const SAMPLE_FIXTURE = new URL('./fixtures/sample-quiver', import.meta.url).pathname;

// ─── Helpers ────────────────────────────────────────────────────────────────

function tempDir(): string {
	return join(tmpdir(), `quiver-pack-test-${randomUUID()}`);
}

/**
 * Build a minimal Source Quiver programmatically.
 * If `fonts` is provided for a quill entry, those files are written as font
 * bytes (same content for dedup testing).
 */
async function seedSourceQuiver(
	root: string,
	opts: {
		name?: string;
		quills: Array<{
			name: string;
			version: string;
			fonts?: Array<{ path: string; content: Uint8Array }>;
		}>;
	}
): Promise<void> {
	await mkdir(root, { recursive: true });
	await writeFile(join(root, 'Quiver.yaml'), `name: ${opts.name ?? 'test'}\n`);
	for (const q of opts.quills) {
		const dir = join(root, 'quills', q.name, q.version);
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, 'Quill.yaml'), `name: ${q.name}\n`);
		await writeFile(join(dir, 'template.typ'), `// ${q.name} ${q.version}\n`);
		for (const font of q.fonts ?? []) {
			const fontPath = join(dir, font.path);
			await mkdir(join(dir, 'fonts'), { recursive: true }).catch(() => {});
			await writeFile(fontPath, font.content);
		}
	}
}

/** The manifest the pointer names, parsed. */
async function manifestOf(out: string): Promise<Record<string, unknown>> {
	const ptr = JSON.parse(await readFile(join(out, 'latest.json'), 'utf-8')) as {
		manifest: string;
	};
	return JSON.parse(await readFile(join(out, ptr.manifest), 'utf-8')) as Record<string, unknown>;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('buildQuiver — happy path (sample-quiver fixture)', () => {
	const tmpDirs: string[] = [];

	afterEach(async () => {
		for (const d of tmpDirs.splice(0)) {
			await rm(d, { recursive: true, force: true });
		}
	});

	it('stamps the format the tree is written in', async () => {
		// The one thing a client of any age reads first, so a tree from a newer builder
		// is refused by name rather than misread field by field.
		const out = tempDir();
		tmpDirs.push(out);
		await buildQuiver(SAMPLE_FIXTURE, out);

		const pointer = JSON.parse(await readFile(join(out, 'latest.json'), 'utf-8')) as {
			format: number;
		};
		expect(pointer.format).toBe(POINTER_FORMAT);
	});
});

describe('buildQuiver — font dehydration & deduplication', () => {
	const tmpDirs: string[] = [];

	afterEach(async () => {
		for (const d of tmpDirs.splice(0)) {
			await rm(d, { recursive: true, force: true });
		}
	});

	it('stores the shared font exactly once in store/', async () => {
		const src = tempDir();
		const out = tempDir();
		tmpDirs.push(src, out);

		const sharedFontBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

		await seedSourceQuiver(src, {
			name: 'font-test',
			quills: [
				{
					name: 'quillA',
					version: '1.0.0',
					fonts: [{ path: 'fonts/font.ttf', content: sharedFontBytes }]
				},
				{
					name: 'quillB',
					version: '1.0.0',
					fonts: [{ path: 'fonts/font.ttf', content: sharedFontBytes }]
				}
			]
		});

		await buildQuiver(src, out);

		const { readdir } = await import('node:fs/promises');
		const storeEntries = await readdir(join(out, 'store'));
		expect(storeEntries).toHaveLength(1);
	});

	it('bundle zip does NOT contain the font file', async () => {
		const src = tempDir();
		const out = tempDir();
		tmpDirs.push(src, out);

		const fontBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

		await seedSourceQuiver(src, {
			name: 'font-test',
			quills: [
				{
					name: 'quillA',
					version: '1.0.0',
					fonts: [{ path: 'fonts/font.otf', content: fontBytes }]
				}
			]
		});

		await buildQuiver(src, out);

		const ptr = JSON.parse(await readFile(join(out, 'latest.json'), 'utf-8')) as {
			manifest: string;
		};
		const manifest = JSON.parse(await readFile(join(out, ptr.manifest), 'utf-8')) as {
			quills: Array<{ bundle: string }>;
		};

		const bundleBytes = await readFile(join(out, manifest.quills[0]!.bundle));
		const bundleFiles = unpackFiles(bundleBytes);

		expect(Object.keys(bundleFiles)).toContain('Quill.yaml');
		expect(Object.keys(bundleFiles)).not.toContain('fonts/font.otf');
	});

	it("carries Quiver.yaml's description into the manifest", async () => {
		const out = tempDir();
		tmpDirs.push(out);
		await buildQuiver(SAMPLE_FIXTURE, out);

		const manifest = await manifestOf(out);
		expect(manifest.version).toBe(MANIFEST_VERSION);
		expect(manifest.description).toBe('A sample quiver for testing');
	});

	it('omits the description a Quiver.yaml does not carry', async () => {
		const src = tempDir();
		const out = tempDir();
		tmpDirs.push(src, out);
		await seedSourceQuiver(src, { quills: [{ name: 'quillA', version: '1.0.0' }] });
		await buildQuiver(src, out);

		expect(await manifestOf(out)).not.toHaveProperty('description');
	});
});

describe('buildQuiver — determinism', () => {
	const tmpDirs: string[] = [];

	afterEach(async () => {
		for (const d of tmpDirs.splice(0)) {
			await rm(d, { recursive: true, force: true });
		}
	});

	it('packing the same source twice yields an identical manifest filename', async () => {
		const out1 = tempDir();
		const out2 = tempDir();
		tmpDirs.push(out1, out2);

		await buildQuiver(SAMPLE_FIXTURE, out1);
		await buildQuiver(SAMPLE_FIXTURE, out2);

		const ptr1 = JSON.parse(await readFile(join(out1, 'latest.json'), 'utf-8')) as {
			manifest: string;
		};
		const ptr2 = JSON.parse(await readFile(join(out2, 'latest.json'), 'utf-8')) as {
			manifest: string;
		};

		expect(ptr1.manifest).toBe(ptr2.manifest);
	});
});

describe('buildQuiver — I/O error', () => {
	const tmpDirs: string[] = [];

	afterEach(async () => {
		for (const d of tmpDirs.splice(0)) {
			await rm(d, { recursive: true, force: true });
		}
	});

	it('throws transport_error when outDir parent path is a file, not a directory', async () => {
		// Using a file-as-path-segment (ENOTDIR) works regardless of uid — a
		// chmod-based read-only fixture is bypassed by root, so it can't be
		// relied on in containerized test environments.
		const parentFile = tempDir();
		tmpDirs.push(parentFile);

		await writeFile(parentFile, 'not a directory');

		const out = join(parentFile, 'out');

		await expect(buildQuiver(SAMPLE_FIXTURE, out)).rejects.toThrow(
			expect.objectContaining({ code: 'transport_error' })
		);
	});
});

describe('buildQuiver — the generation lands whole', () => {
	// What a repack loop and a deploy both read under. A build takes seconds, so a
	// window inside one is a window a client lands in.
	const tmpDirs: string[] = [];

	afterEach(async () => {
		for (const d of tmpDirs.splice(0)) {
			await rm(d, { recursive: true, force: true });
		}
	});

	/** The pointer's manifest name, which moves whenever the packed content does. */
	async function pointerOf(out: string): Promise<string> {
		const raw = await readFile(join(out, 'latest.json'), 'utf-8');
		return (JSON.parse(raw) as { manifest: string }).manifest;
	}

	it('leaves no staging tree behind', async () => {
		// The two siblings hold a generation mid-assembly and the one it replaced.
		// Both are gone by the time a build resolves, so a repack loop does not grow
		// a disk.
		const out = join(tempDir(), 'quiver');
		tmpDirs.push(out, `${out}.stage`, `${out}.prev`);
		await buildQuiver(SAMPLE_FIXTURE, out);
		await buildQuiver(SAMPLE_FIXTURE, out);

		await expect(access(`${out}.stage`)).rejects.toThrow();
		await expect(access(`${out}.prev`)).rejects.toThrow();
	});

	it('replaces the previous generation rather than merging with it', async () => {
		const out = tempDir();
		tmpDirs.push(out);
		await buildQuiver(SAMPLE_FIXTURE, out);
		await writeFile(join(out, 'stale.txt'), 'from a previous build');
		await buildQuiver(SAMPLE_FIXTURE, out);

		await expect(access(join(out, 'stale.txt'))).rejects.toThrow();
		// Every name the pointer reaches has landed: a whole tree moves in, so a
		// client never reads a manifest whose bundles are not there yet.
		const manifest = JSON.parse(await readFile(join(out, await pointerOf(out)), 'utf-8')) as {
			quills: Array<{ bundle: string }>;
		};
		expect(manifest.quills.length).toBeGreaterThan(0);
		for (const quill of manifest.quills) await access(join(out, quill.bundle));
	});

	it('a failed build leaves the last good generation serving', async () => {
		// A quiver mid-edit is invalid as often as not, and the loop that repacks on
		// every save is exactly where that lands.
		const src = tempDir();
		const out = tempDir();
		tmpDirs.push(src, out);
		await seedSourceQuiver(src, { quills: [{ name: 'memo', version: '1.0.0' }] });
		await buildQuiver(src, out);
		const good = await pointerOf(out);

		await writeFile(join(src, 'Quiver.yaml'), 'name: [unclosed');
		await expect(buildQuiver(src, out)).rejects.toThrow();
		expect(await pointerOf(out)).toBe(good);

		await writeFile(join(src, 'Quiver.yaml'), 'name: recovered\n');
		await buildQuiver(src, out);
		expect(await pointerOf(out)).not.toBe(good);
	});
});

describe('buildQuiver — outDir guard', () => {
	// The build clears outDir first, so these are the paths where a typo would
	// delete the caller. Each asserts the source survives: the guard has to fire
	// before the rm, not after.
	const tmpDirs: string[] = [];

	afterEach(async () => {
		for (const d of tmpDirs.splice(0)) {
			await rm(d, { recursive: true, force: true });
		}
	});

	it('refuses an outDir equal to the source quiver', async () => {
		const src = tempDir();
		tmpDirs.push(src);
		await seedSourceQuiver(src, { quills: [{ name: 'memo', version: '1.0.0' }] });

		await expect(buildQuiver(src, src)).rejects.toThrow(
			expect.objectContaining({ code: 'transport_error' })
		);
		await access(join(src, 'Quiver.yaml'));
	});

	it('refuses an outDir that is an ancestor of the source quiver', async () => {
		const parent = tempDir();
		const src = join(parent, 'quiver');
		tmpDirs.push(parent);
		await seedSourceQuiver(src, { quills: [{ name: 'memo', version: '1.0.0' }] });

		await expect(buildQuiver(src, parent)).rejects.toThrow(
			expect.objectContaining({ code: 'transport_error' })
		);
		await access(join(src, 'Quiver.yaml'));
	});

	it('refuses an outDir that is the working directory', async () => {
		// A source outside the cwd, so only the cwd rule can fire.
		const src = tempDir();
		tmpDirs.push(src);
		await seedSourceQuiver(src, { quills: [{ name: 'memo', version: '1.0.0' }] });

		await expect(buildQuiver(src, '.')).rejects.toThrow(
			expect.objectContaining({ code: 'transport_error' })
		);
		await access(join(process.cwd(), 'package.json'));
	});

	it('allows an outDir nested inside the source quiver', async () => {
		const src = tempDir();
		tmpDirs.push(src);
		await seedSourceQuiver(src, { quills: [{ name: 'memo', version: '1.0.0' }] });

		await buildQuiver(src, join(src, 'dist'));
		await access(join(src, 'dist', 'latest.json'));
	});
});

describe('buildQuiver — every name carries the digest of its own bytes', () => {
	// What the loader checks on fetch. If the build's hash and the loader's ever
	// disagree, nothing downstream loads at all, so the round trip is pinned here
	// rather than at each end separately.
	const tmpDirs: string[] = [];

	afterEach(async () => {
		for (const d of tmpDirs.splice(0)) {
			await rm(d, { recursive: true, force: true });
		}
	});

	it('manifest, bundle, and store names are SHA-256 of their contents', async () => {
		const src = tempDir();
		const out = tempDir();
		tmpDirs.push(src, out);

		await seedSourceQuiver(src, {
			quills: [
				{
					name: 'memo',
					version: '1.0.0',
					fonts: [{ path: 'fonts/body.ttf', content: new Uint8Array([1, 2, 3, 4]) }]
				}
			]
		});
		await buildQuiver(src, out);

		const pointer = JSON.parse(await readFile(join(out, 'latest.json'), 'utf-8')) as {
			manifest: string;
		};
		const manifestBytes = new Uint8Array(await readFile(join(out, pointer.manifest)));
		const manifest = JSON.parse(new TextDecoder().decode(manifestBytes)) as {
			quills: Array<{ bundle: string; fonts: Record<string, string> }>;
		};

		const digestOf = async (bytes: Uint8Array) => (await sha256Hex(bytes))!;
		const short = (hex: string) => hex.slice(0, NAME_DIGEST_WIDTH);

		expect(pointer.manifest).toBe(`manifest.${short(await digestOf(manifestBytes))}.json`);

		const [entry] = manifest.quills;
		const zipBytes = new Uint8Array(await readFile(join(out, entry!.bundle)));
		expect(entry!.bundle).toBe(`memo@1.0.0.${short(await digestOf(zipBytes))}.zip`);

		const fontHash = entry!.fonts['fonts/body.ttf']!;
		const fontBytes = new Uint8Array(await readFile(join(out, 'store', fontHash)));
		// Full width, not truncated: the store is keyed by hash, so two distinct
		// fonts sharing a prefix would merge into one entry.
		expect(fontHash).toBe(await digestOf(fontBytes));
		expect(fontHash).toHaveLength(64);

		// The width answers a chosen prefix (`digest.ts`), so it is the claim rather
		// than an artifact of the slice above: 12 hex chars is grindable.
		expect(NAME_DIGEST_WIDTH).toBe(32);
		expect(pointer.manifest).toMatch(/^manifest\.[0-9a-f]{32}\.json$/);
		expect(entry!.bundle).toMatch(/^memo@1\.0\.0\.[0-9a-f]{32}\.zip$/);
	});
});

describe('buildQuiver — the draft floor', () => {
	const tmpDirs: string[] = [];

	afterEach(async () => {
		for (const d of tmpDirs.splice(0)) {
			await rm(d, { recursive: true, force: true });
		}
	});

	/** `<name>@<version>` for every quill the manifest carries. */
	async function refsOf(out: string): Promise<string[]> {
		const manifest = await manifestOf(out);
		const quills = manifest['quills'] as Array<{ name: string; version: string }>;
		return quills.map((q) => `${q.name}@${q.version}`).sort();
	}

	it('leaves versions below 0.1.0 out of the manifest', async () => {
		const src = tempDir();
		const out = tempDir();
		tmpDirs.push(src, out);
		await seedSourceQuiver(src, {
			quills: [
				{ name: 'memo', version: '0.0.9' },
				{ name: 'memo', version: '1.0.0' }
			]
		});

		await buildQuiver(src, out);

		expect(await refsOf(out)).toEqual(['memo@1.0.0']);
	});

	it('drops a quill whose every version is a draft', async () => {
		const src = tempDir();
		const out = tempDir();
		tmpDirs.push(src, out);
		await seedSourceQuiver(src, {
			quills: [
				{ name: 'draft-only', version: '0.0.1' },
				{ name: 'memo', version: '1.0.0' }
			]
		});

		await buildQuiver(src, out);

		expect(await refsOf(out)).toEqual(['memo@1.0.0']);
	});

	it('writes no bundle for a version it left out', async () => {
		// The manifest is the catalog, but an unreferenced bundle beside it would
		// still be a draft served off the artifact's own origin.
		const src = tempDir();
		const out = tempDir();
		tmpDirs.push(src, out);
		await seedSourceQuiver(src, { quills: [{ name: 'memo', version: '0.0.1' }] });

		await buildQuiver(src, out);

		const names = await readdir(out);
		expect(names.filter((n) => n.endsWith('.zip'))).toEqual([]);
	});

	it('keeps 0.1.0 itself — the floor is the lowest published version', async () => {
		const src = tempDir();
		const out = tempDir();
		tmpDirs.push(src, out);
		await seedSourceQuiver(src, { quills: [{ name: 'memo', version: '0.1.0' }] });

		await buildQuiver(src, out);

		expect(await refsOf(out)).toEqual(['memo@0.1.0']);
	});

	it('packs drafts under { drafts: true }', async () => {
		const src = tempDir();
		const out = tempDir();
		tmpDirs.push(src, out);
		await seedSourceQuiver(src, {
			quills: [
				{ name: 'memo', version: '0.0.9' },
				{ name: 'memo', version: '1.0.0' }
			]
		});

		await buildQuiver(src, out, { drafts: true });

		expect(await refsOf(out)).toEqual(['memo@0.0.9', 'memo@1.0.0']);
	});

	it('builds an empty catalog rather than throwing when every quill is a draft', async () => {
		// A quiver whose quills are all under the floor is a valid quiver that
		// publishes nothing, so the pointer lands and names an empty manifest.
		const src = tempDir();
		const out = tempDir();
		tmpDirs.push(src, out);
		await seedSourceQuiver(src, { quills: [{ name: 'memo', version: '0.0.1' }] });

		await buildQuiver(src, out);

		expect(await refsOf(out)).toEqual([]);
		await expect(access(join(out, 'latest.json'))).resolves.toBeUndefined();
	});
});
