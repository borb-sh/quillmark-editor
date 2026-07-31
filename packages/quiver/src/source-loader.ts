/**
 * Internal filesystem scanner for Source Quiver layout.
 *
 * Uses Node.js `fs/promises` — this module must only be imported from
 * Node-only contexts (fromDir, fromPackage, etc.).
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { QuiverError } from "./errors.js";
import { parseQuiverYaml } from "./quiver-yaml.js";
import { isCanonicalSemver, compareSemver } from "./semver.js";
import type { QuiverMeta } from "./quiver-yaml.js";
import type { QuiverLoader } from "./quiver.js";

/**
 * Scans a Source Quiver root directory.
 *
 * Reads `<rootDir>/Quiver.yaml`, then walks `<rootDir>/quills/<name>/<version>/`
 * to build a catalog of quill names → sorted versions (descending).
 *
 * Throws:
 *   - `quiver_invalid` if Quiver.yaml is missing/invalid, a version dir name is
 *     non-canonical, or a version dir is missing its Quill.yaml sentinel.
 *   - `transport_error` for I/O failures (permissions, etc.).
 *
 * Missing `quills/` directory is NOT an error — the quiver is valid but empty.
 */
export async function scanSourceQuiver(rootDir: string): Promise<{
  meta: QuiverMeta;
  catalog: Map<string, string[]>;
}> {
  // --- Read Quiver.yaml ---
  const quiverYamlPath = join(rootDir, "Quiver.yaml");
  let raw: Uint8Array;
  try {
    raw = await readFile(quiverYamlPath);
  } catch (err) {
    // ENOENT → transport_error: a missing Quiver.yaml means the path itself
    // does not point to a quiver — this is a missing-path condition, not a
    // structural violation of a quiver that exists.
    // (Contrast: missing Quill.yaml inside a version dir is quiver_invalid —
    // the version dir exists but lacks its required sentinel file.)
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new QuiverError(
        "transport_error",
        `Source Quiver at "${rootDir}" is missing required "Quiver.yaml"`,
        { cause: err },
      );
    }
    throw new QuiverError(
      "transport_error",
      `Failed to read "Quiver.yaml" at "${quiverYamlPath}": ${(err as Error).message}`,
      { cause: err },
    );
  }

  const meta = parseQuiverYaml(raw);

  // --- Walk quills/ directory ---
  const quillsDir = join(rootDir, "quills");

  let quillNames: string[];
  try {
    quillNames = await readdir(quillsDir);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      // Missing quills/ is fine — empty catalog
      return { meta, catalog: new Map() };
    }
    throw new QuiverError(
      "transport_error",
      `Failed to read "quills/" directory at "${quillsDir}": ${(err as Error).message}`,
      { cause: err },
    );
  }

  const catalog = new Map<string, string[]>();

  for (const quillName of quillNames) {
    const quillNameDir = join(quillsDir, quillName);

    // Ensure it's a directory
    let st;
    try {
      st = await stat(quillNameDir);
    } catch (err) {
      throw new QuiverError(
        "transport_error",
        `Failed to stat "${quillNameDir}": ${(err as Error).message}`,
        { cause: err },
      );
    }
    if (!st.isDirectory()) continue;

    // Read version directories
    let versionDirs: string[];
    try {
      versionDirs = await readdir(quillNameDir);
    } catch (err) {
      throw new QuiverError(
        "transport_error",
        `Failed to read versions for quill "${quillName}": ${(err as Error).message}`,
        { cause: err },
      );
    }

    const versions: string[] = [];

    for (const versionDir of versionDirs) {
      const versionPath = join(quillNameDir, versionDir);

      // Ensure it's a directory
      let vst;
      try {
        vst = await stat(versionPath);
      } catch (err) {
        throw new QuiverError(
          "transport_error",
          `Failed to stat "${versionPath}": ${(err as Error).message}`,
          { cause: err },
        );
      }
      if (!vst.isDirectory()) continue;

      // Non-canonical version → quiver_invalid
      if (!isCanonicalSemver(versionDir)) {
        throw new QuiverError(
          "quiver_invalid",
          `Quill "${quillName}" has non-canonical version directory "${versionDir}" — only x.y.z format is allowed`,
          { quiverName: meta.name, version: versionDir },
        );
      }

      // Require Quill.yaml sentinel inside the version dir
      const quillYamlPath = join(versionPath, "Quill.yaml");
      try {
        await stat(quillYamlPath);
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          throw new QuiverError(
            "quiver_invalid",
            `Quill "${quillName}@${versionDir}" is missing required "Quill.yaml"`,
            { quiverName: meta.name, version: versionDir },
          );
        }
        throw new QuiverError(
          "transport_error",
          `Failed to stat "Quill.yaml" at "${quillYamlPath}": ${(err as Error).message}`,
          { cause: err },
        );
      }

      versions.push(versionDir);
    }

    if (versions.length > 0) {
      // Sort descending
      versions.sort((a, b) => compareSemver(b, a));
      catalog.set(quillName, versions);
    }
  }

  return { meta, catalog };
}

/**
 * Recursively reads all files under a quill version directory into a Map.
 *
 * Keys are relative POSIX paths (forward slashes, no leading slash).
 * Throws `transport_error` on I/O failure.
 */
export async function readQuillTree(quillDir: string): Promise<Map<string, Uint8Array>> {
  const tree: Map<string, Uint8Array> = new Map();
  await walkDir(quillDir, quillDir, tree);
  return tree;
}

async function walkDir(
  baseDir: string,
  currentDir: string,
  tree: Map<string, Uint8Array>,
): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(currentDir);
  } catch (err) {
    throw new QuiverError(
      "transport_error",
      `Failed to read directory "${currentDir}": ${(err as Error).message}`,
      { cause: err },
    );
  }

  for (const entry of entries) {
    const fullPath = join(currentDir, entry);
    let st;
    try {
      st = await stat(fullPath);
    } catch (err) {
      throw new QuiverError(
        "transport_error",
        `Failed to stat "${fullPath}": ${(err as Error).message}`,
        { cause: err },
      );
    }

    if (st.isDirectory()) {
      await walkDir(baseDir, fullPath, tree);
    } else {
      // Compute relative POSIX path
      const rel = relative(baseDir, fullPath);
      const posixRel = sep === "/" ? rel : rel.split(sep).join("/");

      let bytes: Uint8Array;
      try {
        bytes = await readFile(fullPath);
      } catch (err) {
        throw new QuiverError(
          "transport_error",
          `Failed to read file "${fullPath}": ${(err as Error).message}`,
          { cause: err },
        );
      }
      tree.set(posixRel, bytes);
    }
  }
}

/**
 * Source-backed QuiverLoader: loads file trees from a Source Quiver on disk.
 * The outer Quiver.loadTree already validates name/version against the catalog,
 * so this loader trusts the gate and goes straight to reading files.
 */
export class SourceLoader implements QuiverLoader {
  constructor(private readonly rootDir: string) {}

  async loadTree(name: string, version: string): Promise<Map<string, Uint8Array>> {
    const quillDir = join(this.rootDir, "quills", name, version);
    return readQuillTree(quillDir);
  }
}
