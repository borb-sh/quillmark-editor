import { QuiverError } from './errors.js';

/** Internal parsed representation of a quill reference. */
export interface ParsedQuillRef {
	name: string;
	/** Undefined selects the highest version present. */
	selector?: string;
	/** Selector part count: 1 = `x`, 2 = `x.y`, 3 = `x.y.z` (exact). */
	selectorDepth?: 1 | 2 | 3;
}

const NAME_RE = /^[A-Za-z0-9_-]+$/;
const SELECTOR_RE = /^\d+(\.\d+){0,2}$/;

/**
 * Whether `name` is a name a ref can spell. A quiver's own name and every catalog
 * row are held to it: a row seated outside it is one `quillNames` lists and
 * `getQuill` refuses.
 */
export function isQuillName(name: string): boolean {
	return NAME_RE.test(name);
}

/**
 * Throws QuiverError('invalid_ref') on malformed input. The name is
 * `[A-Za-z0-9_-]+`; the selector is `x`, `x.y` or `x.y.z`, digits only, with no
 * ranges or operators — a quiver resolves a prefix, it does not solve a range.
 */
export function parseQuillRef(ref: string): ParsedQuillRef {
	if (!ref) {
		throw new QuiverError('invalid_ref', `Invalid ref: empty string`, { ref });
	}

	const atIndex = ref.indexOf('@');

	if (atIndex === 0) {
		throw new QuiverError('invalid_ref', `Invalid ref: missing name in "${ref}"`, { ref });
	}

	// Split once: the charset the name is held to is one rule, and a ref with a selector
	// is under it exactly as a bare one is.
	const name = atIndex === -1 ? ref : ref.slice(0, atIndex);
	const selector = atIndex === -1 ? undefined : ref.slice(atIndex + 1);

	if (selector === '') {
		throw new QuiverError('invalid_ref', `Invalid ref: missing selector after "@" in "${ref}"`, {
			ref
		});
	}

	if (!NAME_RE.test(name)) {
		throw new QuiverError(
			'invalid_ref',
			`Invalid ref: name "${name}" contains invalid characters`,
			{ ref }
		);
	}

	if (selector === undefined) {
		return { name };
	}

	if (!SELECTOR_RE.test(selector)) {
		throw new QuiverError(
			'invalid_ref',
			`Invalid ref: selector "${selector}" is not a valid semver selector (only x, x.y, x.y.z with digits allowed)`,
			{ ref }
		);
	}

	const parts = selector.split('.');
	const depth = parts.length as 1 | 2 | 3;

	return { name, selector, selectorDepth: depth };
}
