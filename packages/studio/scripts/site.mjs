/**
 * Lay a servable site out of the built client: the client at the root, a built quiver
 * beside it under `quiver/`. This is the arrangement a deploy makes — `quiver build
 * --out <site>/quiver` against the author's collection, the client copied over it —
 * rehearsed against `fixtures/`, so `vite preview` exercises the shape a published
 * client is consumed in rather than a shape only the dev server has.
 *
 * The assertions are the point. The client resolves its quiver off `document.baseURI`,
 * so the tree it is laid into decides what it loads: a `quiver/` inside the client
 * occupies the URL the deploy writes the author's to, and the winner is whichever copy
 * lands last.
 */

import { access, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { build } from '@quillmark/quiver/node';

/** The workspace's source quiver, standing in for the author's collection. */
const SOURCE = fileURLToPath(new URL('../../../fixtures', import.meta.url));
/** `vite build`'s output: the client, whole, and the only thing a publish would carry. */
const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const SITE = fileURLToPath(new URL('../site', import.meta.url));

const exists = async (path) => {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
};

function fail(message) {
	console.error(`error: ${message}`);
	process.exit(1);
}

if (!(await exists(`${DIST}/index.html`))) fail(`no client at ${DIST} — run \`vite build\` first`);
// The client is laid over the quiver the deploy built, so one it carries of its own
// shadows that one at the same URL.
if (await exists(`${DIST}/quiver`)) fail(`${DIST}/quiver — the client carries no quiver`);

await rm(SITE, { recursive: true, force: true });
await cp(DIST, SITE, { recursive: true });
await build(SOURCE, `${SITE}/quiver`);

// What the client fetches first, and the one file whose absence reads to it as a
// quiver that is not there rather than a layout that is wrong.
if (!(await exists(`${SITE}/quiver/latest.json`))) fail(`${SITE}/quiver holds no pointer`);

console.log(`studio site: ${SITE}`);
