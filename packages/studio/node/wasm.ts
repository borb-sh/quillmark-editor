/**
 * The author's `@quillmark/wasm`, found the way the CLI's engine discovery finds it.
 *
 * A prebuilt client that carried its own copy would render through a different
 * artifact than `quiver test` does, and every note studio shows is that artifact's
 * output: it could show a `conform::*` the author's gate never produces, and hide one
 * it will. So the client's imports are left bare at build and resolved in the browser
 * against the copy installed beside the quiver, through an import map this module
 * mints. Package-level parity is what that buys: a custom `engine` from
 * `quiver.config.js` is a Node object, so it stays the gate's alone.
 */

import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Where the resolved package is mounted, and the prefix of every import-map value. */
export const WASM_MOUNT = 'wasm';

export interface AuthorWasm {
	/** The package root, served verbatim: the glue resolves its `.wasm` and its
	 *  backends relative to its own module URL, so the tree is the mechanism. */
	root: string;
	version: string;
	/** The import map the client's bare specifiers resolve through. */
	imports: Record<string, string>;
}

/** The web target of a conditional `exports`/`imports` value; `node` is never it. */
function webTarget(value: unknown): string | undefined {
	if (typeof value === 'string') return value;
	if (value === null || typeof value !== 'object') return undefined;
	for (const key of ['browser', 'import', 'module', 'default'])
		if (key in value) {
			const target = webTarget((value as Record<string, unknown>)[key]);
			if (target) return target;
		}
	return undefined;
}

/** `>=1.2.3-0` or `1.2.3-0` → `[1, 2, 3]`, or null. */
function parts(version: string): number[] | null {
	const m = /^(?:>=\s*)?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
	return m ? [+m[1], +m[2], +m[3]] : null;
}

/** Lexicographic, not per-position: `0.99.0` is above the floor `0.98.5`. */
function below(a: number[], b: number[]): boolean {
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
	return false;
}

/** The package root above a resolved entry file, by the name it claims. */
function rootOf(entry: string, name: string): string {
	for (let at = dirname(entry); ; at = dirname(at)) {
		const manifest = join(at, 'package.json');
		if (existsSync(manifest)) {
			const json = JSON.parse(readFileSync(manifest, 'utf8')) as { name?: string };
			if (json.name === name) return at;
		}
		const up = dirname(at);
		if (up === at) throw new Error(`${name}: resolved "${entry}" belongs to no package`);
	}
}

/**
 * Resolve `@quillmark/wasm` from `cwd`'s node_modules, refusing a copy below `floor`.
 * A mismatch answered here reads as one line; unanswered it surfaces as
 * `runtime::init_failed` or a foreign handle, both of which read like a quill's fault.
 */
export function resolveWasm(cwd: string, floor: string): AuthorWasm {
	const name = '@quillmark/wasm';
	let entry: string;
	try {
		const req = createRequire(pathToFileURL(join(cwd, 'package.json')).href);
		entry = req.resolve(name);
	} catch {
		throw new Error(
			`Cannot find ${name} in this quiver's node_modules.\n` +
				`  Install it:  npm install ${name}\n` +
				'The client renders through the copy installed here, so studio and `quiver test` cannot disagree.'
		);
	}

	const root = rootOf(entry, name);
	const json = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
		version?: string;
		exports?: unknown;
		imports?: Record<string, unknown>;
	};
	const version = json.version ?? '0.0.0';

	const wanted = parts(floor);
	const found = parts(version);
	if (wanted && found && below(found, wanted))
		throw new Error(
			`${name} ${version} is installed here, below studio's floor \`${floor}\`.\n` +
				`  Upgrade it:  npm install ${name}@latest\n` +
				'The client is built against that floor, and a handle it mints below one is refused at the first door that takes it.'
		);

	const main = webTarget(
		(json.exports as Record<string, unknown> | undefined)?.['.'] ?? json.exports
	);
	if (!main) throw new Error(`${name}: package exports name no web entry`);

	const url = (target: string): string => `./${WASM_MOUNT}/${target.replace(/^\.\//, '')}`;
	const imports: Record<string, string> = { [name]: url(main) };
	// `#`-prefixed subpath imports resolve inside the package under a bundler and
	// nowhere at all in a browser, so each one the package declares gets its web
	// target too: the seam that keeps `node:fs` out of a browser graph is exactly the
	// kind that would otherwise 404 here.
	for (const [key, value] of Object.entries(json.imports ?? {})) {
		const target = webTarget(value);
		if (target) imports[key] = url(target);
	}

	return { root, version, imports };
}
