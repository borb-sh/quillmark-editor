/**
 * Zip utilities — browser-safe (uses fflate only).
 */

import { zipSync, unzipSync } from "fflate";

/**
 * Fixed epoch mtime for deterministic zip output.
 *
 * fflate reads mtime via local-time getters (getFullYear/getMonth/...) and rejects
 * years before 1980. Date.UTC(1980, 0, 1) becomes 1979-12-31 in any TZ west of UTC,
 * which both crashes the encoder and (where it doesn't crash) produces TZ-dependent
 * bytes. Using the local-time constructor anchors the components to 1980-01-01
 * 00:00:00 in *every* timezone, so the DOS timestamp written into the zip header
 * is always identical.
 */
const ZIP_EPOCH = new Date(1980, 0, 1, 0, 0, 0, 0);

/**
 * Pack a flat file map into a deterministic zip.
 * Keys are sorted before zipping so insertion order doesn't affect output.
 */
export function packFiles(files: Record<string, Uint8Array>): Uint8Array {
  const sorted = Object.keys(files).sort();
  const input: Record<string, [Uint8Array, { mtime: Date }]> = {};
  for (const key of sorted) {
    input[key] = [files[key]!, { mtime: ZIP_EPOCH }];
  }
  return zipSync(input, { level: 6 });
}

/**
 * Unpack a zip into a flat file map.
 * Returns { path: Uint8Array } for every file entry in the archive.
 */
export function unpackFiles(data: Uint8Array): Record<string, Uint8Array> {
  const raw = unzipSync(data);
  const result: Record<string, Uint8Array> = {};
  for (const [key, value] of Object.entries(raw)) {
    result[key] = value;
  }
  return result;
}
