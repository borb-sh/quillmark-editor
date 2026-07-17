// @vitest-environment jsdom
// Issue #10: a preview constructed over a zero-page session must not be a
// permanent empty-state stub. The old controller returned a stub whose
// `refresh()` ignored every later `ChangeSet`, so a session that opened empty
// (0 pages) and later compiled pages stayed stuck on "No pages to preview.",
// and the N→0 direction left a blank container instead of the message. These
// drive the count transitions and assert the empty state and the page slots
// track the LIVE count.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
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
function mockSession(pageCount: number): LiveSession {
	return {
		pageCount,
		supportsCanvas: true,
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
