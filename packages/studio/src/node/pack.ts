/**
 * The Node half's packing loop: pack a source quiver into the tree a client is served
 * from, and repack it when the source changes. Nothing renders here (no engine, no wasm,
 * no paint loop), which is the whole of what separates this half from the one it serves
 * (STUDIO §"The two halves").
 *
 * Two callers share it: this package's bin, and the Vite plugin this repository runs on
 * itself. The staged swap and the settle are the parts subtle enough to be wrong in two
 * places, so they are written once; the watcher stays each caller's, since a dev server
 * already has one and a bin does not.
 */

import { existsSync, watch } from 'node:fs';
import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { loadQuiverNode } from './collection.js';
import { within } from './paths.js';

/** One repack per settled burst: an editor's save arrives as several watcher events. */
export const SETTLE_MS = 80;

export interface PackerOptions {
	/** The source quiver: `Quiver.yaml` at its root. */
	collection: string;
	/** The served tree. Only ever holds a whole generation. */
	out: string;
	/** Where a pack is assembled, and where the tree it replaces waits to be deleted.
	 *  Outside `out`, so a half-written generation is never reachable. */
	stage: string;
}

export interface Packer {
	pack(): Promise<void>;
}

/**
 * **A generation is never observably half-written.** `build` clears its output before
 * writing it, so packing straight into the served tree leaves a window where the pointer
 * is missing or torn, and a client reading it there reports a broken quiver for an edit
 * that was fine. A pack is assembled in `stage` and becomes visible in one rename.
 */
export async function createPacker(options: PackerOptions): Promise<Packer> {
	const { build } = await loadQuiverNode(options.collection);
	const out = resolve(options.out);
	const next = join(resolve(options.stage), 'next');
	const prev = join(resolve(options.stage), 'prev');

	async function swapIn(): Promise<void> {
		await build(options.collection, next);
		await mkdir(dirname(out), { recursive: true });
		await rm(prev, { recursive: true, force: true });
		if (existsSync(out)) await rename(out, prev);
		await rename(next, out);
		await rm(prev, { recursive: true, force: true });
	}

	// Serialized rather than concurrent: `build` owns its output directory and clears it
	// first, so two overlapping packs would race over one tree. Both arms run `swapIn`,
	// so a pack chains onto a SETTLED queue whichever way the last one went: a quiver
	// mid-edit is invalid as often as not, and a rejected link left in the chain would
	// answer every later pack with the first failure instead of running it.
	let queue: Promise<void> = Promise.resolve();
	return { pack: () => (queue = queue.then(swapIn, swapIn)) };
}

/** Call `fn` once a burst of calls stops arriving. */
export function settle(ms: number, fn: () => void): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return () => {
		clearTimeout(timer);
		timer = setTimeout(fn, ms);
	};
}

export interface Watcher {
	close(): void;
}

/**
 * Watch a collection's source and call `onChange` once each burst settles.
 *
 * The pack's own output is filtered out: the default output lives under the collection's
 * `node_modules`, so a watcher seeing its own writes would repack forever. That
 * directory and `.git` are excluded outright, a quiver's authored source being in
 * neither.
 */
export function watchCollection(
	collection: string,
	ignored: string[],
	onChange: () => void
): Watcher {
	const root = resolve(collection);
	const excluded = ignored.map((path) => resolve(path));

	const isOwnWrite = (path: string): boolean => {
		const abs = resolve(root, path);
		if (abs.split(sep).some((part) => part === 'node_modules' || part === '.git')) return true;
		return excluded.some((at) => within(at, abs));
	};

	const fire = settle(SETTLE_MS, onChange);
	const watcher = watch(root, { recursive: true }, (_event, filename) => {
		// A null filename carries no path to filter on, so it counts as a change: missing
		// a real edit costs an author the repack they asked for.
		if (filename === null || !isOwnWrite(filename)) fire();
	});
	return { close: () => watcher.close() };
}
