// Node-side fixture loading for Vitest: walk a quill directory into the
// `Map<string, Uint8Array>` `Quill.fromTree` accepts. The playground reads the same
// tree through a built quiver over HTTP; this is the filesystem twin, so a test
// builds the reference quill with no server and no pack step.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { init, type Quill } from '@quillmark/wasm';

const core = await init();

// `fixtures/` is the workspace's, not this package's: the playground reads the same
// tree, so it sits above both.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..', '..');

/** The one reference quill (dev fixture, never published). */
const ROOT = join(REPO_ROOT, 'fixtures', 'quills', 'specimen', '1.0.0');

/**
 * The reference quill's tree, keyed by `"/"`-joined paths relative to its root;
 * binary bytes intact (the fonts and the letterhead mark are read as raw
 * `Uint8Array`, never decoded). The version directory is quill content throughout,
 * so there is nothing here to skip.
 */
export function loadFixtureTree(): Map<string, Uint8Array> {
	const tree = new Map<string, Uint8Array>();
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			const abs = join(dir, name);
			if (statSync(abs).isDirectory()) {
				walk(abs);
			} else {
				tree.set(relative(ROOT, abs).split(sep).join('/'), new Uint8Array(readFileSync(abs)));
			}
		}
	};
	walk(ROOT);
	return tree;
}

/**
 * The reference quill, parsed once per worker. `Quill.fromTree` re-parses the
 * whole fixture tree, and a suite only ever reads its schema or seeds fresh
 * documents off it; so the handle is shared and never freed, rather than each
 * suite keeping its own copy of this cache.
 */
let cachedQuill: Quill | undefined;
export function quill(): Quill {
	if (!cachedQuill) cachedQuill = core.Quill.fromTree(loadFixtureTree());
	return cachedQuill;
}
