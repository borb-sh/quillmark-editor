/**
 * Build logic — internal, Node-only.
 *
 * All Node.js built-in imports are done dynamically inside `buildQuiver`
 * so that a type-only import of `BuildOptions` from `src/index.ts` does
 * NOT pull `node:fs` or `node:crypto` into browser bundles.
 */

import { QuiverError } from "./errors.js";
import { packFiles } from "./bundle.js";

/** Reserved for future build options (e.g. compression level, filters). */
export type BuildOptions = Record<string, never>;

/** Font file extensions recognised by the builder (case-insensitive). */
const FONT_EXT = /\.(ttf|otf|woff|woff2)$/i;

/**
 * Reads a Source Quiver, validates it, and writes the build output to outDir.
 *
 * Output layout:
 *   outDir/
 *     latest.json                   # stable pointer to the current manifest
 *     manifest.<md5prefix6>.json    # hashed manifest
 *     <name>@<version>.<md5>.zip    # one bundle per quill
 *     store/
 *       <md5>                       # dehydrated font bytes (full hash, no ext)
 *
 * Throws:
 *   - `quiver_invalid` on source validation failures (propagated from scanner)
 *   - `transport_error` on I/O failures
 */
export async function buildQuiver(
  sourceDir: string,
  outDir: string,
  _opts?: BuildOptions,
): Promise<void> {
  // Dynamic imports keep this module safe to type-import from browser contexts.
  const { join } = await import("node:path");
  const {
    mkdir,
    rm,
    writeFile,
  } = await import("node:fs/promises");
  const { createHash } = await import("node:crypto");

  const { scanSourceQuiver, readQuillTree } = await import("./source-loader.js");

  // 1. Scan + validate source quiver (throws quiver_invalid on bad input).
  const { meta, catalog } = await scanSourceQuiver(sourceDir);

  // 2. Clear and recreate outDir + outDir/store/.
  try {
    await rm(outDir, { recursive: true, force: true });
    await mkdir(join(outDir, "store"), { recursive: true });
  } catch (err) {
    throw new QuiverError(
      "transport_error",
      `Failed to prepare output directory "${outDir}": ${(err as Error).message}`,
      { cause: err },
    );
  }

  // 3. Process each quill version.
  const manifestQuills: Array<{
    name: string;
    version: string;
    bundle: string;
    fonts: Record<string, string>;
  }> = [];

  for (const [quillName, versions] of catalog) {
    for (const version of versions) {
      const quillDir = join(sourceDir, "quills", quillName, version);

      // a. Read quill file tree.
      const tree = await readQuillTree(quillDir);

      // b. Partition fonts vs content.
      const fontEntries: Array<[string, Uint8Array]> = [];
      const contentEntries: Array<[string, Uint8Array]> = [];

      for (const [path, bytes] of tree) {
        if (FONT_EXT.test(path)) {
          fontEntries.push([path, bytes]);
        } else {
          contentEntries.push([path, bytes]);
        }
      }

      // c. Dehydrate fonts into store/.
      const fonts: Record<string, string> = {};
      for (const [path, bytes] of fontEntries) {
        const hash = createHash("md5").update(bytes).digest("hex");
        const storePath = join(outDir, "store", hash);

        try {
          await writeFile(storePath, bytes);
        } catch (err) {
          throw new QuiverError(
            "transport_error",
            `Failed to write font store entry "${storePath}": ${(err as Error).message}`,
            { cause: err },
          );
        }

        fonts[path] = hash;
      }

      // d. Zip content files (deterministic: sorted paths, fixed mtime).
      const contentRecord: Record<string, Uint8Array> = {};
      for (const [path, bytes] of contentEntries) {
        contentRecord[path] = bytes;
      }
      const zipBytes = packFiles(contentRecord);

      // e–f. Compute bundle hash and name.
      const bundleHash = createHash("md5").update(zipBytes).digest("hex").slice(0, 6);
      const bundleName = `${quillName}@${version}.${bundleHash}.zip`;

      // g. Write bundle zip.
      const bundlePath = join(outDir, bundleName);
      try {
        await writeFile(bundlePath, zipBytes);
      } catch (err) {
        throw new QuiverError(
          "transport_error",
          `Failed to write bundle "${bundlePath}": ${(err as Error).message}`,
          { cause: err },
        );
      }

      // h. Record manifest entry.
      manifestQuills.push({ name: quillName, version, bundle: bundleName, fonts });
    }
  }

  // 4–8. Build and write hashed manifest.
  const manifest = {
    version: 1 as const,
    name: meta.name,
    quills: manifestQuills,
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestHash = createHash("md5").update(manifestJson).digest("hex").slice(0, 6);
  const manifestFileName = `manifest.${manifestHash}.json`;
  const manifestPath = join(outDir, manifestFileName);

  try {
    await writeFile(manifestPath, manifestJson, "utf-8");
  } catch (err) {
    throw new QuiverError(
      "transport_error",
      `Failed to write manifest "${manifestPath}": ${(err as Error).message}`,
      { cause: err },
    );
  }

  // 9–10. Write stable pointer latest.json.
  const pointer = { manifest: manifestFileName };
  const pointerPath = join(outDir, "latest.json");

  try {
    await writeFile(pointerPath, JSON.stringify(pointer), "utf-8");
  } catch (err) {
    throw new QuiverError(
      "transport_error",
      `Failed to write pointer "${pointerPath}": ${(err as Error).message}`,
      { cause: err },
    );
  }
}
