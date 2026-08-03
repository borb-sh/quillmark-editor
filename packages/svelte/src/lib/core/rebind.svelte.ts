// The remount contract, enforced. `Preview` and `SourceView` bind their props ONCE,
// in `onMount`, and observe nothing after: the vanilla cores below them own scroll
// position, mounted slots and observer sets that a remount would discard on every
// apply, which is what makes the contract right rather than a shortcut. What the
// surfaces owe is to stop being silent about a prop they were handed and ignored.
//
// A guard over ONE prop is worse than no guard: a consumer who learns the surface
// complains when it ignores a prop reads silence on the rest as reactivity. So the
// snapshot is every once-bound prop, and one report names whichever went stale.
import { reportError, type EditorErrorHandler } from './errors.js';

/** The once-bound props by name, `onError` among them. */
export type Bound = Record<string, unknown> & { onError?: EditorErrorHandler };

/**
 * Report `rebind-ignored` once, at `dev`, when any prop `snapshot` names is swapped
 * in place. `remount` completes the message with the surface's own remount spelling
 * (`Remount it ({#key session}) to rebind.`).
 *
 * The mounted identities are recorded on the effect's FIRST run: the same flush the
 * surface binds in, and every comparison after it comes from the same reader.
 *
 * The report goes to the SNAPSHOT's `onError`: every other error these surfaces
 * report reaches the handler they bound, and a swapped `onError` is one of the
 * things being reported.
 */
export function guardRebind(snapshot: () => Bound, remount: string): void {
	let mounted: Bound | undefined;
	let reported = false;
	$effect(() => {
		const live = snapshot();
		if (mounted === undefined) {
			mounted = live;
			return;
		}
		if (reported) return;
		const bound = mounted;
		const stale = Object.keys(bound).filter((k) => live[k] !== bound[k]);
		if (stale.length === 0) return;
		reported = true;
		reportError(bound.onError, {
			code: 'rebind-ignored',
			severity: 'dev',
			message: `${stale.join(', ')} swapped in place; the mounted surface still holds what it bound at mount. ${remount}`
		});
	});
}
