/**
 * Tests for built-loader.ts — all scenarios use an in-memory mock transport
 * so no filesystem or network is needed.
 *
 * Fixtures are content-addressed the way `build` writes them: a name carries
 * the digest of its own bytes, and the loader checks it on fetch. A fixture
 * whose name lies about its bytes is therefore a tamper case, not a shortcut,
 * and the ones below that do it say so.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { loadBuiltQuiver } from '../built-loader.js';
import { packFiles } from '../bundle.js';
import { NAME_DIGEST_LENGTH, sha256Hex } from '../digest.js';
import { QuiverError } from '../errors.js';
import { MANIFEST_VERSION, POINTER_FORMAT } from '../format.js';
import type { BuiltTransport, FetchOptions } from '../built-loader.js';
import { mockQuillFromTree } from './helpers/mock-engine.js';

// The Quiver tree path is private (`getQuill` → the loader). To observe the
// tree the loader produced, stub `Quill.fromTree` and read the tree it was
// handed; `getQuill` resolves the ref and drives the same loader.
let treeStub: ReturnType<typeof mockQuillFromTree> | undefined;
afterEach(() => {
	treeStub?.restore();
	treeStub = undefined;
});

/** Drives the loader via `getQuill` and returns the tree fed to Quill.fromTree. */
async function loadTreeViaGetQuill(
	quiver: { getQuill: (ref: string) => Promise<unknown> },
	name: string,
	version: string
): Promise<Map<string, Uint8Array>> {
	treeStub ??= mockQuillFromTree();
	const before = treeStub.calls.length;
	await quiver.getQuill(`${name}@${version}`);
	return treeStub.calls[before]!;
}

// ─── In-memory mock transport ─────────────────────────────────────────────────

class MemTransport implements BuiltTransport {
	private readonly store: Map<string, Uint8Array>;
	readonly fetchLog: string[] = [];
	readonly revalidated: string[] = [];

	constructor(entries: Record<string, Uint8Array>) {
		this.store = new Map(Object.entries(entries));
	}

	async fetchBytes(relativePath: string, opts?: FetchOptions): Promise<Uint8Array> {
		this.fetchLog.push(relativePath);
		if (opts?.revalidate === true) this.revalidated.push(relativePath);
		const bytes = this.store.get(relativePath);
		if (bytes === undefined) {
			throw new QuiverError('transport_error', `MemTransport: not found: "${relativePath}"`);
		}
		return bytes;
	}

	set(path: string, bytes: Uint8Array): void {
		this.store.set(path, bytes);
	}

	delete(path: string): void {
		this.store.delete(path);
	}
}

// ─── Fixture builders ─────────────────────────────────────────────────────────

const enc = new TextEncoder();

/** The full digest, as a font store entry is keyed. */
async function fullDigest(bytes: Uint8Array): Promise<string> {
	return (await sha256Hex(bytes))!;
}

/** The truncated digest a bundle or manifest filename carries. */
async function nameDigest(bytes: Uint8Array): Promise<string> {
	return (await fullDigest(bytes)).slice(0, NAME_DIGEST_LENGTH);
}

function makeBundle(files: Record<string, string>): Uint8Array {
	const input: Record<string, Uint8Array> = {};
	for (const [k, v] of Object.entries(files)) {
		input[k] = enc.encode(v);
	}
	return packFiles(input);
}

function makePointer(manifestFileName: string): Uint8Array {
	return enc.encode(JSON.stringify({ manifest: manifestFileName }));
}

interface QuillSpec {
	name: string;
	version: string;
	/** Content files, zipped into the bundle. */
	files?: Record<string, string>;
	/** Dehydrated fonts, keyed by their path in the quill tree. */
	fonts?: Record<string, Uint8Array>;
}

interface Artifact {
	transport: MemTransport;
	manifestBytes: Uint8Array;
	manifestFileName: string;
	/** "name@version" → the bundle filename the manifest points at. */
	bundles: Record<string, string>;
}

/**
 * A packed artifact whose every name is the digest of its own bytes: the shape
 * `build` writes.
 */
