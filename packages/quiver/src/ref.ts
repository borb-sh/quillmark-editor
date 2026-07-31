import { QuiverError } from "./errors.js";

/** Internal parsed representation of a quill reference. */
export interface ParsedQuillRef {
  name: string;
  /** Undefined = "highest in first-winning quiver". */
  selector?: string;
  /** Selector part count: 1 = `x`, 2 = `x.y`, 3 = `x.y.z` (exact). */
  selectorDepth?: 1 | 2 | 3;
}

const NAME_RE = /^[A-Za-z0-9_-]+$/;
const SELECTOR_RE = /^\d+(\.\d+){0,2}$/;

/**
 * Throws QuiverError('invalid_ref') on malformed input.
 * Validates name charset: [A-Za-z0-9_-]+
 * Validates selector per §5 (x, x.y, x.y.z — digits only, no ranges/operators).
 */
export function parseQuillRef(ref: string): ParsedQuillRef {
  if (!ref) {
    throw new QuiverError("invalid_ref", `Invalid ref: empty string`, { ref });
  }

  const atIndex = ref.indexOf("@");

  if (atIndex === 0) {
    // Starts with @, no name
    throw new QuiverError("invalid_ref", `Invalid ref: missing name in "${ref}"`, { ref });
  }

  if (atIndex === -1) {
    // No selector — just a name
    const name = ref;
    if (!NAME_RE.test(name)) {
      throw new QuiverError("invalid_ref", `Invalid ref: name "${name}" contains invalid characters`, { ref });
    }
    return { name };
  }

  // Has @
  const name = ref.slice(0, atIndex);
  const selector = ref.slice(atIndex + 1);

  if (!name) {
    throw new QuiverError("invalid_ref", `Invalid ref: missing name in "${ref}"`, { ref });
  }

  if (!selector) {
    throw new QuiverError("invalid_ref", `Invalid ref: missing selector after "@" in "${ref}"`, { ref });
  }

  if (!NAME_RE.test(name)) {
    throw new QuiverError("invalid_ref", `Invalid ref: name "${name}" contains invalid characters`, { ref });
  }

  if (!SELECTOR_RE.test(selector)) {
    throw new QuiverError(
      "invalid_ref",
      `Invalid ref: selector "${selector}" is not a valid semver selector (only x, x.y, x.y.z with digits allowed)`,
      { ref },
    );
  }

  const parts = selector.split(".");
  const depth = parts.length as 1 | 2 | 3;

  return { name, selector, selectorDepth: depth };
}
