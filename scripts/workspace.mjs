// The workspace's shape, for the gates that read it: where the root is, what the
// packages are, where canon lives, and how a gate reports. Stated once, so three
// scripts cannot disagree about the answer.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Every workspace package, sorted by directory: `{ dir, at, json }`. `packages/*` is the
 *  root manifest's own workspace glob, so a directory there with no manifest is named
 *  rather than opened: the throw is otherwise a bare ENOENT from whichever gate read it
 *  first, which reads as a broken gate rather than as output written where packages go. */
export function packages() {
	return readdirSync(join(ROOT, 'packages'))
		.sort()
		.map((dir) => {
			const at = join(ROOT, 'packages', dir);
			if (!existsSync(join(at, 'package.json')))
				throw new Error(`packages/${dir}: no package.json — packages/ holds workspace packages`);
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

/** A gate's verdict, in two severities. An error is a fault the diff cannot show — a
 *  pruned stylesheet, a dangling pointer, a rung that resolves to nothing — and fails the
 *  run. A warning is a fault review can see for itself, printed so it stays visible and
 *  never blocking: the shape a rule takes while the thing it is about is still moving.
 *  Warnings print above the `ok` line, so a passing gate still says what it noticed. */
export function report(label, errors, ok, warnings = []) {
	for (const w of warnings) console.warn(`  ~ ${w}`);
	if (errors.length) {
		console.error(`${label} failed (${errors.length}):`);
		for (const e of errors) console.error(`  ✗ ${e}`);
		process.exit(1);
	}
	console.log(warnings.length ? `${ok} (${warnings.length} warned)` : ok);
}
