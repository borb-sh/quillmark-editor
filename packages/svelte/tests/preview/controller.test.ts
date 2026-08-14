// @vitest-environment jsdom
// A zero-page session must not be a permanent empty-state stub. These
// drive the count transitions and assert the "No pages" element and the page
// slots both track the live count; 0→N escapes the empty state, N→0 returns.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createPreview } from '$lib/preview/controller';
import type { LiveSession, ChangeSet } from '@quillmark/wasm';

// jsdom has no IntersectionObserver; the paint loop only needs it to observe
// visibility, which these count-transition assertions do not exercise (no page
// is ever scrolled into view, so `paint` is never reached).
class NoopIO {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

beforeAll(() => {
	(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = NoopIO;
});

/** A report-only session stub: only the geometry verbs the loop calls at build. */
function mockSession(pageCount: number, supportsCanvas = true): LiveSession {
	return {
		pageCount,
		supportsCanvas,
		pageSize: () => ({ widthPt: 612, heightPt: 792 }),
		paint: () => ({
			layoutWidth: 612,
			layoutHeight: 792,
			pixelWidth: 612,
			pixelHeight: 792
		}),
		regions: () => [],
		fieldBoxes: () => [],
		positionAt: () => undefined,
		locate: () => undefined
	} as unknown as LiveSession;
}

function change(pageCount: number): ChangeSet {
	return { pageCount, dirtyPages: [] };
}

describe('preview controller empty-state across page-count transitions', () => {
	let container: HTMLDivElement;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	const pages = () => container.querySelectorAll('.qm-page').length;
	const isEmpty = () => !!container.querySelector('.qm-preview-empty');

	it('a session that opens empty escapes the empty state on a later apply', () => {
		const preview = createPreview(mockSession(0), { container });
		expect(isEmpty()).toBe(true);
		expect(pages()).toBe(0);

		// A ChangeSet arriving after an empty open builds slots; ignoring it would
		// strand the surface in the empty state for the session.
		preview.refresh(change(2));
		expect(isEmpty()).toBe(false);
		expect(pages()).toBe(2);

		preview.destroy();
	});

	it('a session that drops to zero pages returns to the empty state', () => {
		const preview = createPreview(mockSession(3), { container });
		expect(isEmpty()).toBe(false);
		expect(pages()).toBe(3);

		preview.refresh(change(0));
		expect(isEmpty()).toBe(true);
		expect(pages()).toBe(0);

		// …and back up again; the toggle is not one-way.
		preview.refresh(change(1));
		expect(isEmpty()).toBe(false);
		expect(pages()).toBe(1);

		preview.destroy();
	});

	it('destroy clears the empty state and the container class', () => {
		const preview = createPreview(mockSession(0), { container });
		expect(isEmpty()).toBe(true);
		preview.destroy();
		expect(isEmpty()).toBe(false);
		expect(container.classList.contains('qm-preview')).toBe(false);
	});
});

// `locate` answers against the last compiled layout, so a caret typed past it is
// off-content until the compile lands, and the next caret event is the only thing
// that would ask again. `refresh` has to re-ask (PREVIEW §"Follow-the-caret
// scroll"); where the scroll ends up is geometry jsdom does not have, so what is
// asserted is the query, not a scrollTop.
describe('a recompile re-locates the followed caret', () => {
	let container: HTMLDivElement;
	let located: Array<[string, number]>;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
		located = [];
	});

	function trackingSession(): LiveSession {
		return {
			...mockSession(1),
			locate: (field: string, pos: number) => {
				located.push([field, pos]);
				return undefined;
			}
		} as unknown as LiveSession;
	}

	it('re-asks for the last followed place, and asks for nothing before one exists', () => {
		const preview = createPreview(trackingSession(), { container });
		preview.refresh(change(1));
		expect(located).toEqual([]);

		preview.focusPosition({ field: 'main.body', pos: 12 });
		expect(located).toEqual([['main.body', 12]]);

		preview.refresh(change(1));
		expect(located).toEqual([
			['main.body', 12],
			['main.body', 12]
		]);
		preview.destroy();
	});

	// The slot is held until something says the caret is no longer there, and only a
	// focus change does: a control reports no caret, so a re-located place would name
	// the leaf the focus left and pull the pane back to it on every recompile.
	it('a focus change ends it, and the next place restarts it', () => {
		const preview = createPreview(trackingSession(), { container });
		preview.focusPosition({ field: 'main.body', pos: 12 });
		located.length = 0;

		preview.endFollow();
		preview.refresh(change(1));
		expect(located).toEqual([]);

		preview.focusPosition({ field: 'main.title', pos: 2 });
		preview.refresh(change(1));
		expect(located).toEqual([
			['main.title', 2],
			['main.title', 2]
		]);
		preview.destroy();
	});
});

