/**
 * Built-quiver loader — browser-safe at module level.
 * Internal; not exported from index.ts.
 *
 * Exposes:
 *   - BuiltTransport interface (implemented by HttpTransport)
 *   - loadBuiltQuiver(transport) → Quiver
 *
 * NO static node: imports — this module is safe to load in browser contexts.
 */

import { QuiverError } from './errors.js';
import { unpackFiles } from './bundle.js';
import { isCanonicalSemver, compareSemver } from './semver.js';
import { NAME_DIGEST_LENGTH, sha256Hex } from './digest.js';
import type { Quiver, QuiverLoader } from './quiver.js';
import { createQuiver } from './quiver.js';

// ─── Internal types ───────────────────────────────────────────────────────────

interface BuiltQuillEntry {
	name: string;
	version: string;
	bundle: string;
	fonts: Record<string, string>;
}

interface BuiltManifest {
	version: 1;
	name: string;
	quills: BuiltQuillEntry[];
}

// ─── Public interface (internal to the package) ───────────────────────────────

/**
 * Transport abstraction: fetch raw bytes by relative path within the packed
 * artifact. Implemented by HttpTransport (browser + Node) and FsBuiltTransport
 * (Node).
 */
export interface BuiltTransport {
	fetchBytes(relativePath: string, opts?: FetchOptions): Promise<Uint8Array>;
}

/**
 * `revalidate` marks the one request that must not be answered from a cache:
 * `latest.json`, the only name in the artifact that is not content-addressed.
 * Everything else is safe to cache forever by construction.
 */
export interface FetchOptions {
	revalidate?: boolean;
}

/**
 * Fetch, then check the bytes against the digest their name carries. That
 * check is what makes "content-addressed, safe to cache forever" a property
 * rather than a hope: it catches a corrupted CDN object, a partial sync, and a
 * name reused across releases. A mismatch is a transport failure — the bytes
 * that arrived are not the bytes asked for — so the caches that evict on error
 * let a retry succeed.
 *
 * Where no digest primitive exists (a page served over plain http, which is
 * not a secure context) the fetch passes through unchecked.
 */
async function fetchVerified(
	transport: BuiltTransport,
	path: string,
	expected: string
): Promise<Uint8Array> {
	const bytes = await transport.fetchBytes(path);
	const actual = await sha256Hex(bytes);
	if (actual !== undefined && !actual.startsWith(expected)) {
		throw new QuiverError(
			'transport_error',
			`Digest mismatch for "${path}": the bytes hash to ${actual.slice(0, expected.length)}, not ${expected}`
		);
	}
	return bytes;
}

// ─── Path validation ──────────────────────────────────────────────────────────

// Each name carries the digest of what it names; the capture group is the
// digest the fetch is checked against, so path validation and verification
// read the same character span. `build` writes exactly NAME_DIGEST_LENGTH
// chars for bundles and manifests and the full 64 for store entries.
const DIGEST = `[0-9a-f]{${NAME_DIGEST_LENGTH},}`;
const MANIFEST_FILENAME_RE = new RegExp(`^manifest\\.(${DIGEST})\\.json$`);
const BUNDLE_FILENAME_RE = new RegExp(
	`^[A-Za-z0-9_.-]+@[0-9]+\\.[0-9]+\\.[0-9]+\\.(${DIGEST})\\.zip$`
);
const FONT_HASH_RE = /^[0-9a-f]{64}$/;

/** The digest a content-addressed filename carries. Throws `quiver_invalid`. */
function digestOfName(re: RegExp, name: string, what: string): string {
	const match = re.exec(name);
	if (match === null) {
		throw new QuiverError('quiver_invalid', `${what} is invalid: "${name}"`);
	}
	return match[1]!;
}

function validateFontHash(hash: string, context: string): void {
	if (!FONT_HASH_RE.test(hash)) {
		throw new QuiverError('quiver_invalid', `${context}: font hash is invalid: "${hash}"`);
	}
}

// ─── BuiltLoader implementation ─────────────────────────────────────────────

class BuiltLoader implements QuiverLoader {
	/** Font byte cache: hash → in-flight or resolved Promise. */
	private readonly fontCache: Map<string, Promise<Uint8Array>> = new Map();

	constructor(
		private readonly transport: BuiltTransport,
		/** Index map from "name@version" to its manifest entry. */
		private readonly index: Map<string, BuiltQuillEntry>
	) {}

