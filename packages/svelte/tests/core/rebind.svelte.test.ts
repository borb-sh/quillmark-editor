// @vitest-environment jsdom
// The remount contract on the two vanilla-core surfaces: EVERY once-bound prop
// answers a swap, in one report per surface naming whichever went stale. A guard
// covering part of a set is what teaches a consumer to read silence on the rest as
// reactivity, so the set is what is asserted. The last case is the one that costs
// the guard its worth if it fails: a mount that swaps nothing reports nothing.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { Document, type LiveSession } from '@quillmark/wasm';
import type { EditorError } from '$lib/core';
import Preview from '$lib/preview/Preview.svelte';
import SourceView from '$lib/source/SourceView.svelte';
import RebindHost from './RebindHost.svelte';
import { quill } from '../helpers/fixtures.js';

// jsdom has no IntersectionObserver; the paint loop only observes visibility, and
// no page is ever scrolled into view here.
class NoopIO {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}
beforeAll(() => {
	(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NoopIO;
});

/** A report-only session stub: the geometry verbs the loop calls at build. */
function mockSession(): LiveSession {
	return {
		pageCount: 1,
		supportsCanvas: true,
		pageSize: () => ({ widthPt: 612, heightPt: 792 }),
		paint: () => ({ layoutWidth: 612, layoutHeight: 792, pixelWidth: 612, pixelHeight: 792 }),
		regions: () => [],
		fieldBoxes: () => [],
		positionAt: () => undefined,
		locate: () => undefined
	} as unknown as LiveSession;
}

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

/** Mount `Component` over a reactive prop bag the test swaps under it. */
function mountSurface<P extends Record<string, unknown>>(
	Component: unknown,
	initial: P
): { props: P & { onError: (e: EditorError) => void }; errors: EditorError[] } {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const errors: EditorError[] = [];
	const props = $state({ ...initial, onError: (e: EditorError) => errors.push(e) });
	const app = mount(Component as Parameters<typeof mount>[0], { target, props });
	flushSync();
	cleanup = () => {
		void unmount(app);
		target.remove();
	};
	return { props, errors };
}

/** The `rebind-ignored` reports, which are the only ones these cases produce. */
function rebinds(errors: EditorError[]): EditorError[] {
	return errors.filter((e) => e.code === 'rebind-ignored');
}

describe('Preview', () => {
	it('reports nothing when no prop is swapped', () => {
		const { errors } = mountSurface(Preview, {
			session: mockSession(),
			margin: 16,
			overlays: true,
			strings: { noPages: 'Nothing to show' }
		});
		flushSync();
		expect(rebinds(errors)).toHaveLength(0);
	});

	it.each([
		['session', () => mockSession()],
		['margin', () => 48],
		['overlays', () => false],
		['onCaretPick', () => () => {}],
		['strings', () => ({ noPages: 'Rien à afficher' })]
	])('reports %s swapped in place, once, at dev severity', (prop, next) => {
		const { props, errors } = mountSurface(Preview, {
			session: mockSession(),
			margin: 16,
			overlays: true,
			onCaretPick: () => {},
			strings: { noPages: 'Nothing to show' }
		});

		(props as Record<string, unknown>)[prop] = next();
		flushSync();
		(props as Record<string, unknown>)[prop] = next();
		flushSync();

		const reported = rebinds(errors);
		expect(reported).toHaveLength(1);
		expect(reported[0].severity).toBe('dev');
		expect(reported[0].message).toContain(prop);
	});

	it('stays quiet under an inline `strings` literal, and reports when its value moves', () => {
		const { props, errors } = mountSurface(RebindHost, {
			session: mockSession(),
			label: 'Nothing to show'
		});
		// The literal is a prop expression, not a handle the host holds; a mount
		// that swapped nothing reports nothing.
		expect(rebinds(errors)).toHaveLength(0);

		props.label = 'Rien à afficher';
		flushSync();

		// A language switch IS a swap: the mounted preview keeps its English.
		expect(rebinds(errors)).toHaveLength(1);
		expect(rebinds(errors)[0].message).toContain('strings');
	});

	it('names every prop that went stale in the one report', () => {
		const { props, errors } = mountSurface(Preview, {
			session: mockSession(),
			margin: 16,
			overlays: true
		});

		props.margin = 48;
		props.overlays = false;
		flushSync();

		const reported = rebinds(errors);
		expect(reported).toHaveLength(1);
		expect(reported[0].message).toContain('margin');
		expect(reported[0].message).toContain('overlays');
	});
});

describe('SourceView', () => {
	it('reports nothing when no prop is swapped', () => {
		const doc = quill().seedDocument();
		const { errors } = mountSurface(SourceView, { doc });
		flushSync();
		expect(rebinds(errors)).toHaveLength(0);
		doc.free();
	});

	it('reports a doc swapped in place, which the mirror does not observe', () => {
		const q = quill();
		const a = q.seedDocument();
		const b = q.seedDocument();
		const { props, errors } = mountSurface(SourceView, { doc: a });

		props.doc = b;
		flushSync();

		const reported = rebinds(errors);
		expect(reported).toHaveLength(1);
		expect(reported[0].severity).toBe('dev');
		expect(reported[0].message).toContain('doc');
		a.free();
		b.free();
	});

	it('reports a swapped onError through the handler it replaced', () => {
		const doc: Document = quill().seedDocument();
		const { props, errors } = mountSurface(SourceView, { doc });
		const replacement: EditorError[] = [];

		props.onError = (e: EditorError) => replacement.push(e);
		flushSync();

		// The surface bound the first handler; the report of the swap reaches it,
		// not the one that took its place.
		expect(rebinds(errors)).toHaveLength(1);
		expect(rebinds(replacement)).toHaveLength(0);
		doc.free();
	});
});
