// @vitest-environment jsdom
// The narrow shell hides the track the reader is not on with `display: none`, and the
// preview stays MOUNTED behind it (THEMING §"The shell"): a surface that lost its pages
// to a tab switch would repaint the whole document on every one. Hiding is what the loop
// sees as an empty visible set, so these drive that transition directly — the observer is
// the only thing that reports it, and jsdom has none.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { createPreview } from '$lib/preview/controller';
import type { LiveSession, ChangeSet } from '@quillmark/wasm';

// A driveable IntersectionObserver: the paint loop learns visibility from it alone, so a
// stub that remembers its targets can play "scrolled into view" and "hidden" in turn.
let io: FakeIO | undefined;
class FakeIO {
	targets: Element[] = [];
	constructor(private cb: IntersectionObserverCallback) {
		io = this;
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
	/** Report every observed page at once, which is what a short document does. */
	report(isIntersecting: boolean): void {
		this.cb(
			this.targets.map((target) => ({ target, isIntersecting })) as IntersectionObserverEntry[],
			this as unknown as IntersectionObserver
		);
	}
}

beforeAll(() => {
	(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = FakeIO;
	// jsdom ships no canvas backend, so `getContext` returns null and the loop reads every
	// page as one it must not register. What is under test is which pages are MOUNTED, and
	// the pixels are the session's — which is mocked — so a stub context is the whole need.
	HTMLCanvasElement.prototype.getContext =
		(() => ({})) as unknown as HTMLCanvasElement['getContext'];
});

function mockSession(pageCount: number): LiveSession {
	return {
		pageCount,
		supportsCanvas: true,
		pageSize: () => ({ widthPt: 612, heightPt: 792 }),
		paint: () => ({ layoutWidth: 612, layoutHeight: 792, pixelWidth: 612, pixelHeight: 792 }),
		regions: () => [],
		fieldBoxes: () => [],
		positionAt: () => undefined,
		locate: () => undefined
	} as unknown as LiveSession;
}

const change = (pageCount: number): ChangeSet => ({ pageCount, dirtyPages: [] });

describe('a preview hidden by the narrow shell', () => {
	let container: HTMLDivElement;
	beforeEach(() => {
		io = undefined;
		container = document.createElement('div');
		document.body.appendChild(container);
	});

	const canvases = () => container.querySelectorAll('canvas').length;

	it('keeps its painted pages while the other track is showing', () => {
		const preview = createPreview(mockSession(2), { container });
		io?.report(true);
		expect(canvases()).toBe(2);

		// The switch flips: `display: none` on the track leaves nothing intersecting.
		io?.report(false);
		expect(canvases()).toBe(2);

		preview.destroy();
	});

	it('paints what a recompile dirtied while it was hidden once it is back', () => {
		const preview = createPreview(mockSession(2), { container });
		io?.report(true);
		io?.report(false);

		// An edit lands in the other track; the page count moves under a preview no one
		// is looking at. Nothing is visible, so nothing paints yet.
		preview.refresh(change(3));
		expect(container.querySelectorAll('.qm-page').length).toBe(3);

		// Back on this track, the observer reports again and the band is swept.
		io?.report(true);
		expect(canvases()).toBe(3);

		preview.destroy();
	});
});
