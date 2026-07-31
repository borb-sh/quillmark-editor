// Where canon lives in the workspace, for the gates that read it. Canon is per-tier:
// the root's `prose/canon/` holds the rules that span packages, each package's holds
// its own. Both check:canon and check:style walk the same set, so the set is stated
// once.

import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every `prose/canon/` in the workspace: the root's, then each package's, sorted. */
export function canonRoots() {
	const dirs = [
		ROOT,
		...readdirSync(join(ROOT, 'packages'))
			.sort()
			.map((p) => join(ROOT, 'packages', p))
	];
	return dirs.map((d) => join(d, 'prose', 'canon')).filter(existsSync);
}

/** Every `*.md` under `dir`, as `[absolute, repo-relative]`, sorted. */
export function canonDocs(dir) {
	return readdirSync(dir)
		.filter((f) => f.endsWith('.md'))
		.sort()
		.map((f) => [join(dir, f), relative(ROOT, join(dir, f))]);
}
