// The other half of the unitless-dial guard. The derivation CONTAINS a bad length
// dial — the private rung it lands in is registered, so `--qm-space: 4` falls back
// to that rung's floor instead of collapsing every `calc()` below it — and
// containment is silent by construction: the surface renders at its defaults, and
// a consumer who turned a dial and saw nothing move has no reason to suspect the
// value rather than the selector.
//
// So: one dev-only read per mounted surface, over the three dials whose values are
// lengths. It reports through the same channel as everything else and costs
// nothing in production (`DEV` is statically false, and the function is a no-op).
import { DEV } from 'esm-env';
import { reportError, type EditorErrorHandler } from './errors.js';

/** The dials a bad value can silently swallow: the three the derivation reads as
 *  `<length>`. The colour dials fail visibly and the family dials cannot fail. */
const LENGTH_DIALS = ['--qm-space', '--qm-radius', '--qm-font-size'] as const;

/** A CSS length, as a computed dial value reads: a number with a unit, a `calc()`,
 *  or a `var()` the cascade has not yet resolved. `0` is a length without one. */
const LENGTH =
	/^(0|[+-]?\d*\.?\d+(px|rem|em|ch|ex|vh|vw|vmin|vmax|cm|mm|in|pt|pc|q)|calc\(|var\()/i;

/**
 * Check the length dials set on `root`, once, in dev. A dial the consumer never
 * set reads empty and is skipped; one set to something that is not a length is
 * reported with the value, since that string is the whole diagnosis.
 */
export function checkDials(
	root: HTMLElement | undefined,
	surface: string,
	onError?: () => EditorErrorHandler | undefined
): void {
	if (!DEV || !root) return;
	const style = getComputedStyle(root);
	for (const dial of LENGTH_DIALS) {
		const value = style.getPropertyValue(dial).trim();
		if (!value || LENGTH.test(value)) continue;
		reportError(onError?.(), {
			code: 'dial',
			message:
				`<${surface}> reads \`${dial}: ${value}\`, which is not a length. The surface is ` +
				`rendering at that axis's default: the derivation contains the bad value at one ` +
				`rung rather than passing it to every calc() below. Give it a unit.`
		});
	}
}
