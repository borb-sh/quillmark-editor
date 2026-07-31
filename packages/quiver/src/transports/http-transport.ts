/**
 * HttpTransport — browser-safe built-quiver transport that fetches via HTTP.
 * Internal; not exported from index.ts.
 *
 * Uses globalThis.fetch — no node: imports at any level.
 */

import { QuiverError } from "../errors.js";
import type { BuiltTransport } from "../built-loader.js";

export class HttpTransport implements BuiltTransport {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    // Normalize: ensure exactly one trailing slash.
    this.baseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  }

  async fetchBytes(relativePath: string): Promise<Uint8Array> {
    // Strip any leading slash from relativePath to avoid double slashes.
    const cleanPath = relativePath.startsWith("/")
      ? relativePath.slice(1)
      : relativePath;

    const url = `${this.baseUrl}${cleanPath}`;

    let response: Response;
    try {
      response = await globalThis.fetch(url);
    } catch (err) {
      throw new QuiverError(
        "transport_error",
        `Network error fetching "${url}": ${(err as Error).message}`,
        { cause: err },
      );
    }

    if (!response.ok) {
      throw new QuiverError(
        "transport_error",
        `HTTP ${response.status} fetching "${url}"`,
      );
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }
}