	async loadTree(name: string, version: string): Promise<Map<string, Uint8Array>> {
		// The catalog the outer Quiver resolves against derives from this index,
		// so every ref reaching here has an entry.
		const entry = this.index.get(`${name}@${version}`)!;

		// 1. Fetch + unpack bundle zip.
		const zipBytes = await fetchVerified(
			this.transport,
			entry.bundle,
			digestOfName(BUNDLE_FILENAME_RE, entry.bundle, 'bundle filename')
		);
		const files = unpackFiles(zipBytes);

		// 2. Rehydrate fonts from store (coalesced).
		const fontEntries = Object.entries(entry.fonts);
		await Promise.all(
			fontEntries.map(async ([path, hash]) => {
				files[path] = await this.fetchFont(hash);
			})
		);

		// 3. Convert to Map.
		return new Map(Object.entries(files));
	}

	/**
	 * Fetch a font by hash from store/<hash>, coalescing concurrent requests for
	 * the same hash into a single fetch. On error, removes the cache entry so
	 * callers can retry.
	 */
	private fetchFont(hash: string): Promise<Uint8Array> {
		let promise = this.fontCache.get(hash);
		if (!promise) {
			promise = fetchVerified(this.transport, `store/${hash}`, hash).catch((err: unknown) => {
				this.fontCache.delete(hash);
				throw err;
			});
			this.fontCache.set(hash, promise);
		}
		return promise;
	}
}

// ─── Pointer + manifest validation helpers ────────────────────────────────────

function assertNoUnknownKeys(
	obj: Record<string, unknown>,
	allowed: string[],
	context: string
): void {
	for (const key of Object.keys(obj)) {
		if (!allowed.includes(key)) {
			throw new QuiverError('quiver_invalid', `${context}: unknown field "${key}"`);
		}
	}
}

function parsePointer(raw: string): string {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new QuiverError('quiver_invalid', 'latest.json contains invalid JSON');
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new QuiverError('quiver_invalid', 'latest.json must be a JSON object');
	}

	const obj = parsed as Record<string, unknown>;
	assertNoUnknownKeys(obj, ['manifest'], 'latest.json');

	if (typeof obj['manifest'] !== 'string' || obj['manifest'].length === 0) {
		throw new QuiverError(
			'quiver_invalid',
			'latest.json must have a non-empty string "manifest" field'
		);
	}

	return obj['manifest'] as string;
}

function parseManifest(raw: string): BuiltManifest {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		throw new QuiverError('quiver_invalid', 'Manifest file contains invalid JSON');
	}

	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new QuiverError('quiver_invalid', 'Manifest must be a JSON object');
	}

	const obj = parsed as Record<string, unknown>;
	assertNoUnknownKeys(obj, ['version', 'name', 'quills'], 'manifest');

	if (obj['version'] !== 1) {
		throw new QuiverError(
			'quiver_invalid',
			`Manifest version must be 1, got ${String(obj['version'])}`
		);
	}

	if (typeof obj['name'] !== 'string' || obj['name'].length === 0) {
		throw new QuiverError('quiver_invalid', 'Manifest must have a non-empty string "name" field');
	}

	if (!Array.isArray(obj['quills'])) {
		throw new QuiverError('quiver_invalid', 'Manifest must have a "quills" array');
	}

	const quills: BuiltQuillEntry[] = [];

	for (let i = 0; i < (obj['quills'] as unknown[]).length; i++) {
		const entry = (obj['quills'] as unknown[])[i];

		if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
			throw new QuiverError('quiver_invalid', `manifest.quills[${i}] must be an object`);
		}

		const e = entry as Record<string, unknown>;
		assertNoUnknownKeys(e, ['name', 'version', 'bundle', 'fonts'], `manifest.quills[${i}]`);

		if (typeof e['name'] !== 'string' || (e['name'] as string).length === 0) {
			throw new QuiverError(
				'quiver_invalid',
				`manifest.quills[${i}].name must be a non-empty string`
			);
		}

		if (typeof e['version'] !== 'string' || !isCanonicalSemver(e['version'] as string)) {
			throw new QuiverError(
				'quiver_invalid',
				`manifest.quills[${i}].version must be canonical semver (x.y.z), got "${String(e['version'])}"`
			);
		}

		if (typeof e['bundle'] !== 'string' || (e['bundle'] as string).length === 0) {
			throw new QuiverError(
				'quiver_invalid',
				`manifest.quills[${i}].bundle must be a non-empty string`
			);
		}

		digestOfName(
			BUNDLE_FILENAME_RE,
			e['bundle'] as string,
			`manifest.quills[${i}].bundle filename`
		);

		if (typeof e['fonts'] !== 'object' || e['fonts'] === null || Array.isArray(e['fonts'])) {
			throw new QuiverError('quiver_invalid', `manifest.quills[${i}].fonts must be an object`);
		}

		const fonts = e['fonts'] as Record<string, unknown>;
		for (const [k, v] of Object.entries(fonts)) {
			if (typeof v !== 'string') {
				throw new QuiverError(
					'quiver_invalid',
					`manifest.quills[${i}].fonts["${k}"] must be a string`
				);
			}
			validateFontHash(v, `manifest.quills[${i}].fonts["${k}"]`);
		}

		quills.push({
			name: e['name'] as string,
			version: e['version'] as string,
			bundle: e['bundle'] as string,
			fonts: fonts as Record<string, string>
		});
	}

	return {
		version: 1,
		name: obj['name'] as string,
		quills
	};
}

