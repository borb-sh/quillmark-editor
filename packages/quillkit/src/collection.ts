/**
 * The collection's own copies of what a verb runs on: the loader that packs and the
 * engine that renders. quillkit carries neither, so a collection pins both
 * (QUILLKIT §"quillkit carries nothing it can resolve"). The client is the other half of
 * a verb's needs and it is carried rather than resolved, so it is a path constant
 * (`paths.ts`) rather than anything here.
 *
 * `createRequire().resolve` walks an exports map under CJS conditions (`require`,
 * `node`, `default`) whatever the caller's own module system, so a subpath offering
 * `import` alone is invisible to it: `@quillmark/quiver` and `@quillmark/wasm` both name
 * `default` beside it.
 *
 * Absence is the ordinary first-run failure, so a specifier that will not resolve names
 * the install rather than surfacing a resolver's own words. It is also the only thing
 * either loader recovers from.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Engine } from '@quillmark/wasm';

/** Typed off the real things, and type-only: no runtime edge exists. */
type QuiverNode = typeof import('@quillmark/quiver/node');
type Wasm = typeof import('@quillmark/wasm');

/** Resolution based at the collection rather than at this module, which is the whole
 *  of what makes a copy the author's. The `package.json` need not exist: resolution
 *  walks up from the directory holding it. */
const requireFrom = (collection: string): ReturnType<typeof createRequire> =>
	createRequire(pathToFileURL(join(collection, 'package.json')).href);

/** A path the resolver or the filesystem has already answered for. What throws past that
 *  answer is a fault rather than an absence, so it names what was loading and carries what
 *  threw as `cause`. */
async function loadFrom<T>(what: string, path: string): Promise<T> {
	try {
		return (await import(pathToFileURL(path).href)) as T;
	} catch (cause) {
		throw new Error(`Cannot load ${what} from "${path}".`, { cause });
	}
}

/** `@quillmark/quiver/node`, out of `collection`'s own tree: the loaders and `build`. */
export async function loadQuiverNode(collection: string): Promise<QuiverNode> {
	let resolved: string;
	try {
		resolved = requireFrom(collection).resolve('@quillmark/quiver/node');
	} catch {
		throw new Error(
			`Cannot find @quillmark/quiver in "${collection}".\n` +
				'  Install it:  npm install --save-dev @quillmark/quiver\n' +
				'  It is the quiver this packs and loads with, and the format it is packed in.'
		);
	}
	return loadFrom<QuiverNode>('@quillmark/quiver', resolved);
}

/**
 * The engine `test` renders through: a named `engine` export from
 * `quillkit.config.js` at the collection root, else `@quillmark/wasm` out of the
 * collection's own tree.
 *
 * **The core is instantiated here.** `new Engine()` is lazy, so the gate holds a live
 * instance before it renders rather than at whichever call first needs one.
 *
 * **The wasm loads and inits before the config is read.** `init()` is module-global and
 * memoized, so an engine the config builds out of that module rides this init
 * (QUILLKIT §"Blocked on, looked at").
 */
export async function loadEngine(collection: string): Promise<Engine> {
	let resolved: string | undefined;
	try {
		resolved = requireFrom(collection).resolve('@quillmark/wasm');
	} catch {
		// Absent, and a quillkit.config.js may still carry the engine.
	}

	let wasm: Wasm | undefined;
	if (resolved !== undefined) {
		wasm = await loadFrom<Wasm>('@quillmark/wasm', resolved);
		try {
			await wasm.init();
		} catch (cause) {
			throw new Error(`Cannot initialize @quillmark/wasm from "${resolved}".`, { cause });
		}
	}

	// Presence is the filesystem's answer: `ERR_MODULE_NOT_FOUND` is equally what an absent
	// config raises and what a config raises over a specifier of its own, so no error can
	// rule on which it is.
	const config = join(collection, 'quillkit.config.js');
	if (existsSync(config)) {
		const { engine } = await loadFrom<{ engine?: Engine }>('quillkit.config.js', config);
		if (engine != null) return engine;
	}

	if (wasm === undefined) {
		throw new Error(
			`Cannot find @quillmark/wasm in "${collection}".\n` +
				'  Install it:  npm install --save-dev @quillmark/wasm\n' +
				'  Or export { engine } from quillkit.config.js for a custom engine.'
		);
	}
	return new wasm.Engine();
}
