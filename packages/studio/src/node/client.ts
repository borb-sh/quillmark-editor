/**
 * The client this bin serves: the `dist/` in this same package.
 *
 * One package is what makes the two halves agree by construction. The client compiles in
 * where it looks for its quiver (`quiver/` under its own base) and the bin lays one out
 * there; a bin shipped apart from the client would make that agreement a version range
 * to keep true.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * This package's root, found by walking up from wherever this module was loaded rather
 * than by counting `..` hops. The count differs by layout (`src/node/` when the suite
 * imports the source, `bin/` once compiled and in the tarball), so a constant right in
 * one would be silently wrong in the others.
 */
function packageRoot(): string {
	let at = dirname(fileURLToPath(import.meta.url));
	for (;;) {
		if (existsSync(join(at, 'package.json'))) return at;
		const up = dirname(at);
		if (up === at) throw new Error('studio: no package.json above this module');
		at = up;
	}
}

/** Built by `vite build`, and with `bin/` the whole of what a publish carries. */
export const CLIENT_DIST = join(packageRoot(), 'dist');
