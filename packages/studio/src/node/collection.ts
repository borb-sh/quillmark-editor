/**
 * The author's own packer, resolved rather than carried.
 *
 * Studio is a bundled terminal: it ships no runtime dependencies, so the `build` behind
 * `dev` and `site` cannot be one of its own. It comes out of the collection's
 * `node_modules`, the copy the author's own `quillmark-quiver` verbs run through, so
 * the pack a local loop serves and the pack their CI publishes are the same bytes.
 * `@quillmark/quiver`'s own bin reaches the engine this way for the same reason.
 */

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Typed off the real thing, and type-only: no runtime edge exists. */
type QuiverNode = typeof import('@quillmark/quiver/node');

/**
 * `@quillmark/quiver/node`, loaded out of `collection`'s own tree.
 *
 * The resolution base is the collection's `package.json` rather than this module, which
 * is what makes the copy the author's. `createRequire().resolve` walks an exports map
 * under CJS conditions (`require`, `node`, `default`) whatever the caller's own module
 * system, so a subpath offering `import` alone is invisible to it: `@quillmark/quiver`
 * and `@quillmark/wasm` both name `default` beside it.
 *
 * Absence is the ordinary first-run failure, so it names the install rather than
 * surfacing a resolver's own words.
 */
export async function loadQuiverNode(collection: string): Promise<QuiverNode> {
	let resolved: string;
	try {
		const req = createRequire(pathToFileURL(join(collection, 'package.json')).href);
		resolved = req.resolve('@quillmark/quiver/node');
	} catch {
		throw new Error(
			`Cannot find @quillmark/quiver in "${collection}".\n` +
				'  Install it:  npm install --save-dev @quillmark/quiver\n' +
				'  It packs what this serves, and it is the copy `quillmark-quiver test` gates with.'
		);
	}
	return (await import(pathToFileURL(resolved).href)) as QuiverNode;
}
