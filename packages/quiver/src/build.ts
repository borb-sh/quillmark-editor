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
import { MANIFEST_VERSION, POINTER_FORMAT } from './format.js';

/** Font file extensions recognised by the builder (case-insensitive). */
const FONT_EXT = /\.(ttf|otf|woff|woff2)$/i;

/** The two trees a build owns beside its output: where a generation is assembled, and
 *  where the one it replaces waits to be deleted. Siblings of outDir, so the swap is a
 *  rename rather than a copy across filesystems. */
const stagesOf = (out: string): { stage: string; prev: string } => ({
	stage: `${out}.stage`,
	prev: `${out}.prev`
});

/**
 * The build deletes each of the three trees it owns, so an outDir that is, or contains,
 * the source quiver or the working directory deletes the thing the caller was building
 * from. `quillkit build --out .` and a mistyped `--out ..` are both one keystroke away,
 * and the failure is unrecoverable, so an outDir that owns the caller is refused up
 * front. The staging siblings are checked too: they are named off outDir and cleared
 * with it, so a caller who avoids one spelling has not avoided the others.
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
	const { stage, prev } = stagesOf(out);

	/** True when one of the owned trees is `target` or an ancestor of it. */
	const owns = (target: string): boolean =>
		[out, stage, prev].some((dir) => {
			const rel = path.relative(dir, path.resolve(target));
			return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
		});

	const what = owns(sourceDir)
		? 'the source quiver'
		: owns(process.cwd())
			? 'the working directory'
			: undefined;

	if (what !== undefined) {
		throw new QuiverError(
			'transport_error',
			`Refusing to build into "${outDir}": the build clears that directory and two staging siblings beside it, and this one holds ${what} ("${out}"). Point --out somewhere the build can own outright.`
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
 * A generation is assembled beside outDir and moved in whole, so a reader
 * fetching mid-build reads the previous one rather than a torn tree, and a
 * build that throws leaves the previous one serving.
 *
 * Throws:
 *   - `quiver_invalid` on source validation failures (propagated from scanner)
 *   - `transport_error` on I/O failures, and on an outDir the build would have
 *     to delete something it does not own to write (see `assertSafeOutDir`)
 */
export async function buildQuiver(sourceDir: string, outDir: string): Promise<void> {
	// Dynamic imports keep this module safe to type-import from browser contexts.
	const path = await import('node:path');
	const { dirname, join, resolve } = path;
	const { mkdir, rename, rm, writeFile } = await import('node:fs/promises');
	const { existsSync } = await import('node:fs');
	const { createHash } = await import('node:crypto');

	const { scanSourceQuiver, readQuillTree } = await import('./source-loader.js');

	assertSafeOutDir(path, sourceDir, outDir);
	const out = resolve(outDir);
	const { stage, prev } = stagesOf(out);

	const { meta, catalog } = await scanSourceQuiver(sourceDir);

	try {
		await packGeneration();
	} finally {
		// A throw anywhere above leaves a partial generation staged, and outDir
		// untouched. Neither tree outlives the call either way. Swept rather than
		// checked: a sweep that threw would answer for the build, and what a caller
		// needs to hear is why the build failed.
		for (const at of [stage, prev]) await rm(at, { recursive: true, force: true }).catch(() => {});
	}

	/**
	 * Write a whole generation into `stage`, then move it to outDir.
	 *
	 * The move is two renames: a directory rename refuses a non-empty target, so the
	 * outgoing generation steps aside first. That is the window, and it is two syscalls
	 * wide against the seconds a build takes.
	 */
	async function packGeneration(): Promise<void> {
		try {
			await rm(stage, { recursive: true, force: true });
			await mkdir(join(stage, 'store'), { recursive: true });
		} catch (err) {
			throw new QuiverError(
				'transport_error',
				`Failed to prepare output directory "${outDir}": ${(err as Error).message}`,
				{ cause: err }
			);
		}

		const manifestQuills: Array<{
			name: string;
			version: string;
			bundle: string;
			fonts: Record<string, string>;
		}> = [];

		for (const [quillName, versions] of catalog) {
			for (const version of versions) {
				const quillDir = join(sourceDir, 'quills', quillName, version);

				const tree = await readQuillTree(quillDir);

				const fontEntries: Array<[string, Uint8Array]> = [];
				const contentEntries: Array<[string, Uint8Array]> = [];

				for (const [path, bytes] of tree) {
					if (FONT_EXT.test(path)) {
						fontEntries.push([path, bytes]);
					} else {
						contentEntries.push([path, bytes]);
					}
				}

				const fonts: Record<string, string> = {};
				for (const [path, bytes] of fontEntries) {
					// Full width: the store is keyed by hash, so two distinct fonts
					// sharing a prefix would merge into one entry.
					const hash = createHash('sha256').update(bytes).digest('hex');

					try {
						await writeFile(join(stage, 'store', hash), bytes);
					} catch (err) {
						throw new QuiverError(
							'transport_error',
							`Failed to write font store entry "${join(outDir, 'store', hash)}": ${(err as Error).message}`,
							{ cause: err }
						);
					}

					fonts[path] = hash;
				}

				const contentRecord: Record<string, Uint8Array> = {};
				for (const [path, bytes] of contentEntries) {
					contentRecord[path] = bytes;
				}
				const zipBytes = packFiles(contentRecord);

				const bundleHash = createHash('sha256')
					.update(zipBytes)
					.digest('hex')
					.slice(0, NAME_DIGEST_LENGTH);
				const bundleName = `${quillName}@${version}.${bundleHash}.zip`;

				try {
					await writeFile(join(stage, bundleName), zipBytes);
				} catch (err) {
					throw new QuiverError(
						'transport_error',
						`Failed to write bundle "${join(outDir, bundleName)}": ${(err as Error).message}`,
						{ cause: err }
					);
				}

				manifestQuills.push({ name: quillName, version, bundle: bundleName, fonts });
			}
		}

		// The description rides the manifest rather than the pointer: it is what the
		// collection says it is, and the manifest is the document that carries the
		// collection's identity and is digest-checked against the name that reached it.
		const manifest = {
			version: MANIFEST_VERSION,
			name: meta.name,
			...(meta.description === undefined ? {} : { description: meta.description }),
			quills: manifestQuills
		};

		const manifestJson = JSON.stringify(manifest, null, 2);
		const manifestHash = createHash('sha256')
			.update(manifestJson)
			.digest('hex')
			.slice(0, NAME_DIGEST_LENGTH);
		const manifestFileName = `manifest.${manifestHash}.json`;

		try {
			await writeFile(join(stage, manifestFileName), manifestJson, 'utf-8');
		} catch (err) {
			throw new QuiverError(
				'transport_error',
				`Failed to write manifest "${join(outDir, manifestFileName)}": ${(err as Error).message}`,
				{ cause: err }
			);
		}

		// The format is stamped here and read first, so a client older than the tree
		// says so rather than misreading it.
		const pointer = { format: POINTER_FORMAT, manifest: manifestFileName };

		try {
			await writeFile(join(stage, 'latest.json'), JSON.stringify(pointer), 'utf-8');
		} catch (err) {
			throw new QuiverError(
				'transport_error',
				`Failed to write pointer "${join(outDir, 'latest.json')}": ${(err as Error).message}`,
				{ cause: err }
			);
		}

		// `prev` is cleared first: a rename onto a non-empty directory fails, and the
		// tree left by an interrupted run is one.
		try {
			await mkdir(dirname(out), { recursive: true });
			await rm(prev, { recursive: true, force: true });
			if (existsSync(out)) await rename(out, prev);
			await rename(stage, out);
		} catch (err) {
			throw new QuiverError(
				'transport_error',
				`Failed to move the build into "${outDir}": ${(err as Error).message}`,
				{ cause: err }
			);
		}
	}
}
