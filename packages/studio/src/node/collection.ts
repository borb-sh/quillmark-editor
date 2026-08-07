/**
 * The author's own packer, resolved rather than carried.
 *
 * Studio is a bundled terminal: it ships no runtime dependencies, so the `build` behind
 * `dev` and `site` cannot be one of its own. It is resolved from the collection's
 * `node_modules` — the same copy the author's `quiver test` and `quiver build` run
 * through — so the pack a local loop serves and the pack their CI publishes are the
 * same bytes. `@quillmark/quiver`'s own bin reaches the engine this way for the same
 * reason.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** What is resolved, typed off the real thing. Type-only: no runtime edge exists. */
type QuiverNode = typeof import('@quillmark/quiver/node');

// `createRequire().resolve` walks the exports map under CJS conditions — `require`,
// `node`, `default` — whatever the module system of the caller. A subpath offering
// only `import` is invisible to it, which is why `@quillmark/quiver` names `default`
// beside `import` and `@quillmark/wasm` already did.

/**
 * `@quillmark/quiver/node`, loaded out of `collection`'s own tree.
 *
 * The resolution base is the collection's `package.json` rather than this module, which
 * is what makes the copy the author's. Absence is the ordinary first-run failure, so it
 * names the install instead of surfacing a resolver's own words.
 */
export async function loadQuiverNode(collection: string): Promise<QuiverNode> {
	let resolved: string;
	try {
		const require = createRequire(pathToFileURL(join(collection, 'package.json')).href);
		resolved = require.resolve('@quillmark/quiver/node');
	} catch {
		throw new Error(
			`Cannot find @quillmark/quiver in "${collection}".\n` +
				'  Install it:  npm install --save-dev @quillmark/quiver\n' +
				'  It packs what this serves, and it is the copy `quiver test` gates with.'
		);
	}
	return (await import(pathToFileURL(resolved).href)) as QuiverNode;
}
