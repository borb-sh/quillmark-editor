// Node-side fixture loading for Vitest: walk a quill directory into the
// `Map<string, Uint8Array>` `Quill.fromTree` accepts. The browser playground has
// its own `?url`-glob loader (a fetch path); this is the filesystem twin, so a
// test builds the reference quill without a running Vite server.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import { Quill } from '$lib/core';

// `fixtures/` is the workspace's, not this package's: the playground reads the same
// tree, so it sits above both.
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..', '..');

/** The one reference quill (dev fixture, never published). */
export const USAF_MEMO_ROOT = join(REPO_ROOT, 'fixtures', 'quills', 'usaf_memo', '0.2.0');

/**
 * Walk `root` into a `Map` keyed by `"/"`-joined paths relative to it; binary
 * bytes intact (fonts/seals are read as raw `Uint8Array`, never decoded). Skips
 * `__golden__`, the repo's schema-snapshot artifact, which is not part of the
 * quill (`.quillignore` covers build/OS noise, not this).
 */
export function loadFixtureTree(root: string = USAF_MEMO_ROOT): Map<string, Uint8Array> {
	const tree = new Map<string, Uint8Array>();
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			const abs = join(dir, name);
			if (statSync(abs).isDirectory()) {
				if (name === '__golden__') continue;
				walk(abs);
			} else {
				const key = relative(root, abs).split(sep).join('/');
				tree.set(key, new Uint8Array(readFileSync(abs)));
			}
		}
	};
	walk(root);
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
	if (!cachedQuill) cachedQuill = Quill.fromTree(loadFixtureTree());
	return cachedQuill;
}