// ─── Catalog assembly ─────────────────────────────────────────────────────────

/**
 * Name → versions (descending), derived from the index. One structure backs
 * both the loader's lookups and the Quiver's catalog, so the two cannot
 * disagree about what the manifest holds.
 */
function catalogOf(index: Map<string, BuiltQuillEntry>): Map<string, string[]> {
	const catalog = new Map<string, string[]>();
	for (const entry of index.values()) {
		const versions = catalog.get(entry.name) ?? [];
		versions.push(entry.version);
		catalog.set(entry.name, versions);
	}
	for (const versions of catalog.values()) {
		versions.sort((a, b) => compareSemver(b, a));
	}
	return catalog;
}

/**
 * Validate manifest bytes (`quiver_invalid` on format errors) and assemble a
 * Quiver backed by a BuiltLoader over `transport`. Shared by `loadBuiltQuiver`
 * (pointer-following) and `seedBuiltQuiver` (seed).
 */
function buildQuiverFromManifestBytes(
	transport: BuiltTransport,
	manifestBytes: Uint8Array
): Quiver {
	const manifest = parseManifest(new TextDecoder().decode(manifestBytes));

	const index = new Map<string, BuiltQuillEntry>();
	for (const entry of manifest.quills) {
		const key = `${entry.name}@${entry.version}`;
		if (index.has(key)) {
			throw new QuiverError('quiver_invalid', `Duplicate quill entry in manifest: "${key}"`);
		}
		index.set(key, entry);
	}

	return createQuiver(manifest.name, catalogOf(index), new BuiltLoader(transport, index));
}

// ─── Main entry points ────────────────────────────────────────────────────────

/**
 * Load a build-output quiver via the given transport.
 *
 * 1. Fetches latest.json (pointer) and parses it.
 * 2. Fetches the manifest file it points to and validates it.
 * 3. Builds a catalog from manifest entries (versions sorted descending).
 * 4. Returns a Quiver instance backed by a BuiltLoader.
 */
export async function loadBuiltQuiver(transport: BuiltTransport): Promise<Quiver> {
	// 1. Fetch and parse pointer. It is the one name that is not
	//    content-addressed, so it is also the one fetch that must revalidate.
	let pointerBytes: Uint8Array;
	try {
		pointerBytes = await transport.fetchBytes('latest.json', { revalidate: true });
	} catch (err) {
		if (err instanceof QuiverError) throw err;
		throw new QuiverError(
			'transport_error',
			`Failed to fetch latest.json: ${(err as Error).message}`,
			{ cause: err }
		);
	}

	const manifestFileName = parsePointer(new TextDecoder().decode(pointerBytes));
	const manifestDigest = digestOfName(
		MANIFEST_FILENAME_RE,
		manifestFileName,
		'Pointer manifest filename'
	);

	// 2. Fetch and parse manifest.
	let manifestBytes: Uint8Array;
	try {
		manifestBytes = await fetchVerified(transport, manifestFileName, manifestDigest);
	} catch (err) {
		if (err instanceof QuiverError) throw err;
		throw new QuiverError(
			'transport_error',
			`Failed to fetch manifest "${manifestFileName}": ${(err as Error).message}`,
			{ cause: err }
		);
	}

	// 3–4. Validate manifest + assemble catalog/loader.
	return buildQuiverFromManifestBytes(transport, manifestBytes);
}

/**
 * Seed a quiver from caller-provided manifest bytes, skipping the latest.json
 * pointer fetch. `transport` is used only for lazy bundle/font fetches.
 * Throws `quiver_invalid` on malformed bytes.
 */
export function seedBuiltQuiver(transport: BuiltTransport, manifestBytes: Uint8Array): Quiver {
	return buildQuiverFromManifestBytes(transport, manifestBytes);
}
