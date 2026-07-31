// The bundled wiring (`@quillmark/editor/bridge`). What is asserted is what a
// hand-copied bridge gets wrong: a structure op that waits behind a debounce, a
// keystroke burst that recompiles per key, a caret hop that translates, and a
// timer that fires after teardown. The handles are structural, so the whole thing
// is testable against three objects and no surface at all — which is also the
// property that keeps the two surfaces mutually unaware.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connect } from '$lib/bridge';
import type { ChangeSet, Document, EditorError, LiveSession } from '$lib/core';

function harness(applyImpl?: () => ChangeSet) {
	const applied: number[] = [];
	let n = 0;
	const session = {
		apply: () => {
			applied.push(++n);
			return applyImpl ? applyImpl() : ({ pageCount: 1, dirtyPages: [0] } as ChangeSet);
		}
	} as unknown as LiveSession;
	const refreshed: ChangeSet[] = [];
	const serialized: number[] = [];
	const carets: unknown[] = [];
	const hits: unknown[] = [];
	const bridge = connect({ session, doc: {} as Document, debounce: 20 });
	bridge.preview = {
		refresh: (c) => refreshed.push(c),
		focusPosition: (at) => carets.push(at)
	};
	bridge.source = { refresh: () => serialized.push(1) };
	bridge.editor = { setCaret: (hit) => hits.push(hit) };
	return { bridge, applied, refreshed, serialized, carets, hits };
}

describe('connect', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('settles a burst of prose into ONE recompile, and fans it to both mirrors', () => {
		const h = harness();
		for (let i = 0; i < 5; i++) h.bridge.editorProps.onChange({ source: 'prose' });
		expect(h.applied).toEqual([]); // nothing yet: the burst is still arriving
		vi.advanceTimersByTime(20);
		expect(h.applied).toEqual([1]);
		expect(h.refreshed).toHaveLength(1);
		expect(h.serialized).toHaveLength(1);
	});

	it('applies a structure op at once, and drops the pending burst with it', () => {
		const h = harness();
		h.bridge.editorProps.onChange({ source: 'field' });
		h.bridge.editorProps.onChange({ source: 'structure' });
		expect(h.applied).toEqual([1]);
		vi.advanceTimersByTime(50);
		expect(h.applied).toEqual([1]); // the scheduled one was folded in, not re-run
	});

	it('passes each caret straight through, in both directions', () => {
		const h = harness();
		h.bridge.editorProps.onCaretMove({ field: 'main.subject', pos: 4 });
		h.bridge.previewProps.onCaretPick({ field: 'cards.indorsement[0].body', pos: 9 });
		expect(h.carets).toEqual([{ field: 'main.subject', pos: 4 }]);
		expect(h.hits).toEqual([{ field: 'cards.indorsement[0].body', pos: 9 }]);
	});

	it('wires a surface that mounts later, since handles are read at call time', () => {
		const h = harness();
		h.bridge.preview = undefined;
		h.bridge.editorProps.onChange({ source: 'structure' }); // no preview yet: no throw
		h.bridge.preview = { refresh: (c) => h.refreshed.push(c), focusPosition: () => {} };
		h.bridge.editorProps.onChange({ source: 'structure' });
		expect(h.refreshed).toHaveLength(1);
	});

	it('reports a recompile that threw, and stands', () => {
		const seen: EditorError[] = [];
		const session = {
			apply: () => {
				throw new Error('backend refused');
			}
		} as unknown as LiveSession;
		const bridge = connect({ session, doc: {} as Document, onError: (e) => seen.push(e) });
		bridge.flush();
		expect(seen.map((e) => e.code)).toEqual(['apply']);
		bridge.destroy();
	});

	it('fires no recompile after destroy', () => {
		const h = harness();
		h.bridge.editorProps.onChange({ source: 'prose' });
		h.bridge.destroy();
		vi.advanceTimersByTime(100);
		expect(h.applied).toEqual([]);
	});
});