async function makeArtifact(quiverName: string, quills: QuillSpec[]): Promise<Artifact> {
	const entries: Record<string, Uint8Array> = {};
	const bundles: Record<string, string> = {};
	const manifestQuills = [];

	for (const q of quills) {
		const zip = makeBundle(q.files ?? { 'Quill.yaml': `name: ${q.name}\n` });
		const bundle = `${q.name}@${q.version}.${await nameDigest(zip)}.zip`;
		entries[bundle] = zip;
		bundles[`${q.name}@${q.version}`] = bundle;

		const fonts: Record<string, string> = {};
		for (const [path, bytes] of Object.entries(q.fonts ?? {})) {
			const hash = await fullDigest(bytes);
			entries[`store/${hash}`] = bytes;
			fonts[path] = hash;
		}

		manifestQuills.push({ name: q.name, version: q.version, bundle, fonts });
	}

	const manifestBytes = enc.encode(
		JSON.stringify({ version: 1, name: quiverName, quills: manifestQuills })
	);
	const manifestFileName = `manifest.${await nameDigest(manifestBytes)}.json`;
	entries[manifestFileName] = manifestBytes;
	entries['latest.json'] = makePointer(manifestFileName);

	return { transport: new MemTransport(entries), manifestBytes, manifestFileName, bundles };
}

/**
 * A pointer plus a manifest of arbitrary shape, named after its own bytes so
 * the fetch verifies and the manifest parser is what rejects it.
 */
async function transportWith(manifest: Record<string, unknown>): Promise<MemTransport> {
	const bytes = enc.encode(JSON.stringify(manifest));
	const name = `manifest.${await nameDigest(bytes)}.json`;
	return new MemTransport({ 'latest.json': makePointer(name), [name]: bytes });
}

/** The minimal three-quill fixture most tests below run against. */
function buildMinimalArtifact(): Promise<Artifact> {
	return makeArtifact('sample', [
		{
			name: 'memo',
			version: '1.0.0',
			files: { 'Quill.yaml': 'name: memo\n', 'template.typ': '// memo 1.0.0\n' }
		},
		{ name: 'memo', version: '1.1.0' },
		{ name: 'resume', version: '2.0.0' }
	]);
}

