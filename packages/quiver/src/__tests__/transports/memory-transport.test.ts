/**
 * Tests for the artifact-in-hand loaders: `Quiver.fromBuiltFiles` (the whole
 * artifact, nothing fetched) and `Quiver.fromBuiltUrl`'s `seed` (what the
 * caller holds, the URL for the rest).
 *
 * `globalThis.fetch` is stubbed and its call log asserted on, because what
 * these loaders buy is a fetch that does not happen.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { Quiver } from '../../quiver.js';
import { packFiles } from '../../bundle.js';
import { NAME_DIGEST_LENGTH, sha256Hex } from '../../digest.js';
import { QuiverError } from '../../errors.js';
import { mockQuillFromTree } from '../helpers/mock-engine.js';

const enc = new TextEncoder();

let treeStub: ReturnType<typeof mockQuillFromTree> | undefined;
let realFetch: typeof globalThis.fetch;

afterEach(() => {
	treeStub?.restore();
	treeStub = undefined;
	if (realFetch !== undefined) globalThis.fetch = realFetch;
	vi.restoreAllMocks();
});

// ─── Fixture ──────────────────────────────────────────────────────────────────

async function nameDigest(bytes: Uint8Array): Promise<string> {
	return (await sha256Hex(bytes))!.slice(0, NAME_DIGEST_LENGTH);
}

/**
 * A packed artifact as a path → bytes map. One quill, one font in the store, so
 * every kind of name the loader asks for is present.
 */
async function makeArtifactFiles(): Promise<{
	files: Map<string, Uint8Array>;
	bundleName: string;
	manifestName: string;
	fontHash: string;
}> {
	const files = new Map<string, Uint8Array>();

	const fontBytes = enc.encode('font-bytes');
	const fontHash = (await sha256Hex(fontBytes))!;
	files.set(`store/${fontHash}`, fontBytes);

	const zip = packFiles({
		'Quill.yaml': enc.encode('name: memo\n'),
		'template.typ': enc.encode('// memo\n')
	});
	const bundleName = `memo@1.0.0.${await nameDigest(zip)}.zip`;
	files.set(bundleName, zip);

	const manifestBytes = enc.encode(
		JSON.stringify({
			version: 1,
			name: 'sample',
			quills: [
				{
					name: 'memo',
					version: '1.0.0',
					bundle: bundleName,
					fonts: { 'fonts/Body.ttf': fontHash }
				}
			]
		})
	);
	const manifestName = `manifest.${await nameDigest(manifestBytes)}.json`;
	files.set(manifestName, manifestBytes);
	files.set('latest.json', enc.encode(JSON.stringify({ manifest: manifestName })));

	return { files, bundleName, manifestName, fontHash };
}

/**
 * Stubs `globalThis.fetch` over an artifact map and logs every path asked for.
 * Anything the map lacks is a 404, so a test asserting "not fetched" fails
 * loudly rather than hanging.
 */
function stubFetch(served: Map<string, Uint8Array>): { paths: string[] } {
	const paths: string[] = [];
	realFetch = globalThis.fetch;
	globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
		const url = String(input);
		const path = url.slice(url.indexOf('/quivers/sample/') + '/quivers/sample/'.length);
		paths.push(path);
		const bytes = served.get(path);
		if (bytes === undefined) return new Response(null, { status: 404 });
		return new Response(bytes as BufferSource, { status: 200 });
	}) as typeof globalThis.fetch;
	return { paths };
}

// ─── fromBuiltFiles ───────────────────────────────────────────────────────────

