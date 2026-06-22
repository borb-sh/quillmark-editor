/**
 * Built-quiver loader — browser-safe at module level.
 * Internal; not exported from index.ts.
 *
 * Exposes:
 *   - BuiltTransport interface (implemented by HttpTransport)
 *   - loadBuiltQuiver(transport) → Quiver
 *
 * NO static node: imports — this module is safe to load in browser contexts.
 */

import { QuiverError } from "./errors.js";
import { unpackFiles } from "./bundle.js";
import { isCanonicalSemver, compareSemver } from "./semver.js";
import type { QuiverLoader } from "./quiver.js";
import { Quiver } from "./quiver.js";

// ─── Internal types ───────────────────────────────────────────────────────────

interface BuiltQuillEntry {
  name: string;
  version: string;
  bundle: string;
  fonts: Record<string, string>;
}

interface BuiltManifest {
  version: 1;
  name: string;
  quills: BuiltQuillEntry[];
}

// ─── Public interface (internal to the package) ───────────────────────────────

/**
 * Transport abstraction: fetch raw bytes by relative path within the packed
 * artifact. Sole implementation is HttpTransport (browser + Node).
 */
export interface BuiltTransport {
  fetchBytes(relativePath: string): Promise<Uint8Array>;
}

// ─── Path validation ──────────────────────────────────────────────────────────

const MANIFEST_FILENAME_RE = /^manifest\.[0-9a-f]+\.json$/;
const BUNDLE_FILENAME_RE = /^[A-Za-z0-9_.-]+@[0-9]+\.[0-9]+\.[0-9]+\.[0-9a-f]+\.zip$/;
const FONT_HASH_RE = /^[0-9a-f]{32}$/;

function validateManifestFileName(name: string): void {
  if (!MANIFEST_FILENAME_RE.test(name)) {
    throw new QuiverError(
      "quiver_invalid",
      `Pointer manifest filename is invalid: "${name}"`,
    );
  }
}

function validateBundleFileName(bundle: string, context: string): void {
  if (!BUNDLE_FILENAME_RE.test(bundle)) {
    throw new QuiverError(
      "quiver_invalid",
      `${context}: bundle filename is invalid: "${bundle}"`,
    );
  }
}

function validateFontHash(hash: string, context: string): void {
  if (!FONT_HASH_RE.test(hash)) {
    throw new QuiverError(
      "quiver_invalid",
      `${context}: font hash is invalid: "${hash}"`,
    );
  }
}

// ─── BuiltLoader implementation ─────────────────────────────────────────────

class BuiltLoader implements QuiverLoader {
  /** Font byte cache: hash → in-flight or resolved Promise. */
  private readonly fontCache: Map<string, Promise<Uint8Array>> = new Map();

  constructor(
    private readonly transport: BuiltTransport,
    /** Index map from "name@version" to its manifest entry. */
    private readonly index: Map<string, BuiltQuillEntry>,
  ) {}

  async loadTree(name: string, version: string): Promise<Map<string, Uint8Array>> {
    const entry = this.index.get(`${name}@${version}`);

    // If entry is missing, the outer Quiver.loadTree gate already validated
    // that this name/version is in the catalog; trust that gate and fall
    // through. The transport will surface a transport_error naturally.
    // (Defensive: this should not be reachable in normal operation.)

    if (!entry) {
      throw new QuiverError(
        "transport_error",
        `Quill "${name}@${version}" not found in built-quiver manifest`,
        { version, ref: `${name}@${version}` },
      );
    }

    // 1. Fetch + unpack bundle zip.
    const zipBytes = await this.transport.fetchBytes(entry.bundle);
    const files = unpackFiles(zipBytes);

    // 2. Rehydrate fonts from store (coalesced).
    const fontEntries = Object.entries(entry.fonts);
    await Promise.all(
      fontEntries.map(async ([path, hash]) => {
        files[path] = await this.fetchFont(hash);
      }),
    );

    // 3. Convert to Map.
    return new Map(Object.entries(files));
  }

