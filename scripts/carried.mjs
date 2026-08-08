// The three versions a quillkit bundle carries, read off the resolved manifests and each
// qualified against its own release tag. A browser resolves nothing, so the siblings are
// compiled in and their coordinate is for diagnosis rather than resolution; a bare version
// is a claim that the bytes are the released ones, and the qualified forms are what keep
// that claim honest.
//
//   0.1.0                    released, and nothing under its shipped paths has moved since
//   0.1.0+3.a1b2c3d          three commits past its tag, at that HEAD
//   0.0.0+untagged.a1b2c3d   no tag this checkout can measure against
//   0.1.0+nogit              built outside a git checkout, so nothing is measurable
//
// Every form is valid semver build metadata. `@quillmark/wasm` is bare always: it is
// external, root `overrides` pins it to one version, and its manifest is the authority.
//
// Two callers. quillkit's `vite.config.ts` defines `__CARRIED__` and writes
// `dist/client/carried.json` beside the bundle: the define lets a running client name
// itself in a bug report, the file lets a consumer read the tarball without running
// anything. `release-prepare.yml` runs `--line` into the promoted changelog section, which
// `release.yml` lifts into the Release notes verbatim.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './workspace.mjs';

/** The siblings compiled into the client, by workspace directory. `@quillmark/wasm` is not
 *  one of them: it is external, and stamped off its own manifest. */
const SIBLINGS = [
	{ dir: 'svelte', name: '@quillmark/svelte' },
	{ dir: 'quiver', name: '@quillmark/quiver' }
];

/** A sibling's shipped paths as a git pathspec: everything under the package minus what
 *  provably does not reach a bundle. The exclusions are named rather than the inclusions,
 *  so a build-config file outside `src` counts and a directory nobody has ruled on counts
 *  too. */
function shipped(dir) {
	const at = `packages/${dir}`;
	return [
		at,
		...['prose', 'tests', 'README.md', 'CHANGELOG.md'].map((p) => `:(exclude)${at}/${p}`)
	];
}

/** `git` in `root`, or `undefined` where it cannot answer. */
function git(root, ...args) {
	try {
		return execFileSync('git', args, {
			cwd: root,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore']
		}).trim();
	} catch {
		return undefined;
	}
}

/** One sibling's stamp: its manifest version, qualified against `<dir>-v<x.y.z>`, the tag
 *  shape `release.yml` writes. */
function stamp(root, dir, version) {
	const head = git(root, 'rev-parse', '--short', 'HEAD');
	if (head === undefined) return `${version}+nogit`;

	const tags = git(root, 'tag', '-l', `${dir}-v*`, '--sort=-v:refname') ?? '';
	const tag = tags.split('\n').find((t) => new RegExp(`^${dir}-v\\d+\\.\\d+\\.\\d+$`).test(t));
	// The distance rather than the tag decides the stamp, so a tag this checkout holds a
	// name for but cannot walk to reads the same as no tag: neither measures anything.
	const ahead =
		tag === undefined
			? undefined
			: git(root, 'rev-list', '--count', `${tag}..HEAD`, '--', ...shipped(dir));
	if (ahead === undefined) return `${version}+untagged.${head}`;
	return ahead === '0' ? version : `${version}+${ahead}.${head}`;
}

const versionAt = (manifest) => JSON.parse(readFileSync(manifest, 'utf8')).version;

/** What a client built out of `root` carries, keyed by registry name. */
export function carried(root = ROOT) {
	const out = {};
	for (const { dir, name } of SIBLINGS)
		out[name] = stamp(root, dir, versionAt(join(root, 'packages', dir, 'package.json')));

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