describe('Quiver.fromBuiltFiles', () => {
	it('builds a catalog from the artifact bytes alone', async () => {
		const { files } = await makeArtifactFiles();
		const { paths } = stubFetch(new Map());

		const quiver = await Quiver.fromBuiltFiles(files);

		expect(quiver.name).toBe('sample');
		expect(quiver.quillNames()).toEqual(['memo']);
		expect(quiver.resolve('memo')).toBe('memo@1.0.0');
		expect(paths).toEqual([]);
	});

	it('materializes a quill, rehydrating its font from the held store', async () => {
		const { files } = await makeArtifactFiles();
		const { paths } = stubFetch(new Map());
		treeStub = mockQuillFromTree();

		const quiver = await Quiver.fromBuiltFiles(files);
		await quiver.getQuill('memo');

		const tree = treeStub.calls[0]!;
		expect([...tree.keys()].sort()).toEqual(['Quill.yaml', 'fonts/Body.ttf', 'template.typ']);
		expect(new TextDecoder().decode(tree.get('fonts/Body.ttf')!)).toBe('font-bytes');
		expect(paths).toEqual([]);
	});

	it('accepts keys carrying a leading slash or dot-slash', async () => {
		const { files } = await makeArtifactFiles();
		const prefixed = new Map([...files].map(([k, v], i) => [i % 2 === 0 ? `/${k}` : `./${k}`, v]));

		const quiver = await Quiver.fromBuiltFiles(prefixed);

		expect(quiver.quillNames()).toEqual(['memo']);
	});

	it('names the path it does not hold', async () => {
		const { files, bundleName } = await makeArtifactFiles();
		files.delete(bundleName);
		treeStub = mockQuillFromTree();

		const quiver = await Quiver.fromBuiltFiles(files);
		const err = await quiver.getQuill('memo').catch((e: unknown) => e);

		expect(err).toBeInstanceOf(QuiverError);
		expect((err as QuiverError).code).toBe('transport_error');
		expect((err as QuiverError).message).toContain(bundleName);
	});

	it('rejects an artifact with no pointer', async () => {
		const { files } = await makeArtifactFiles();
		files.delete('latest.json');

		const err = await Quiver.fromBuiltFiles(files).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(QuiverError);
		expect((err as QuiverError).code).toBe('transport_error');
		expect((err as QuiverError).message).toContain('latest.json');
	});
});

// ─── fromBuiltUrl, seeded ─────────────────────────────────────────────────────

describe('Quiver.fromBuiltUrl with seed', () => {
	it('fetches only what the seed does not carry', async () => {
		const { files, bundleName, manifestName, fontHash } = await makeArtifactFiles();
		const { paths } = stubFetch(files);
		treeStub = mockQuillFromTree();

		// The serverless shape: the two small documents ship with the deployment,
		// the heavy bytes stay on the host.
		const seed = new Map([
			['latest.json', files.get('latest.json')!],
			[manifestName, files.get(manifestName)!]
		]);

		const quiver = await Quiver.fromBuiltUrl('/quivers/sample/', { seed });
		expect(paths).toEqual([]);

		await quiver.getQuill('memo');
		expect(paths).toEqual([bundleName, `store/${fontHash}`]);
	});

	it('seeding the pointer moves the stale-pointer guarantee off the cache', async () => {
		const { files, manifestName } = await makeArtifactFiles();
		const { paths } = stubFetch(files);

		const seed = new Map([['latest.json', files.get('latest.json')!]]);
		await Quiver.fromBuiltUrl('/quivers/sample/', { seed });

		// The manifest is fetched, the pointer never is: no revalidation
		// round-trip decides which catalog this process reads.
		expect(paths).toEqual([manifestName]);
	});

	it('digest-checks seeded bytes exactly as fetched ones', async () => {
		const { files, manifestName } = await makeArtifactFiles();
		stubFetch(files);

		// A manifest whose name no longer describes its bytes: the deployment
		// shipped one generation's pointer beside another's manifest.
		const seed = new Map([
			['latest.json', files.get('latest.json')!],
			[manifestName, enc.encode(JSON.stringify({ version: 1, name: 'tampered', quills: [] }))]
		]);

		const err = await Quiver.fromBuiltUrl('/quivers/sample/', { seed }).catch((e: unknown) => e);

		expect(err).toBeInstanceOf(QuiverError);
		expect((err as QuiverError).code).toBe('transport_error');
		expect((err as QuiverError).message).toContain('Digest mismatch');
	});

	it('an empty seed loads exactly as an unseeded fetch would', async () => {
		const { files, manifestName } = await makeArtifactFiles();
		const { paths } = stubFetch(files);

		const quiver = await Quiver.fromBuiltUrl('/quivers/sample/', { seed: new Map() });

		expect(quiver.name).toBe('sample');
		expect(paths).toEqual(['latest.json', manifestName]);
	});
});
