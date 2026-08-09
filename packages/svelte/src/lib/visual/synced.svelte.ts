// The controlled-local reconcile shared by the scalar controls (TextField /
// NumberField / DateField / BooleanField / EnumField). Each seeds a local from a
// projection of its `value` prop and reconciles ONLY an external change back into
// the local: own edits stay `untrack`ed, so typing never re-runs the sync and
// resets the caret. One copy for all five, rather than a character-identical block
// in each (VISUAL_EDITOR §Surface).
import { untrack } from 'svelte';

/** A settable local synced to an external projection. Bind `.value` in the
 * template; assign `.value` on input. */
export interface SyncedLocal<T> {
	value: T;
}

/**
 * Seed a local from `project` and reconcile only an EXTERNAL change into it.
 * `project` reads the reactive source (a prop) and maps it to the local's type:
 * ` => value ?? ''`, ` => (value != null ? String(value) : '')`, etc. The
 * seed is `untrack`ed (the ongoing sync is the `$effect`, not the initializer),
 * and each reconcile is `untrack`ed so an own-edit write never re-triggers it.
 * Reassignment through the `value` setter is a plain local write; only a changed
 * `project` result flows the other way.
 */
export function syncedLocal<T>(project: () => T): SyncedLocal<T> {
	let local = $state(untrack(project));
	$effect(() => {
		const incoming = project();
		untrack(() => {
			if (incoming !== local) local = incoming;
		});
	});
	return {
		get value() {
			return local;
		},
		set value(v: T) {
			local = v;
		}
	};
}
