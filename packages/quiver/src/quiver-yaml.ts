/**
 * Internal parser/validator for Quiver.yaml files.
 *
 * Uses the `yaml` npm package for robust YAML parsing. Quiver.yaml has a
 * simple two-field schema (name, description), but using a proper YAML parser
 * ensures correct handling of quoting, escaping, and multi-line strings.
 */

import { parse as parseYaml } from "yaml";
import { QuiverError } from "./errors.js";

export interface QuiverMeta {
  name: string;
  description?: string;
}

const NAME_RE = /^[A-Za-z0-9_-]+$/;

const KNOWN_FIELDS = new Set(["name", "description"]);

/**
 * Parses and validates Quiver.yaml contents.
 *
 * Throws `QuiverError('quiver_invalid')` on:
 *   - YAML parse failure
 *   - Missing or non-string `name`
 *   - `name` fails charset validation [A-Za-z0-9_-]+
 *   - Unknown fields (strict)
 *   - `description` present but not a string
 */
export function parseQuiverYaml(raw: string | Uint8Array): QuiverMeta {
  const text =
    typeof raw === "string" ? raw : new TextDecoder().decode(raw);

  let parsed: unknown;
  try {
    parsed = parseYaml(text);
  } catch (err) {
    throw new QuiverError(
      "quiver_invalid",
      `Quiver.yaml: YAML parse failure — ${err instanceof Error ? err.message : String(err)}`,
      { cause: err },
    );
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new QuiverError(
      "quiver_invalid",
      `Quiver.yaml: expected a mapping at the top level, got ${Array.isArray(parsed) ? "array" : String(parsed)}`,
    );
  }

  const doc = parsed as Record<string, unknown>;

  // Check for unknown fields (strict mode)
  for (const key of Object.keys(doc)) {
    if (!KNOWN_FIELDS.has(key)) {
      throw new QuiverError(
        "quiver_invalid",
        `Quiver.yaml: unknown field "${key}" — only "name" and "description" are valid in V1`,
      );
    }
  }

  // Validate `name`
  if (!("name" in doc)) {
    throw new QuiverError(
      "quiver_invalid",
      `Quiver.yaml: required field "name" is missing`,
    );
  }

  if (typeof doc["name"] !== "string") {
    throw new QuiverError(
      "quiver_invalid",
      `Quiver.yaml: "name" must be a string, got ${typeof doc["name"]}`,
    );
  }

  const name = doc["name"] as string;

  if (!NAME_RE.test(name)) {
    throw new QuiverError(
      "quiver_invalid",
      `Quiver.yaml: "name" value "${name}" contains invalid characters — only [A-Za-z0-9_-] are allowed`,
    );
  }

  // Validate optional `description`
  if ("description" in doc && doc["description"] !== undefined) {
    if (typeof doc["description"] !== "string") {
      throw new QuiverError(
        "quiver_invalid",
        `Quiver.yaml: "description" must be a string if present, got ${typeof doc["description"]}`,
      );
    }
  }

  const meta: QuiverMeta = { name };
  if (typeof doc["description"] === "string") {
    meta.description = doc["description"];
  }

  return meta;
}