// `supportsCanvas` must gate the view (runtime.d.ts says re-check the
// getter after `open`), and the gate is re-read per compile so a non-paintable
// compile that later becomes paintable recovers; the zero-page escape, generalized.
describe('preview controller supportsCanvas gating', () => {
	let container: HTMLDivElement;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});
	const pages = () => container.querySelectorAll('.qm-page').length;

	it('a compile with pages the boundary cannot raster shows the unsupported message, not blank pages', () => {
		const preview = createPreview(mockSession(2, false), { container });
		expect(container.querySelector('.qm-preview-unsupported')).toBeTruthy();
		expect(container.querySelector('.qm-preview-empty')).toBeFalsy();
		expect(pages()).toBe(0);
		preview.destroy();
	});

	it('a non-canvas compile that becomes paintable on a later apply escapes the message', () => {
		let paintable = false;
		// A live getter so `render` re-reads the capability per compile (a real
		// session's getter reflects the last-good compile after `apply`).
		const session = {
			...mockSession(2),
			get supportsCanvas() {
				return paintable;
			}
		} as unknown as LiveSession;

		const preview = createPreview(session, { container });
		expect(container.querySelector('.qm-preview-unsupported')).toBeTruthy();
		expect(pages()).toBe(0);

		paintable = true;
		preview.refresh(change(2));
		expect(container.querySelector('.qm-preview-message')).toBeFalsy();
		expect(pages()).toBe(2);
		preview.destroy();
	});
});

describe('the page slot names its index', () => {
	let container: HTMLDivElement;
	beforeEach(() => {
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	// A consumer drawing its own overlay reads the page number off the slot. Without
	// `data-page` the only handle is position among siblings, which is right today and
	// is not a contract; asserted here so it becomes one.
	it('every slot carries its page number, in DOM order, across a count change', () => {
		const preview = createPreview(mockSession(3), { container });
		const numbers = () =>
			[...container.querySelectorAll<HTMLElement>('.qm-page')].map((el) => el.dataset.page);
		expect(numbers()).toEqual(['0', '1', '2']);

		// The slots a grow reuses keep the number they were built with, and the ones it
		// appends continue the run: an index written once at build is only right if the
		// reconcile never permutes.
		preview.refresh(change(5));
		expect(numbers()).toEqual(['0', '1', '2', '3', '4']);

		preview.refresh(change(2));
		expect(numbers()).toEqual(['0', '1']);
		preview.destroy();
	});
});

// A `session.paint` that throws must not abort the band sweep: it is
// caught per-slot and surfaced as an error state instead of an unhandled throw
// inside the IntersectionObserver callback.
describe('preview controller paint resilience', () => {
	let container: HTMLDivElement;
	let ioInstances: CapturingIO[];
	let prevIO: unknown;
	let prevGetContext: typeof HTMLCanvasElement.prototype.getContext;

	// A capturing IntersectionObserver whose callback the test fires on demand:
	// jsdom has none, and this path needs a page to actually reach `paint`.
	class CapturingIO {
		cb: (entries: { target: Element; isIntersecting: boolean }[]) => void;
		targets: Element[] = [];
		constructor(cb: CapturingIO['cb']) {
			this.cb = cb;
			ioInstances.push(this);
		}
		observe(el: Element): void {
			this.targets.push(el);
		}
		unobserve(el: Element): void {
			this.targets = this.targets.filter((t) => t !== el);
		}
		disconnect(): void {
			this.targets = [];
		}
		fireAll(): void {
			this.cb(this.targets.map((target) => ({ target, isIntersecting: true })));
		}
	}

	beforeEach(() => {
		ioInstances = [];
		container = document.createElement('div');
		document.body.appendChild(container);
		prevIO = (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver;
		(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = CapturingIO;
		// jsdom's canvas has no 2d context; hand `paintSlot` a truthy stub so it
		// proceeds to `session.paint` (the throw under test) instead of bailing.
		prevGetContext = HTMLCanvasElement.prototype.getContext;
		HTMLCanvasElement.prototype.getContext =
			(() => ({})) as unknown as typeof HTMLCanvasElement.prototype.getContext;
	});
	afterEach(() => {
		(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = prevIO;
		HTMLCanvasElement.prototype.getContext = prevGetContext;
	});

	function throwingSession(pageCount: number): LiveSession {
		return {
			...mockSession(pageCount),
			paint: () => {
				throw new Error('backend refused to paint');
			}
		} as unknown as LiveSession;
	}

	it('a paint that throws surfaces an error state without aborting the observer sweep', () => {
		const preview = createPreview(throwingSession(2), { container });
		expect(container.querySelectorAll('.qm-page').length).toBe(2);

		const io = ioInstances[ioInstances.length - 1];
		// The whole point: the band sweep does not throw out of the IO callback.
		expect(() => io.fireAll()).not.toThrow();
		expect(container.querySelector('.qm-preview-error')).toBeTruthy();
		// …and a failed paint leaves no blank registered canvas behind.
		expect(container.querySelectorAll('canvas.qm-page-canvas').length).toBe(0);

		preview.destroy();
	});
});
