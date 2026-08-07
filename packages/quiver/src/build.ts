/**
 * Build logic — internal, Node-only.
 *
 * All Node.js built-in imports are done dynamically inside `buildQuiver`, so
 * a module reaching this one for types alone does not pull `node:fs` or
 * `node:crypto` into a browser bundle.
 */

import { QuiverError } from './errors.js';
import { packFiles } from './bundle.js';
import { NAME_DIGEST_LENGTH } from './digest.js';
import { POINTER_FORMAT } from './format.js';

/** Font file extensions recognised by the builder (case-insensitive). */
const FONT_EXT = /\.(ttf|otf|woff|woff2)$/i;

/**
 * The build's first act is `rm(outDir, { recursive: true })`, so an outDir that
 * is, or contains, the source quiver or the working directory deletes the
 * thing the caller was building from. `quiver build --out .` and a mistyped
 * `--out ..` are both one keystroke away, and the failure is unrecoverable, so
 * an outDir that owns the caller is refused up front.
 *
 * An outDir *inside* sourceDir stays allowed: the scan reads the source before
 * any write, and `dist/` under the quiver root is the ordinary layout.
 *
 * Throws `transport_error`.
 */
function assertSafeOutDir(
	path: typeof import('node:path'),
	sourceDir: string,
	outDir: string
): void {
	const out = path.resolve(outDir);

	/** True when `dir` is `target` or an ancestor of it. */
	const owns = (target: string): boolean => {
		const rel = path.relative(out, path.resolve(target));
		return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
	};

	const what = owns(sourceDir)
		? 'the source quiver'
		: owns(process.cwd())
			? 'the working directory'
			: undefined;

	if (what !== undefined) {
		throw new QuiverError(
			'transport_error',
			`Refusing to build into "${outDir}": the build clears its output directory, and this one holds ${what} ("${out}"). Point --out at a directory the build owns.`
		);
	}
}

/**
 * Reads a Source Quiver, validates it, and writes the build output to outDir.
 *
 * Output layout. Every name but the pointer carries the SHA-256 of what it
 * names, which is what the loader checks on fetch:
 *   outDir/
 *     latest.json                     # the format, and a stable pointer to the manifest
 *     manifest.<sha256:12>.json       # hashed manifest
 *     <name>@<version>.<sha256:12>.zip  # one bundle per quill
 *     store/
 *       <sha256>                      # dehydrated font bytes (full hash, no ext)
 *
 * Throws:
 *   - `quiver_invalid` on source validation failures (propagated from scanner)
 *   - `transport_error` on I/O failures, and on an outDir the build would have
 *     to delete something it does not own to write (see `assertSafeOutDir`)
 */
export async function buildQuiver(sourceDir: string, outDir: string): Promise<void> {
	// Dynamic imports keep this module safe to type-import from browser contexts.
	const path = await import('node:path');
	const { join } = path;
	const { mkdir, rm, writeFile } = await import('node:fs/promises');
	const { createHash } = await import('node:crypto');

	const { scanSourceQuiver, readQuillTree } = await import('./source-loader.js');

	// 0. The first write is a recursive delete of outDir; refuse the paths where
	//    that deletes the caller instead of a previous build.
	assertSafeOutDir(path, sourceDir, outDir);

	// 1. Scan + validate source quiver (throws quiver_invalid on bad input).
	const { meta, catalog } = await scanSourceQuiver(sourceDir);

	// 2. Clear and recreate outDir + outDir/store/.
	try {
		await rm(outDir, { recursive: true, force: true });
		await mkdir(join(outDir, 'store'), { recursive: true });
	} catch (err) {
		throw new QuiverError(
			'transport_error',
			`Failed to prepare output directory "${outDir}": ${(err as Error).message}`,
			{ cause: err }
		);
	}

	// 3. Process each quill version.
	const manifestQuills: Array<{
		name: string;
		version: string;
		bundle: string;
		fonts: Record<string, string>;
	}> = [];

	for (const [quillName, versions] of catalog) {
		for (const version of versions) {
			const quillDir = join(sourceDir, 'quills', quillName, version);

			// a. Read quill file tree.
			const tree = await readQuillTree(quillDir);

			// b. Partition fonts vs content.
			const fontEntries: Array<[string, Uint8Array]> = [];
			const contentEntries: Array<[string, Uint8Array]> = [];

			for (const [path, bytes] of tree) {
				if (FONT_EXT.test(path)) {
					fontEntries.push([path, bytes]);
				} else {
					contentEntries.push([path, bytes]);
				}
			}

			// c. Dehydrate fonts into store/.
			const fonts: Record<string, string> = {};
			for (const [path, bytes] of fontEntries) {
				// Full width: the store is keyed by hash, so two distinct fonts
				// sharing a prefix would merge into one entry.
				const hash = createHash('sha256').update(bytes).digest('hex');
				const storePath = join(outDir, 'store', hash);

				try {
					await writeFile(storePath, bytes);
				} catch (err) {
					throw new QuiverError(
						'transport_error',
						`Failed to write font store entry "${storePath}": ${(err as Error).message}`,
						{ cause: err }
					);
				}

				fonts[path] = hash;
			}

			// d. Zip content files (deterministic: sorted paths, fixed mtime).
			const contentRecord: Record<string, Uint8Array> = {};
			for (const [path, bytes] of contentEntries) {
				contentRecord[path] = bytes;
			}
			const zipBytes = packFiles(contentRecord);

			// e–f. Compute bundle hash and name.
			const bundleHash = createHash('sha256')
				.update(zipBytes)
				.digest('hex')
				.slice(0, NAME_DIGEST_LENGTH);
			const bundleName = `${quillName}@${version}.${bundleHash}.zip`;

			// g. Write bundle zip.
			const bundlePath = join(outDir, bundleName);
			try {
				await writeFile(bundlePath, zipBytes);
			} catch (err) {
				throw new QuiverError(
					'transport_error',
					`Failed to write bundle "${bundlePath}": ${(err as Error).message}`,
					{ cause: err }
				);
			}

			// h. Record manifest entry.
			manifestQuills.push({ name: quillName, version, bundle: bundleName, fonts });
		}
	}

	// 4–8. Build and write hashed manifest.
	const manifest = {
		version: 1 as const,
		name: meta.name,
		quills: manifestQuills
	};

	const manifestJson = JSON.stringify(manifest, null, 2);
	const manifestHash = createHash('sha256')
		.update(manifestJson)
		.digest('hex')
		.slice(0, NAME_DIGEST_LENGTH);
	const manifestFileName = `manifest.${manifestHash}.json`;
	const manifestPath = join(outDir, manifestFileName);

	try {
		await writeFile(manifestPath, manifestJson, 'utf-8');
	} catch (err) {
		throw new QuiverError(
			'transport_error',
			`Failed to write manifest "${manifestPath}": ${(err as Error).message}`,
			{ cause: err }
		);
	}

	// 9–10. Write stable pointer latest.json. The format is stamped here and read
	//       first, so a client older than the tree says so instead of misreading it
	//       (`format.ts`).
	const pointer = { format: POINTER_FORMAT, manifest: manifestFileName };
	const pointerPath = join(outDir, 'latest.json');

	try {
		await writeFile(pointerPath, JSON.stringify(pointer), 'utf-8');
	} catch (err) {
		throw new QuiverError(
			'transport_error',
			`Failed to write pointer "${pointerPath}": ${(err as Error).message}`,
			{ cause: err }
		);
	}
}