  /**
   * Fetch a font by hash from store/<hash>, coalescing concurrent requests for
   * the same hash into a single fetch. On error, removes the cache entry so
   * callers can retry.
   */
  private fetchFont(hash: string): Promise<Uint8Array> {
    let promise = this.fontCache.get(hash);
    if (!promise) {
      promise = this.transport
        .fetchBytes(`store/${hash}`)
        .catch((err: unknown) => {
          this.fontCache.delete(hash);
          throw err;
        });
      this.fontCache.set(hash, promise);
    }
    return promise;
  }
}

// ─── Pointer + manifest validation helpers ────────────────────────────────────

function assertNoUnknownKeys(
  obj: Record<string, unknown>,
  allowed: string[],
  context: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) {
      throw new QuiverError(
        "quiver_invalid",
        `${context}: unknown field "${key}"`,
      );
    }
  }
}

function parsePointer(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new QuiverError("quiver_invalid", "latest.json contains invalid JSON");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new QuiverError("quiver_invalid", "latest.json must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;
  assertNoUnknownKeys(obj, ["manifest"], "latest.json");

  if (typeof obj["manifest"] !== "string" || obj["manifest"].length === 0) {
    throw new QuiverError(
      "quiver_invalid",
      'latest.json must have a non-empty string "manifest" field',
    );
  }

  return obj["manifest"] as string;
}

function parseManifest(raw: string): BuiltManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new QuiverError(
      "quiver_invalid",
      "Manifest file contains invalid JSON",
    );
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new QuiverError("quiver_invalid", "Manifest must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;
  assertNoUnknownKeys(obj, ["version", "name", "quills"], "manifest");

  if (obj["version"] !== 1) {
    throw new QuiverError(
      "quiver_invalid",
      `Manifest version must be 1, got ${String(obj["version"])}`,
    );
  }

  if (typeof obj["name"] !== "string" || obj["name"].length === 0) {
    throw new QuiverError(
      "quiver_invalid",
      'Manifest must have a non-empty string "name" field',
    );
  }

  if (!Array.isArray(obj["quills"])) {
    throw new QuiverError(
      "quiver_invalid",
      'Manifest must have a "quills" array',
    );
  }

  const quills: BuiltQuillEntry[] = [];

  for (let i = 0; i < (obj["quills"] as unknown[]).length; i++) {
    const entry = (obj["quills"] as unknown[])[i];

    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new QuiverError(
        "quiver_invalid",
        `manifest.quills[${i}] must be an object`,
      );
    }

    const e = entry as Record<string, unknown>;
    assertNoUnknownKeys(
      e,
      ["name", "version", "bundle", "fonts"],
      `manifest.quills[${i}]`,
    );

    if (typeof e["name"] !== "string" || (e["name"] as string).length === 0) {
      throw new QuiverError(
        "quiver_invalid",
        `manifest.quills[${i}].name must be a non-empty string`,
      );
    }

    if (
      typeof e["version"] !== "string" ||
      !isCanonicalSemver(e["version"] as string)
    ) {
      throw new QuiverError(
        "quiver_invalid",
        `manifest.quills[${i}].version must be canonical semver (x.y.z), got "${String(e["version"])}"`,
      );
    }

    if (
      typeof e["bundle"] !== "string" ||
      (e["bundle"] as string).length === 0
    ) {
      throw new QuiverError(
        "quiver_invalid",
        `manifest.quills[${i}].bundle must be a non-empty string`,
      );
    }

    validateBundleFileName(
      e["bundle"] as string,
      `manifest.quills[${i}].bundle`,
    );

    if (
      typeof e["fonts"] !== "object" ||
      e["fonts"] === null ||
      Array.isArray(e["fonts"])
    ) {
      throw new QuiverError(
        "quiver_invalid",
        `manifest.quills[${i}].fonts must be an object`,
      );
    }

    const fonts = e["fonts"] as Record<string, unknown>;
    for (const [k, v] of Object.entries(fonts)) {
      if (typeof v !== "string") {
        throw new QuiverError(
          "quiver_invalid",
          `manifest.quills[${i}].fonts["${k}"] must be a string`,
        );
      }
      validateFontHash(v, `manifest.quills[${i}].fonts["${k}"]`);
    }

    quills.push({
      name: e["name"] as string,
      version: e["version"] as string,
      bundle: e["bundle"] as string,
      fonts: fonts as Record<string, string>,
    });
  }

  return {
    version: 1,
    name: obj["name"] as string,
    quills,
  };
}

