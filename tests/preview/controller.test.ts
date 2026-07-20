// @vitest-environment jsdom
// Issue #10: a zero-page session must not be a permanent empty-state stub. These
// drive the count transitions and assert the "No pages" element and the page
// slots both track the LIVE count — 0→N escapes the empty state, N→0 returns.
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { createPreview } from '$lib/preview/controller';
import type { LiveSession, ChangeSet } from '$lib/core';

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

/** A report-only session stub: only the geometry verbs the loop/overlay call at build. */
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

		// The bug: this ChangeSet was ignored forever. Now it must build slots.
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

		// …and back up again — the toggle is not one-way.
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

// Issue #11: `supportsCanvas` must gate the view (runtime.d.ts says re-check the
// getter after `open`), and the gate is re-read per compile so a non-paintable
// compile that later becomes paintable recovers — the #10 escape, generalized.
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

// Issue #11: a `session.paint` that throws must not abort the band sweep — it is
// caught per-slot and surfaced as an error state instead of an unhandled throw
// inside the IntersectionObserver callback.
describe('preview controller paint resilience', () => {
	let container: HTMLDivElement;
	let ioInstances: CapturingIO[];
	let prevIO: unknown;
	let prevGetContext: typeof HTMLCanvasElement.prototype.getContext;

	// A capturing IntersectionObserver whose callback the test fires on demand —
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
