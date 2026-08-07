/**
 * Lay a servable site out: the client at the root, a built quiver beside it under
 * `quiver/`. A deploy is that arrangement and nothing else, written here once, so a
 * consumer's `scripts`, this repository's build and the reusable workflow all reach it
 * through `quillmark-studio site`.
 *
 * The client resolves its quiver from `document.baseURI` (`src/quiver.ts`), so the tree
 * it is laid into decides what it loads. Both halves of that are asserted rather than
 * assumed: a `quiver/` inside the client would occupy the URL the built one is served
 * from, and the winner would be whichever copy landed last.
 */

import { existsSync } from 'node:fs';
import { cp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CLIENT_DIST } from './client.js';
import { loadQuiverNode } from './collection.js';
import { within } from './paths.js';

export interface SiteOptions {
	/** The source quiver: `Quiver.yaml` at its root. */
	collection: string;
	/** The site root, owned outright: cleared before it is written. */
	out: string;
	/** Defaults to the client this package ships; a test passes a stand-in. */
	client?: string;
}

/**
 * `site` clears its output before writing it, so an out that IS or CONTAINS the
 * collection or the working directory deletes the thing being laid out. `--out .` and a
 * slipped `--out ..` are one keystroke away and the deletion is unrecoverable.
 *
 * Quiver refuses the same shape for the tree its own `build` owns, and that refusal does
 * not travel with the packer: this clears a directory quiver never sees, one level above
 * the one it is handed.
 *
 * An out NESTED inside the collection stays allowed: `site/` under the quiver root is
 * the ordinary layout, and nothing of the source is read after the clear.
 */
export function assertSafeOut(collection: string, out: string): void {
	const at = resolve(out);
	const what = within(at, resolve(collection))
		? 'the collection'
		: within(at, process.cwd())
			? 'the working directory'
			: undefined;

	if (what !== undefined) {
		throw new Error(
			`Refusing to lay a site out in "${out}": the layout clears its output, and this one holds ${what} ("${at}"). Point --out at a directory the site owns.`
		);
	}
}

/**
 * The client half of the layout, checked before anything is deleted.
 *
 * A client carrying a `quiver/` of its own is the one failure this cannot recover from
 * silently: it would shadow the author's at the same URL, and which one the reader gets
 * would depend on copy order.
 */
export function assertClient(dist: string = CLIENT_DIST): void {
	if (!existsSync(join(dist, 'index.html')))
		throw new Error(`No client at ${dist}: this package ships one at dist/`);
	if (existsSync(join(dist, 'quiver')))
		throw new Error(
			`${dist}/quiver exists: a client carries no quiver, and it would shadow the site's`
		);
}

/** Returns the site root, resolved. */
export async function laySite({
	collection,
	out,
	client = CLIENT_DIST
}: SiteOptions): Promise<string> {
	assertClient(client);
	assertSafeOut(collection, out);

	const at = resolve(out);
	const { build } = await loadQuiverNode(collection);

	await rm(at, { recursive: true, force: true });
	await cp(client, at, { recursive: true });
	await build(collection, join(at, 'quiver'));

	// What the client fetches first: its absence reads there as a quiver that is not
	// present rather than a layout that is wrong.
	if (!existsSync(join(at, 'quiver', 'latest.json')))
		throw new Error(`${at}/quiver holds no pointer: "${collection}" built nothing`);

	return at;
}
