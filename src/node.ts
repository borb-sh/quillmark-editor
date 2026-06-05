/**
 * Node-only entrypoint.
 *
 * Importing this module is the consumer's explicit declaration of intent:
 * "I am running in Node and want the Node-only Quiver factories." It exposes
 * the same `Quiver` class as the main entry, augmented with `fromDir`,
 * `fromPackage`, `fromBuiltDir`, `build`, and `buildPackage` static methods.
 *
 * Side effect: at module evaluation time, the Node-only static methods are
 * installed on the shared `Quiver` constructor. Any other module that already
 * imports `Quiver` from the main entry will see the additional methods at
 * runtime — but TypeScript will only expose them on the binding imported from
 * here, so the import path remains the contract.
 *
 * Bundler note: importing this entry pulls in `./source-loader.js`,
 * `./build.js`, and `./transports/fs-built-transport.js`, all of which
 * statically import `node:*` builtins. Browser bundles must never reach this
 * module. The main entry (`./index.js`) makes no static or dynamic reference
 * to it.
 */

import { Quiver as Base } from "./quiver.js";
import { QuiverError } from "./errors.js";
import { scanSourceQuiver, SourceLoader } from "./source-loader.js";
import { buildQuiver, type BuildOptions } from "./build.js";
import { loadBuiltQuiver } from "./built-loader.js";
import { FsBuiltTransport } from "./transports/fs-built-transport.js";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// 1. Type-augmented re-export
// ---------------------------------------------------------------------------
//
// Same constructor, richer static surface. TS sees the extra methods on the
// `Quiver` symbol imported from this module; the symbol imported from the
// main entry has the lean static surface.

type NodeQuiverStatics = {
  /**
   * Resolves an npm specifier against `node_modules` and loads the source
   * layout at the package root. The resolved package must have `Quiver.yaml`
   * at its root.
   *
   * Throws `transport_error` on resolution/I/O failure, `quiver_invalid` on
   * schema violations.
   */
  fromPackage(specifier: string): Promise<Base>;

  /**
   * Reads a Source Quiver from a local directory containing `Quiver.yaml`
   * and `quills/<name>/<version>/Quill.yaml` entries.
   *
   * Also accepts `import.meta.url`-style `file://` URLs as a convenience for
   * tests; the URL's parent directory is used as the source root.
   *
   * Throws `quiver_invalid` on schema violations, `transport_error` on I/O
   * failure.
   */
  fromDir(pathOrFileUrl: string): Promise<Base>;

  /**
   * Loads a packed (build-output) quiver from a local directory containing
   * `Quiver.json` and the manifest/bundle/store files written by
   * `Quiver.build`. Symmetric to `fromBuiltUrl(url)` but reads from disk
   * instead of HTTP — no network required.
   *
   * Use this for server-side runtime when a packed artifact ships in the
   * deployment image; consumers can keep source quivers as devDependencies
   * and avoid self-fetching over their own load balancer.
   *
   * Throws `quiver_invalid` on format errors, `transport_error` on I/O
   * failure.
   */
  fromBuiltDir(dirPath: string): Promise<Base>;

  /**
   * Reads the Source Quiver at sourceDir, validates it, and writes the
   * runtime build artifact to outDir.
   *
   * Throws `quiver_invalid` on source validation failures, `transport_error`
   * on I/O failures.
   */
  build(
    sourceDir: string,
    outDir: string,
    opts?: BuildOptions,
  ): Promise<void>;

  /**
   * Resolves an npm specifier against `node_modules` and builds the source
   * layout at the package root. The resolved package must have `Quiver.yaml`
   * at its root. Symmetric to `fromPackage` but writes a runtime build
   * artifact to outDir instead of loading.
   *
   * Throws `transport_error` on resolution/I/O failure, `quiver_invalid` on
   * source validation failures.
   */
  buildPackage(
    specifier: string,
    outDir: string,
    opts?: BuildOptions,
  ): Promise<void>;
};

export type Quiver = Base;
export const Quiver = Base as typeof Base & NodeQuiverStatics;

// ---------------------------------------------------------------------------
// 2. Runtime patch — install Node-only statics on the shared class.
// ---------------------------------------------------------------------------

Quiver.fromDir = async function fromDir(pathOrFileUrl: string): Promise<Base> {
  const dir = pathOrFileUrl.startsWith("file://")
    ? fileURLToPath(new URL(".", pathOrFileUrl))
    : pathOrFileUrl;
  const { meta, catalog } = await scanSourceQuiver(dir);
  return Base._fromLoader(meta.name, catalog, new SourceLoader(dir));
};

Quiver.fromBuiltDir = async function fromBuiltDir(
  dirPath: string,
): Promise<Base> {
  return loadBuiltQuiver(new FsBuiltTransport(dirPath));
};

Quiver.fromPackage = async function fromPackage(
  specifier: string,
): Promise<Base> {
  const req = createRequire(import.meta.url);
  let yamlPath: string;
  try {
    yamlPath = req.resolve(`${specifier}/Quiver.yaml`);
  } catch (err) {
    throw new QuiverError(
      "transport_error",
      `Failed to resolve quiver package "${specifier}": ${(err as Error).message}`,
      { cause: err },
    );
  }
  return Quiver.fromDir(dirname(yamlPath));
};

Quiver.build = async function build(
  sourceDir: string,
  outDir: string,
  opts?: BuildOptions,
): Promise<void> {
  return buildQuiver(sourceDir, outDir, opts);
};

Quiver.buildPackage = async function buildPackage(
  specifier: string,
  outDir: string,
  opts?: BuildOptions,
): Promise<void> {
  const req = createRequire(import.meta.url);
  let yamlPath: string;
  try {
    yamlPath = req.resolve(`${specifier}/Quiver.yaml`);
  } catch (err) {
    throw new QuiverError(
      "transport_error",
      `Failed to resolve quiver package "${specifier}": ${(err as Error).message}`,
      { cause: err },
    );
  }
  return buildQuiver(dirname(yamlPath), outDir, opts);
};

// ---------------------------------------------------------------------------
// 3. Re-export the rest of the public surface so consumers get one import.
// ---------------------------------------------------------------------------

export { QuiverError } from "./errors.js";
export type { QuiverErrorCode } from "./errors.js";
export type { BuildOptions } from "./build.js";

// Engine types (`Quillmark`, `Quill`, `Document`, `RenderResult`, …) are not
// re-exported: import them straight from the `@quillmark/wasm` peer dependency,
// which is the single source of truth for the engine contract.