async function loadMinimal() {
	return loadBuiltQuiver((await buildMinimalArtifact()).transport);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('loadBuiltQuiver — happy path', () => {
	it('quillNames() returns sorted quill names', async () => {
		expect((await loadMinimal()).quillNames()).toEqual(['memo', 'resume']);
	});

	it('versionsOf() returns versions sorted descending', async () => {
		const q = await loadMinimal();
		expect(q.versionsOf('memo')).toEqual(['1.1.0', '1.0.0']);
		expect(q.versionsOf('resume')).toEqual(['2.0.0']);
	});

	it("carries the manifest's description", async () => {
		const q = await loadBuiltQuiver(
			await transportWith({
				version: MANIFEST_VERSION,
				name: 'sample',
				description: 'A sample quiver',
				quills: []
			})
		);
		expect(q.description).toBe('A sample quiver');
	});

	// The fixtures are version 1, so this is the back-compat read too.
	it('a manifest without a description carries undefined', async () => {
		expect((await loadMinimal()).description).toBeUndefined();
	});
});

describe('loadBuiltQuiver — tree rehydration', () => {
	it('loaded tree has correct bytes for content files', async () => {
		const q = await loadMinimal();
		const tree = await loadTreeViaGetQuill(q, 'memo', '1.0.0');

		expect(new TextDecoder().decode(tree.get('Quill.yaml'))).toBe('name: memo\n');
	});

	it('rehydrates fonts at correct paths', async () => {
		const fontBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
		const { transport } = await makeArtifact('sample', [
			{ name: 'memo', version: '1.0.0', fonts: { 'fonts/body.ttf': fontBytes } }
		]);

		const q = await loadBuiltQuiver(transport);
		const tree = await loadTreeViaGetQuill(q, 'memo', '1.0.0');

		expect(tree.has('fonts/body.ttf')).toBe(true);
		expect(tree.get('fonts/body.ttf')).toEqual(fontBytes);
	});
});

describe('loadBuiltQuiver — content addressing is checked', () => {
	// The digest in a name is what makes "safe to cache forever" a property.
	// Each case swaps bytes behind a name the manifest already committed to: a
	// corrupted CDN object, a partial sync, a name reused across releases.

	it('bundle bytes that do not match the name in the manifest → transport_error', async () => {
		const { transport, bundles } = await makeArtifact('sample', [
			{ name: 'memo', version: '1.0.0' }
		]);
		transport.set(bundles['memo@1.0.0']!, makeBundle({ 'Quill.yaml': 'name: substituted\n' }));

		const q = await loadBuiltQuiver(transport);
		await expect(q.getQuill('memo@1.0.0')).rejects.toThrow(
			expect.objectContaining({ code: 'transport_error' })
		);
	});

	it('manifest bytes that do not match the pointer name → transport_error', async () => {
		const { transport, manifestFileName } = await buildMinimalArtifact();
		transport.set(manifestFileName, enc.encode('{"version":1,"name":"other","quills":[]}'));

		await expect(loadBuiltQuiver(transport)).rejects.toThrow(
			expect.objectContaining({ code: 'transport_error' })
		);
	});

	it('font bytes that do not match their store key → transport_error', async () => {
		const fontBytes = new Uint8Array([1, 2, 3, 4]);
		const { transport } = await makeArtifact('sample', [
			{ name: 'memo', version: '1.0.0', fonts: { 'fonts/body.ttf': fontBytes } }
		]);
		transport.set(`store/${await fullDigest(fontBytes)}`, new Uint8Array([9, 9, 9]));

		const q = await loadBuiltQuiver(transport);
		await expect(q.getQuill('memo@1.0.0')).rejects.toThrow(
			expect.objectContaining({ code: 'transport_error' })
		);
	});

	it('a retry after a mismatch refetches — the bad bytes are not cached', async () => {
		const fontBytes = new Uint8Array([1, 2, 3, 4]);
		const { transport } = await makeArtifact('sample', [
			{ name: 'memo', version: '1.0.0', fonts: { 'fonts/body.ttf': fontBytes } }
		]);
		const storePath = `store/${await fullDigest(fontBytes)}`;
		transport.set(storePath, new Uint8Array([9, 9, 9]));

		const q = await loadBuiltQuiver(transport);
		await expect(q.getQuill('memo@1.0.0')).rejects.toThrow(QuiverError);

		transport.set(storePath, fontBytes);
		const tree = await loadTreeViaGetQuill(q, 'memo', '1.0.0');
		expect(tree.get('fonts/body.ttf')).toEqual(fontBytes);
	});
});

describe('loadBuiltQuiver — the pointer revalidates', () => {
	it('asks the transport to revalidate latest.json and nothing else', async () => {
		const { transport } = await buildMinimalArtifact();
		const q = await loadBuiltQuiver(transport);
		await loadTreeViaGetQuill(q, 'memo', '1.0.0');

		expect(transport.revalidated).toEqual(['latest.json']);
		expect(transport.fetchLog.length).toBeGreaterThan(1);
	});
});

describe('loadBuiltQuiver — font coalescing', () => {
	it('two concurrent loadTree calls sharing a font fetch it exactly once', async () => {
		const fontBytes = new Uint8Array([1, 2, 3]);
		const { transport } = await makeArtifact('coalesce-test', [
			{ name: 'quillA', version: '1.0.0', fonts: { 'fonts/shared.ttf': fontBytes } },
			{ name: 'quillB', version: '1.0.0', fonts: { 'fonts/shared.ttf': fontBytes } }
		]);

		const q = await loadBuiltQuiver(transport);
		treeStub = mockQuillFromTree();

		// Fire both concurrently. Each getQuill drives the loader, which coalesces
		// the shared font fetch.
		await Promise.all([q.getQuill('quillA@1.0.0'), q.getQuill('quillB@1.0.0')]);

		const storeFetches = transport.fetchLog.filter((p) => p.startsWith('store/'));
		expect(storeFetches).toHaveLength(1);
	});
});

describe('loadBuiltQuiver — invalid pointer', () => {
	// Truncated bytes are what a partial sync of an immutable-CDN quiver leaves behind, and
	// the raw SyntaxError would escape every QuiverError handler downstream.
	it('latest.json that is not JSON → quiver_invalid', async () => {
		const transport = new MemTransport({
			'latest.json': enc.encode('{"manifest": "manifest.')
		});
		await expect(loadBuiltQuiver(transport)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});

	it('latest.json missing manifest field → quiver_invalid', async () => {
		const transport = new MemTransport({
			'latest.json': enc.encode(JSON.stringify({ other: 'value' }))
		});
		await expect(loadBuiltQuiver(transport)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});

	// The pointer is where a newer format announces itself, so it is the one document
	// here that reads past what it knows. A reader that rejected unknown keys could
	// never be told the format moved — it would fail on the telling.
	it('latest.json with an unknown field loads', async () => {
		const artifact = await buildMinimalArtifact();
		artifact.transport.set(
			'latest.json',
			enc.encode(JSON.stringify({ manifest: artifact.manifestFileName, aFieldFromLater: true }))
		);
		const quiver = await loadBuiltQuiver(artifact.transport);
		expect(quiver.quillNames()).toContain('memo');
	});

	it('a pointer with no format is this format', async () => {
		// What every build before the marker wrote, and what `makePointer` still writes.
		const quiver = await loadBuiltQuiver((await buildMinimalArtifact()).transport);
		expect(quiver.quillNames()).toContain('memo');
	});

	it('a format above this loader → quiver_invalid naming the upgrade', async () => {
		const artifact = await buildMinimalArtifact();
		artifact.transport.set(
			'latest.json',
			enc.encode(
				JSON.stringify({ format: POINTER_FORMAT + 1, manifest: artifact.manifestFileName })
			)
		);
		await expect(loadBuiltQuiver(artifact.transport)).rejects.toThrow(
			expect.objectContaining({
				code: 'quiver_invalid',
				message: expect.stringContaining('Upgrade @quillmark/quiver')
			})
		);
	});

	it('a non-integer format → quiver_invalid', async () => {
		const artifact = await buildMinimalArtifact();
		artifact.transport.set(
			'latest.json',
			enc.encode(JSON.stringify({ format: '1', manifest: artifact.manifestFileName }))
		);
		await expect(loadBuiltQuiver(artifact.transport)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});

	it('manifest filename carrying too short a digest → quiver_invalid', async () => {
		// Under-width names weaken the check they exist to carry, so they are
		// rejected rather than checked loosely.
		const transport = new MemTransport({
			'latest.json': makePointer('manifest.abc123.json')
		});
		await expect(loadBuiltQuiver(transport)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});
});

describe('loadBuiltQuiver — invalid manifest', () => {
	it('a version above the reader names the upgrade', async () => {
		await expect(
			loadBuiltQuiver(
				await transportWith({ version: MANIFEST_VERSION + 1, name: 'test', quills: [] })
			)
		).rejects.toThrow(
			expect.objectContaining({
				code: 'quiver_invalid',
				message: expect.stringContaining('Upgrade')
			})
		);
	});

	it('a non-integer version → quiver_invalid', async () => {
		await expect(
			loadBuiltQuiver(await transportWith({ version: '1', name: 'test', quills: [] }))
		).rejects.toThrow(expect.objectContaining({ code: 'quiver_invalid' }));
	});

	it('a non-string description → quiver_invalid', async () => {
		await expect(
			loadBuiltQuiver(
				await transportWith({
					version: MANIFEST_VERSION,
					name: 'test',
					description: 7,
					quills: []
				})
			)
		).rejects.toThrow(expect.objectContaining({ code: 'quiver_invalid' }));
	});

	it('unknown top-level field → quiver_invalid', async () => {
		await expect(
			loadBuiltQuiver(await transportWith({ version: 1, name: 'test', quills: [], extra: true }))
		).rejects.toThrow(expect.objectContaining({ code: 'quiver_invalid' }));
	});

	it('a quill entry named outside the ref charset → quiver_invalid', async () => {
		await expect(
			loadBuiltQuiver(
				await transportWith({
					version: 1,
					name: 'test',
					quills: [
						{
							name: 'my.quill',
							version: '1.0.0',
							bundle: `my.quill@1.0.0.${'a'.repeat(NAME_DIGEST_LENGTH)}.zip`,
							fonts: {}
						}
					]
				})
			)
		).rejects.toThrow(/is not a name a ref can spell/);
	});

	it('non-canonical semver in quill entry → quiver_invalid', async () => {
		await expect(
			loadBuiltQuiver(
				await transportWith({
					version: 1,
					name: 'test',
					quills: [
						{
							name: 'foo',
							version: '1.0', // non-canonical — missing patch
							bundle: 'foo@1.0.zip',
							fonts: {}
						}
					]
				})
			)
		).rejects.toThrow(expect.objectContaining({ code: 'quiver_invalid' }));
	});
});

describe('loadBuiltQuiver — missing bundle or store entry', () => {
	it("manifest references a bundle zip that transport can't fetch → transport_error", async () => {
		const { transport, bundles } = await makeArtifact('test', [{ name: 'foo', version: '1.0.0' }]);
		transport.delete(bundles['foo@1.0.0']!);

		const q = await loadBuiltQuiver(transport);
		await expect(q.getQuill('foo@1.0.0')).rejects.toThrow(
			expect.objectContaining({ code: 'transport_error' })
		);
	});

	it('manifest references a font hash not in store → transport_error', async () => {
		const fontBytes = new Uint8Array([7, 7, 7]);
		const { transport } = await makeArtifact('test', [
			{ name: 'foo', version: '1.0.0', fonts: { 'fonts/missing.ttf': fontBytes } }
		]);
		transport.delete(`store/${await fullDigest(fontBytes)}`);

		const q = await loadBuiltQuiver(transport);
		await expect(q.getQuill('foo@1.0.0')).rejects.toThrow(
			expect.objectContaining({ code: 'transport_error' })
		);
	});
});

describe('loadBuiltQuiver — path validation (security)', () => {
	it('pointer manifest with path traversal → quiver_invalid', async () => {
		const transport = new MemTransport({
			'latest.json': enc.encode(JSON.stringify({ manifest: '../../etc/passwd' }))
		});
		await expect(loadBuiltQuiver(transport)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});

	it('pointer manifest with absolute path → quiver_invalid', async () => {
		const transport = new MemTransport({
			'latest.json': enc.encode(JSON.stringify({ manifest: '/etc/passwd' }))
		});
		await expect(loadBuiltQuiver(transport)).rejects.toThrow(
			expect.objectContaining({ code: 'quiver_invalid' })
		);
	});

	it('manifest bundle with path traversal → quiver_invalid', async () => {
		await expect(
			loadBuiltQuiver(
				await transportWith({
					version: 1,
					name: 'test',
					quills: [{ name: 'evil', version: '1.0.0', bundle: '../../etc/passwd', fonts: {} }]
				})
			)
		).rejects.toThrow(expect.objectContaining({ code: 'quiver_invalid' }));
	});

	it('manifest font hash with path traversal → quiver_invalid', async () => {
		await expect(
			loadBuiltQuiver(
				await transportWith({
					version: 1,
					name: 'test',
					quills: [
						{
							name: 'evil',
							version: '1.0.0',
							bundle: 'evil@1.0.0.aabbccddeeff0011223344556677889a.zip',
							fonts: { 'fonts/body.ttf': '../../etc/passwd' }
						}
					]
				})
			)
		).rejects.toThrow(expect.objectContaining({ code: 'quiver_invalid' }));
	});

	it('manifest font hash that is not a full SHA-256 → quiver_invalid', async () => {
		await expect(
			loadBuiltQuiver(
				await transportWith({
					version: 1,
					name: 'test',
					quills: [
						{
							name: 'evil',
							version: '1.0.0',
							bundle: 'evil@1.0.0.aabbccddeeff0011223344556677889a.zip',
							// 32 hex chars: a full-width MD5, not a SHA-256.
							fonts: { 'fonts/body.ttf': 'aabbccddeeff00112233445566778899' }
						}
					]
				})
			)
		).rejects.toThrow(expect.objectContaining({ code: 'quiver_invalid' }));
	});
});

describe('loadBuiltQuiver — duplicate entry detection', () => {
	it('duplicate name@version in manifest → quiver_invalid', async () => {
		await expect(
			loadBuiltQuiver(
				await transportWith({
					version: 1,
					name: 'test',
					quills: [
						{
							name: 'foo',
							version: '1.0.0',
							bundle: 'foo@1.0.0.aabbccddeeff0011223344556677889a.zip',
							fonts: {}
						},
						{
							name: 'foo',
							version: '1.0.0',
							bundle: 'foo@1.0.0.ddeeffaabbcc0011223344556677889b.zip',
							fonts: {}
						}
					]
				})
			)
		).rejects.toThrow(/Duplicate quill entry/);
	});

	it('same name but different versions is not a duplicate', async () => {
		const { transport } = await makeArtifact('test', [
			{ name: 'foo', version: '1.0.0' },
			{ name: 'foo', version: '2.0.0' }
		]);
		const q = await loadBuiltQuiver(transport);
		expect(q.versionsOf('foo')).toEqual(['2.0.0', '1.0.0']);
	});
});
