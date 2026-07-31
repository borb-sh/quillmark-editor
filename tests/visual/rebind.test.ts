// The remount guard (`core/rebind.ts`): the dev-only check that turns the loudest
// silent failure in the API into something an app can see. Unit-scoped to the
// decision — the wrappers' half is one `$effect` calling this with the current prop.
import { describe, it, expect, vi } from 'vitest';
import { rebindGuard } from '$lib/core/rebind';
import type { EditorError } from '$lib/core';

/** A surface's `onError`, as the guard reaches it: read at report time, so a
 *  handler passed as a prop after mount is still the one that hears. */
function sink(): { seen: EditorError[]; get: () => (e: EditorError) => void } {
	const seen: EditorError[] = [];
	return { seen, get: () => (e: EditorError) => seen.push(e) };
}

describe('rebindGuard', () => {
	it('says nothing while the handle is the one it mounted with', () => {
		const to = sink();
		const session = { id: 'a' };
		const guard = rebindGuard('Preview', 'session', session, to.get);
		guard(session);
		guard(session);
		expect(to.seen).toEqual([]);
	});

	it('reports a swapped handle once, naming the prop and the fix', () => {
		const to = sink();
		const mounted = {};
		const guard = rebindGuard('VisualEditor', 'doc', mounted, to.get);
		guard(mounted);
		guard({});
		guard({});
		expect(to.seen).toHaveLength(1);
		expect(to.seen[0].code).toBe('rebind');
		expect(to.seen[0].message).toContain('<VisualEditor>');
		expect(to.seen[0].message).toContain('`doc`');
		expect(to.seen[0].message).toContain('{#key doc}');
	});

	it('falls to the console when the surface has no handler', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const guard = rebindGuard('SourceView', 'doc', {});
		guard({});
		expect(spy).toHaveBeenCalledOnce();
		spy.mockRestore();
	});
});
