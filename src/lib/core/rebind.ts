// The REMOUNT CONTRACT, made loud. Every surface binds its handles ONCE at mount
// — the VisualEditor seeds its card ids and leaf registry from the initial `doc`,
// the preview builds its paint loop over the initial `session`, the source view
// serializes the initial `doc` — and a later prop change is not observed. That is
// documented where a consumer does not read it (JSDoc), and the failure it
// produces is the worst kind: a surface pointed at the previous handle, editing a
// document nobody is looking at, with no error anywhere.
//
// So the guard is a dev-only identity check the wrapper runs on its own prop. It
// costs one comparison per render in dev and nothing at all in production
// (`esm-env`'s `DEV` is statically false there, and the factory returns a no-op).
// Framework-free: the wrappers own the `$effect`, this owns what to say.
import { DEV } from 'esm-env';
import { reportError, type EditorErrorHandler } from './errors.js';

/**
 * Watch one bound-at-mount prop. Returns the checker the wrapper calls with the
 * CURRENT prop value; it reports at most once per surface instance, since a
 * consumer who swapped a handle will keep swapping it and a warning per render is
 * a warning nobody reads.
 */
export function rebindGuard(
	surface: string,
	prop: string,
	mounted: unknown,
	onError?: () => EditorErrorHandler | undefined
): (current: unknown) => void {
	if (!DEV) return () => {};
	let reported = false;
	return (current: unknown) => {
		if (reported || current === mounted) return;
		reported = true;
		reportError(onError?.(), {
			code: 'rebind',
			message:
				`<${surface}> received a new \`${prop}\` after mount; it is still bound to the one it ` +
				`mounted with. Swap by REMOUNTING (\`{#key ${prop}}\`), or drive the change through the ` +
				`surface's own verbs.`
		});
	};
}
