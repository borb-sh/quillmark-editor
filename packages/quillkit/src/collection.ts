/**
 * The collection's own copies of everything a verb needs: the loader that packs, the
 * engine that renders, the client that draws. quillkit carries none of the three, so a
 * collection pins each (QUILLKIT §"quillkit carries nothing it can resolve").
 *
 * `createRequire().resolve` walks an exports map under CJS conditions (`require`,
 * `node`, `default`) whatever the caller's own module system, so a subpath offering
 * `import` alone is invisible to it: `@quillmark/quiver`, `@quillmark/wasm` and
 * `@quillmark/studio` all name `default` beside it.
 *
 * Absence is the ordinary first-run failure, so each of these names the install rather
 * than surfacing a resolver's own words.
 */

import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Engine } from '@quillmark/wasm';

/** Typed off the real thing, and type-only: no runtime edge exists. */
type QuiverNode = typeof import('@quillmark/quiver/node');

/** What `@quillmark/wasm` hands a gate. `init()` is what makes the rest work. */
interface Wasm {
	Engine: new () => Engine;
	init: () => Promise<unknown>;
}

/** Resolution based at the collection rather than at this module, which is the whole
 *  of what makes a copy the author's. The `package.json` need not exist: resolution
 *  walks up from the directory holding it. */
const requireFrom = (collection: string): ReturnType<typeof createRequire> =>
	createRequire(pathToFileURL(join(collection, 'package.json')).href);

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
	return (await import(pathToFileURL(resolved).href)) as QuiverNode;
}

/**
 * The engine `test` renders through: a named `engine` export from
 * `quillkit.config.js` at the collection root, else `@quillmark/wasm` out of the
 * collection's own tree.
 *
 * **The core is instantiated here.** Every `@quillmark/wasm` export throws
 * `runtime::not_initialized` until `init()` resolves, and `new Engine()` is lazy, so
 * a gate that skips it reports an uninitialized runtime as a failing quill.
 */
export async function loadEngine(collection: string): Promise<Engine> {
	let wasm: Wasm | undefined;
	try {
		const resolved = requireFrom(collection).resolve('@quillmark/wasm');
		wasm = (await import(pathToFileURL(resolved).href)) as Wasm;
		await wasm.init();
	} catch {
		// Not installed: a quillkit.config.js may still provide an engine.
	}

	try {
		const config = await import(pathToFileURL(join(collection, 'quillkit.config.js')).href);
		if (config.engine != null) return config.engine as Engine;
	} catch {
		// File absent or incomplete: fall through to auto-discovery.
	}

	if (wasm == null) {
		throw new Error(
			`Cannot find @quillmark/wasm in "${collection}".\n` +
				'  Install it:  npm install --save-dev @quillmark/wasm\n' +
				'  Or export { engine } from quillkit.config.js for a custom engine.'
		);
	}
	return new wasm.Engine();
}

/**
 * The client `studio` serves and `site` lays out: `@quillmark/studio`'s `dist`,
 * out of the collection's own tree.
 *
 * The client is bytes rather than a module: nothing imports it, so the wasm it carries
 * stays in a browser tab and out of this process. What resolves is its manifest, the one
 * specifier a package with no importable entry still answers to; the `dist` beside it is
 * what gets served.
 */
export function resolveClient(collection: string): string {
	try {
		return join(dirname(requireFrom(collection).resolve('@quillmark/studio/package.json')), 'dist');
	} catch {
		throw new Error(
			`Cannot find @quillmark/studio in "${collection}".\n` +
				'  Install it:  npm install --save-dev @quillmark/studio\n' +
				'  It is the client this serves; --client points at one directly.'
		);
	}
}
