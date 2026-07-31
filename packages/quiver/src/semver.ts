/** Returns true for exactly `x.y.z` with non-negative integer parts. */
export function isCanonicalSemver(version: string): boolean {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version);
}

/** Returns true if `version` (canonical) matches `selector` (partial). */
export function matchesSemverSelector(version: string, selector: string): boolean {
  if (selector === version) return true;
  const selectorParts = selector.split(".");
  const versionParts = version.split(".");
  if (
    selectorParts.length === 0 ||
    selectorParts.length > 3 ||
    selectorParts.some((p) => p.length === 0 || Number.isNaN(Number(p)))
  ) {
    return false;
  }
  if (selectorParts.length > versionParts.length) return false;
  for (let i = 0; i < selectorParts.length; i++) {
    if (selectorParts[i] !== versionParts[i]) return false;
  }
  return true;
}

/** Compares two canonical semver strings. Returns <0, 0, or >0. */
export function compareSemver(a: string, b: string): number {
  const partsA = a.split(".").map(Number);
  const partsB = b.split(".").map(Number);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const numA = partsA[i] ?? 0;
    const numB = partsB[i] ?? 0;
    if (numA !== numB) return numA - numB;
  }

  return 0;
}

/** Returns the highest version string, or null if empty. */
export function chooseHighestVersion(versions: string[]): string | null {
  if (versions.length === 0) return null;
  const copy = [...versions];
  copy.sort((a, b) => compareSemver(b, a));
  return copy[0] ?? null;
}
