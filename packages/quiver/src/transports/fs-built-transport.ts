/**
 * FsBuiltTransport — Node-only built-quiver transport that reads packed
 * artifacts from the local filesystem.
 * Internal; not exported from index.ts.
 *
 * Static `node:*` imports — this module must never be reached from browser
 * bundles. It is loaded lazily by `Quiver.fromBuiltDir` in `./node.js`.
 */

import { readFile } from "node:fs/promises";
import { join, isAbsolute, normalize, sep } from "node:path";

import { QuiverError } from "../errors.js";
import type { BuiltTransport } from "../built-loader.js";

export class FsBuiltTransport implements BuiltTransport {
  constructor(private readonly rootDir: string) {}

  async fetchBytes(relativePath: string): Promise<Uint8Array> {
    if (isAbsolute(relativePath)) {
      throw new QuiverError(
        "transport_error",
        `FsBuiltTransport: absolute paths are not allowed: "${relativePath}"`,
      );
    }

    const normalized = normalize(relativePath);
    if (normalized.startsWith("..") || normalized.split(sep).includes("..")) {
      throw new QuiverError(
        "transport_error",
        `FsBuiltTransport: path escapes root: "${relativePath}"`,
      );
    }

    const filePath = join(this.rootDir, normalized);

    try {
      const buf = await readFile(filePath);
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (err) {
      throw new QuiverError(
        "transport_error",
        `Failed to read "${filePath}": ${(err as Error).message}`,
        { cause: err },
      );
    }
  }
}
