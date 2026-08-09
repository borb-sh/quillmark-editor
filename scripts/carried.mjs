// The three versions a quillkit bundle carries, read off the resolved manifests. A
// browser resolves nothing, so the siblings are compiled in and their coordinate is for
// diagnosis rather than resolution: what a consumer holding a tarball nobody can `npm ls`
// needs in a bug report is which copies are in there.
//
// The version as its manifest states it, for all three. Whether a checkout sits ahead of
// the tag that version names is a question about a working tree, and a published tarball
// is not one — `release.yml` builds from the merge commit it tags, so the manifest and the
// bytes agree by construction.
//
// Two callers. quillkit's `vite.config.ts` defines `__CARRIED__` and writes
// `dist/client/carried.json` beside the bundle: the define lets a running client name
// itself in a bug report, the file lets a consumer read the tarball without running
// anything. `release-prepare.yml` runs `--line` into the promoted changelog section, which
// `release.yml` lifts into the Release notes verbatim.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './workspace.mjs';

/** The siblings compiled into the client, by workspace directory. `@quillmark/wasm` is not
 *  one of them: it is external, and read off its own resolved manifest. */
const SIBLINGS = [
	{ dir: 'svelte', name: '@quillmark/svelte' },
	{ dir: 'quiver', name: '@quillmark/quiver' }
];

const versionAt = (manifest) => JSON.parse(readFileSync(manifest, 'utf8')).version;

/** What a client built out of `root` carries, keyed by registry name. */
export function carried(root = ROOT) {
	const out = {};
	for (const { dir, name } of SIBLINGS)
		out[name] = versionAt(join(root, 'packages', dir, 'package.json'));

	// The resolved copy rather than a declared range: the bundle takes one. The package
	// exports only `.`, so the manifest is reached beside the entry rather than as a
	// subpath.
	const entry = createRequire(join(root, 'package.json')).resolve('@quillmark/wasm');
	out['@quillmark/wasm'] = versionAt(new URL('../package.json', pathToFileURL(entry)));
	return out;
}

/** The same three as one sentence, for a release's notes. */
export function line(what = carried()) {
	const each = Object.entries(what).map(([name, version]) => `\`${name}\` ${version}`);
	return `Carries ${each.join(', ')}.`;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const what = carried();
	console.log(process.argv.includes('--line') ? line(what) : JSON.stringify(what, null, '\t'));
}