// ─── Catalog assembly ─────────────────────────────────────────────────────────

/**
 * Validate manifest bytes (`quiver_invalid` on format errors) and assemble a
 * Quiver backed by a BuiltLoader over `transport`. Shared by `loadBuiltQuiver`
 * (pointer-following) and `seedBuiltQuiver` (seed).
 */
function buildQuiverFromManifestBytes(
  transport: BuiltTransport,
  manifestBytes: Uint8Array,
): Quiver {
  const manifest = parseManifest(new TextDecoder().decode(manifestBytes));

  // catalog: name → versions (desc); index: "name@version" → entry (dedup).
  const catalogRaw = new Map<string, string[]>();
  const index = new Map<string, BuiltQuillEntry>();

  for (const entry of manifest.quills) {
    const key = `${entry.name}@${entry.version}`;
    if (index.has(key)) {
      throw new QuiverError(
        "quiver_invalid",
        `Duplicate quill entry in manifest: "${key}"`,
      );
    }
    index.set(key, entry);

    const versions = catalogRaw.get(entry.name) ?? [];
    versions.push(entry.version);
    catalogRaw.set(entry.name, versions);
  }

  for (const [, versions] of catalogRaw) {
    versions.sort((a, b) => compareSemver(b, a));
  }

  const loader = new BuiltLoader(transport, index);

  return Quiver._fromLoader(manifest.name, catalogRaw, loader);
}

// ─── Main entry points ────────────────────────────────────────────────────────

/**
 * Load a build-output quiver via the given transport.
 *
 * 1. Fetches latest.json (pointer) and parses it.
 * 2. Fetches the manifest file it points to and validates it.
 * 3. Builds a catalog from manifest entries (versions sorted descending).
 * 4. Returns a Quiver instance backed by a BuiltLoader.
 */
export async function loadBuiltQuiver(
  transport: BuiltTransport,
): Promise<Quiver> {
  // 1. Fetch and parse pointer.
  let pointerBytes: Uint8Array;
  try {
    pointerBytes = await transport.fetchBytes("latest.json");
  } catch (err) {
    if (err instanceof QuiverError) throw err;
    throw new QuiverError(
      "transport_error",
      `Failed to fetch latest.json: ${(err as Error).message}`,
      { cause: err },
    );
  }

  const manifestFileName = parsePointer(
    new TextDecoder().decode(pointerBytes),
  );

  validateManifestFileName(manifestFileName);

  // 2. Fetch and parse manifest.
  let manifestBytes: Uint8Array;
  try {
    manifestBytes = await transport.fetchBytes(manifestFileName);
  } catch (err) {
    if (err instanceof QuiverError) throw err;
    throw new QuiverError(
      "transport_error",
      `Failed to fetch manifest "${manifestFileName}": ${(err as Error).message}`,
      { cause: err },
    );
  }

  // 3–4. Validate manifest + assemble catalog/loader.
  return buildQuiverFromManifestBytes(transport, manifestBytes);
}

/**
 * Seed a quiver from caller-provided manifest bytes, skipping the latest.json
 * pointer fetch. `transport` is used only for lazy bundle/font fetches.
 * Throws `quiver_invalid` on malformed bytes.
 */
export function seedBuiltQuiver(
  transport: BuiltTransport,
  manifestBytes: Uint8Array,
): Quiver {
  return buildQuiverFromManifestBytes(transport, manifestBytes);
}
