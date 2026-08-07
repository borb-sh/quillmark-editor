/**
 * Lay a servable site out: the client at the root, a built quiver beside it under
 * `quiver/`. That arrangement is the whole of what a deploy is, and it is written here
 * once — a consumer's workflow, this repository's own build, and the reusable workflow
 * all reach it through `studio site` rather than restating it in three shells.
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
import { within } from './pack.js';

export interface SiteOptions {
	/** The source quiver: `Quiver.yaml` at its root. */
	collection: string;
	/** The site root. Owned outright — cleared before it is written. */
	out: string;
	/** The client to lay down. The one this package ships, unless a test says otherwise. */
	client?: string;
}

/**
 * `site` clears its output before writing it, so an out that IS or CONTAINS the
 * collection or the working directory deletes the thing being laid out. `--out .` and a
 * slipped `--out ..` are one keystroke away and the deletion is unrecoverable.
 *
 * Quiver refuses the same shape for the tree its own `build` owns. That refusal does
 * not travel with the packer: this clears a directory quiver never sees, one level
 * above the one it is handed.
 *
 * An out NESTED inside the collection stays allowed — `site/` under the quiver root is
 * the ordinary layout, and nothing of the source is read after it is cleared.
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
 * A client carrying a `quiver/` of its own is the one failure this cannot recover
 * from silently: it would shadow the author's at the same URL, and which one the
 * reader gets would depend on copy order.
 */
export function assertClient(dist: string = CLIENT_DIST): void {
	if (!existsSync(join(dist, 'index.html')))
		throw new Error(`No client at ${dist} — this package ships one at dist/`);
	if (existsSync(join(dist, 'quiver')))
		throw new Error(`${dist}/quiver — the client carries no quiver; it would shadow the site's`);
}

/** Lay the site out. Returns the site root. */
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

	// What the client fetches first, and the one absence that reads to it as a quiver
	// which is not there rather than a layout which is wrong.
	if (!existsSync(join(at, 'quiver', 'latest.json')))
		throw new Error(`${at}/quiver holds no pointer — "${collection}" built nothing`);

	return at;
}
