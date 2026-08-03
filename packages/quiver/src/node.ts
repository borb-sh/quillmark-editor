/**
 * Node-only entrypoint: the factories that read a filesystem, as free
 * functions. Each returns a `Quiver`; the class itself is the browser-safe one
 * from the main entry, unmodified. Importing this module installs nothing, so
 * the import path is the whole contract and a bundler drops what is not called.
 *
 * Bundler note: this entry pulls in `./source-loader.js`, `./build.js`, and
 * `./transports/fs-built-transport.js`, all of which statically import `node:*`
 * builtins. Browser bundles must never reach it. The main entry (`./index.js`)
 * makes no static or dynamic reference to it.
 */

import { Quiver, createQuiver } from './quiver.js';
import { QuiverError } from './errors.js';
import { scanSourceQuiver, SourceLoader } from './source-loader.js';
import { buildQuiver } from './build.js';
import { loadBuiltQuiver } from './built-loader.js';
import { FsBuiltTransport } from './transports/fs-built-transport.js';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Reads a Source Quiver from a local directory containing `Quiver.yaml` and
 * `quills/<name>/<version>/Quill.yaml` entries.
 *
 * Also accepts an `import.meta.url`-style `file://` URL; the URL's parent
 * directory is used as the source root.
 *
 * Throws `quiver_invalid` on schema violations, `transport_error` on I/O
 * failure.
 */
export async function fromDir(pathOrFileUrl: string): Promise<Quiver> {
	const dir = pathOrFileUrl.startsWith('file://')
		? fileURLToPath(new URL('.', pathOrFileUrl))
		: pathOrFileUrl;
	const { meta, catalog } = await scanSourceQuiver(dir);
	return createQuiver(meta.name, catalog, new SourceLoader(dir));
}

/**
 * Resolves an npm specifier and loads the source layout at the package root.
 * The resolved package must have `Quiver.yaml` at its root and expose it from
 * its `exports` map.
 *
 * Throws `transport_error` on resolution/I/O failure, `quiver_invalid` on
 * schema violations.
 */
export async function fromPackage(specifier: string, from?: string): Promise<Quiver> {
	return fromDir(dirname(resolveQuiverYaml(specifier, from)));
}

/**
 * Loads a packed (build-output) quiver from a local directory containing
 * `latest.json` and the manifest/bundle/store files written by `build`.
 * Symmetric to `Quiver.fromBuiltUrl(url)` but reads from disk instead of HTTP:
 * no network required.
 *
 * Use this for server-side runtime when a packed artifact ships in the
 * deployment image; consumers can keep source quivers as devDependencies and
 * avoid self-fetching over their own load balancer.
 *
 * Throws `quiver_invalid` on format errors, `transport_error` on I/O failure.
 */
export async function fromBuiltDir(dirPath: string): Promise<Quiver> {
	return loadBuiltQuiver(new FsBuiltTransport(dirPath));
}

/**
 * Reads the Source Quiver at sourceDir, validates it, and writes the runtime
 * build artifact to outDir, which the build clears first and therefore owns.
 *
 * Throws `quiver_invalid` on source validation failures, `transport_error` on
 * I/O failures and on an outDir holding the source quiver or the cwd.
 */
export async function build(sourceDir: string, outDir: string): Promise<void> {
	return buildQuiver(sourceDir, outDir);
}

/**
 * Resolves an npm specifier and builds the source layout at the package root.
 * Symmetric to `fromPackage` but writes a runtime build artifact to outDir
 * instead of loading.
 *
 * Throws `transport_error` on resolution/I/O failure, `quiver_invalid` on
 * source validation failures.
 */
export async function buildPackage(
	specifier: string,
	outDir: string,
	from?: string
): Promise<void> {
	return buildQuiver(dirname(resolveQuiverYaml(specifier, from)), outDir);
}

/**
 * Resolves `<specifier>/Quiver.yaml` from `from`: an `import.meta.url` or a
 * path, defaulting to this module. The default only finds packages hoisted
 * beside `@quillmark/quiver` itself; under an isolated `node_modules` layout a
 * caller's own dependencies are reachable only from the caller, so passing
 * `import.meta.url` is what makes resolution ask the right question.
 *
 * Throws `transport_error`.
 */
function resolveQuiverYaml(specifier: string, from?: string): string {
	try {
		return createRequire(from ?? import.meta.url).resolve(`${specifier}/Quiver.yaml`);
	} catch (err) {
		throw new QuiverError(
			'transport_error',
			`Failed to resolve quiver package "${specifier}" from "${from ?? import.meta.url}": ${(err as Error).message}`,
			{ cause: err }
		);
	}
}

// The rest of the public surface, so a Node consumer needs one import.

export { Quiver } from './quiver.js';
export { QuiverError } from './errors.js';
export type { QuiverErrorCode } from './errors.js';

// Engine types (`Quillmark`, `Quill`, `Document`, `RenderResult`, …) are not
// re-exported: import them straight from the `@quillmark/wasm` peer dependency,
// which is the single source of truth for the engine contract.
