// The workspace's shape, for the gates that read it: where the root is, what the
// packages are, where canon lives, and how a gate reports. Stated once, so three
// scripts cannot disagree about the answer.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every workspace package, sorted by directory: `{ dir, at, json }`. */
export function packages() {
	return readdirSync(join(ROOT, 'packages'))
		.sort()
		.map((dir) => {
			const at = join(ROOT, 'packages', dir);
			return { dir, at, json: JSON.parse(readFileSync(join(at, 'package.json'), 'utf8')) };
		});
}

/** Every package's `prose/canon/`, sorted. */
export function canonRoots() {
	return packages()
		.map((p) => join(p.at, 'prose', 'canon'))
		.filter(existsSync);
}

/** Every `*.md` under `dir`, as `[absolute, repo-relative]`, sorted. */
export function canonDocs(dir) {
	return readdirSync(dir)
		.filter((f) => f.endsWith('.md'))
		.sort()
		.map((f) => [join(dir, f), relative(ROOT, join(dir, f))]);
}

/** A gate's verdict: findings printed and a non-zero exit, or the `ok` line. */
export function report(label, errors, ok) {
	if (errors.length) {
		console.error(`${label} failed (${errors.length}):`);
		for (const e of errors) console.error(`  ✗ ${e}`);
		process.exit(1);
	}
	console.log(ok);
}
