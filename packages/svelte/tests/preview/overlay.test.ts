// @vitest-environment jsdom
// The overlay marks correlation as an EVENT, not a state. Three
// invariants, each cheap to break silently: nothing is drawn at rest, a bloom
// RESUMES across the rebuild a recompile triggers rather than restarting, and a
// continuous caret signal blooms only on an actual change of address.
//
// jsdom has no WAAPI, so `bloom()` returns `undefined` there and no animation runs.
// That is exactly the seam these tests want: they assert the CONTROL FLOW around the
// wash (which elements it is asked for, and when) with a stub `Element.animate`
// recording the calls. The paint itself is playground territory (CLAUDE.md's two
// tiers).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createOverlay } from '$lib/preview/overlay';
import type { LiveSession } from '$lib/core';
import type { PageSlot } from '$lib/preview/paint';

interface AnimateCall {
	field: string | null;
	/** `currentTime` after the call; the offset a resumed bloom picked up at. */
	offset: number;
}

let calls: AnimateCall[];
let now: number;

beforeAll(() => {
	// A minimal `Animation`: `bloom` only sets `currentTime` and reads nothing back.
	(Element.prototype as unknown as { animate: unknown }).animate = function (
		this: Element
	): Animation {
		const call: AnimateCall = { field: this.getAttribute('data-qm-field'), offset: 0 };
		calls.push(call);
		return {
			set currentTime(ms: number) {
				call.offset = ms;
			},
			get currentTime() {
				return call.offset;
			}
		} as unknown as Animation;
	};
});

beforeEach(() => {
	calls = [];
	now = 1000;
	vi.spyOn(performance, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

/** `main.subject` surfaces TWO boxes (the header/continuation case PREVIEW.md names). */
const BOXES: Record<string, { page: number; rect: [number, number, number, number] }[]> = {
	'main.subject': [
		{ page: 0, rect: [10, 10, 110, 30] },
		{ page: 0, rect: [10, 40, 110, 60] }
	],
	'main.body': [{ page: 0, rect: [10, 80, 110, 280] }]
};

function mockSession(): LiveSession {
	return {
		regions: () => Object.keys(BOXES).map((field) => ({ field })),
		fieldBoxes: (field: string) => BOXES[field] ?? []
	} as unknown as LiveSession;
}

function mockSlots(): PageSlot[] {
	const el = document.createElement('div');
	document.body.appendChild(el);
	return [{ el, size: { widthPt: 612, heightPt: 792 } } as unknown as PageSlot];
}

describe('overlay: resting ink', () => {
	it('draws no border on any box, and rests them at zero', () => {
		const slots = mockSlots();
		const overlay = createOverlay(mockSession(), slots);
		const boxes = Array.from(slots[0].el.querySelectorAll<HTMLElement>('[data-qm-field]'));

		expect(boxes).toHaveLength(3);
		for (const el of boxes) {
			expect(el.style.border).toBe('');
			expect(el.style.opacity).toBe('0');
		}
		overlay.destroy();
	});
});

describe('overlay: the bloom', () => {
	it("blooms every box of a field together, and only that field's", () => {
		const overlay = createOverlay(mockSession(), mockSlots());
		overlay.flashField('main.subject');

		expect(calls.map((c) => c.field)).toEqual(['main.subject', 'main.subject']);
		// One start time, so two boxes of one field do not shimmer against each other.
		expect(calls.map((c) => c.offset)).toEqual([0, 0]);
		overlay.destroy();
	});

	it('resumes at its offset across the rebuild a recompile triggers', () => {
		const overlay = createOverlay(mockSession(), mockSlots());
		overlay.flashField('main.body');
		expect(calls).toEqual([{ field: 'main.body', offset: 0 }]);

		// The debounced recompile lands mid-decay: `refresh` re-creates every box.
		calls = [];
		now += 300;
		overlay.refresh();
		// Resumed, NOT restarted: a restart here is the bug that would make the wash
		// re-bloom on every keystroke burst.
		expect(calls).toEqual([{ field: 'main.body', offset: 300 }]);

		overlay.destroy();
	});

	it('goes inert once the decay is spent, so later rebuilds are silent', () => {
		const overlay = createOverlay(mockSession(), mockSlots());
		overlay.flashField('main.body');

		// Nothing clears the flash: it stays on as the change guard, and a spent
		// elapsed is refused, so the rebuild a later recompile triggers is silent.
		calls = [];
		now += 5000; // well past `--_qm-duration-linger`
		overlay.refresh();
		expect(calls).toEqual([]);

		overlay.destroy();
	});

	it('marks a change of address, not every caret move at the same one', () => {
		const overlay = createOverlay(mockSession(), mockSlots());

		// `onCaretMove` fires per keystroke; the field being typed into is not an event.
		overlay.flashField('main.body');
		expect(calls).toHaveLength(1);
		calls = [];
		overlay.flashField('main.body');
		overlay.flashField('main.body');
		expect(calls).toEqual([]);

		// Moving to another field is.
		overlay.flashField('main.subject');
		expect(calls.map((c) => c.field)).toEqual(['main.subject', 'main.subject']);

		// And so is coming back; the guard is the LAST address, not a visited set.
		calls = [];
		overlay.flashField('main.body');
		expect(calls.map((c) => c.field)).toEqual(['main.body']);

		overlay.destroy();
	});
});
