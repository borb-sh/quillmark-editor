// The remount guard (`core/rebind.ts`): the dev-only check that turns the loudest
// silent failure in the API into a console line. Unit-scoped to the decision — the
// wrappers' half is one `$effect` calling this with the current prop.
import { describe, it, expect, vi } from 'vitest';
import { rebindGuard } from '$lib/core/rebind';

describe('rebindGuard', () => {
	it('says nothing while the handle is the one it mounted with', () => {
		const said: string[] = [];
		const session = { id: 'a' };
		const guard = rebindGuard('Preview', 'session', session, (m) => said.push(m));
		guard(session);
		guard(session);
		expect(said).toEqual([]);
	});

	it('reports a swapped handle once, naming the prop and the fix', () => {
		const said: string[] = [];
		const mounted = {};
		const guard = rebindGuard('VisualEditor', 'doc', mounted, (m) => said.push(m));
		guard(mounted);
		guard({});
		guard({});
		expect(said).toHaveLength(1);
		expect(said[0]).toContain('<VisualEditor>');
		expect(said[0]).toContain('`doc`');
		expect(said[0]).toContain('{#key doc}');
	});

	it('falls to the console when the surface has no reporter', () => {
		const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
		const guard = rebindGuard('SourceView', 'doc', {});
		guard({});
		expect(spy).toHaveBeenCalledOnce();
		spy.mockRestore();
	});
});
