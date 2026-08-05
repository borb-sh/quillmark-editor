/**
 * The pack: a source quiver on disk into the tree the client reads over HTTP.
 *
 * `build` clears its output before writing it, so a pack is assembled outside the
 * served tree and moved in with one rename. A generation becomes visible in one
 * step rather than over the length of a pack, and a client reading the pointer
 * mid-pack never reports a broken quiver for an edit that was fine.
 */

import { existsSync } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from '@quillmark/quiver/node';

export interface Packer {
	/** The tree a served read is answered from. Holds the current generation alone. */
	readonly dir: string;
	/** Pack, and resolve when the generation is in place. Rejects on a failed pack. */
	run(): Promise<void>;
	/** Resolves when nothing is in flight, whatever the last pack's verdict was: a
	 *  read waits for quiet, and a failed pack leaves the last good generation. */
	settled(): Promise<void>;
}

/**
 * A packer over `source`, staging under `home`. All three trees are siblings so the
 * swap is a rename rather than a copy, which is why `home` is chosen on the source's
 * own filesystem rather than in a temp directory.
 */
export function packer(source: string, home: string): Packer {
	const dir = join(home, 'quiver');
	const next = join(home, 'next');
	const prev = join(home, 'prev');

	async function swap(): Promise<void> {
		await build(source, next);
		await mkdir(home, { recursive: true });
		await rm(prev, { recursive: true, force: true });
		if (existsSync(dir)) await rename(dir, prev);
		await rename(next, dir);
		await rm(prev, { recursive: true, force: true });
	}

	// Serialized rather than concurrent: `build` owns its output directory and clears
	// it first, so two overlapping packs would race over the same tree. The queue
	// itself never rejects; the caller that asked for a pack takes its failure.
	let queue: Promise<void> = Promise.resolve();

	return {
		dir,
		run() {
			const done = queue.then(swap);
			queue = done.catch(() => {});
			return done;
		},
		settled() {
			return queue;
		}
	};
}
