// The remount contract, enforced. `Preview` binds its props ONCE, in `onMount`, and
// observes nothing after: the vanilla core below it owns scroll position, mounted
// slots and observer sets that a remount would discard on every apply. So a prop
// swapped in place is reported, not dropped in silence.
//
// A guard over ONE prop of a set is worse than none: a consumer who learns the
// surface complains when it ignores a prop reads silence on the rest as reactivity.
// The snapshot is every once-bound prop, and one report names whichever went stale.
import { reportError, type EditorErrorHandler } from './errors.js';

/** The once-bound props by name, `onError` among them. */
export type Bound = Record<string, unknown> & { onError?: EditorErrorHandler };

/**
 * Report `rebind-ignored` once, at `dev`, when any prop `snapshot` names is swapped
 * in place. `remount` closes the message with the surface's own remount spelling
 * (`Remount the preview ({#key session}) to rebind.`).
 *
 * Mounted identities are recorded on the effect's FIRST run, the flush the surface
 * binds in; every later comparison reads them through the same `snapshot`.
 *
 * The report goes to the SNAPSHOT's `onError`: every other error these surfaces
 * report reaches the handler they bound, and a swapped `onError` is itself one of
 * the reports.
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
