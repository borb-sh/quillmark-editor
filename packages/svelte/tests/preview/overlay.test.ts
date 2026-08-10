// @vitest-environment jsdom
// The overlay marks correlation as an event, not a state. Three
// invariants, each cheap to break silently: nothing is drawn at rest, a bloom
// resumes across the rebuild a recompile triggers rather than restarting, and a
// continuous caret signal blooms only on an actual change of address.
//
// jsdom has no WAAPI, so `bloom()` returns `undefined` there and no animation runs.
// That is exactly the seam these tests want: they assert the control flow around the
// wash (which elements it is asked for, and when) with a stub `Element.animate`
// recording the calls. The paint itself is playground territory (CLAUDE.md's two
// tiers).
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { createOverlay } from '$lib/preview/overlay';
import type { LiveSession } from '@quillmark/wasm';
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

/** `main.subject` surfaces two boxes (the header/continuation case PREVIEW.md names). */
const BOXES: Record<string, { page: number; rect: [number, number, number, number] }[]> = {
	'main.subject': [
		{ page: 0, rect: [10, 10, 110, 30] },
		{ page: 0, rect: [10, 40, 110, 60] }
	],
	'main.body': [{ page: 0, rect: [10, 80, 110, 280] }]
};

/** The addresses `regions()` names, and what `fieldBoxes` answers for each. The two
 *  sets differ, which is the whole subject of the fallback below: a span-less scalar
 *  and a `richtext[]` element are named by `regions()` and unioned by neither. */
const REGIONS = [
	...Object.entries(BOXES).flatMap(([field, boxes]) => boxes.map((b) => ({ field, ...b }))),
	{ field: 'main.signature_block', page: 0, rect: [10, 300, 110, 320] },
	{ field: 'main.references.0', page: 0, rect: [10, 340, 110, 355] },
	{ field: 'main.references.1', page: 0, rect: [10, 360, 110, 375] }
];

function mockSession(): LiveSession {
	return {
		regions: () => REGIONS,
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

		expect(boxes).toHaveLength(6);
		for (const el of boxes) {
			expect(el.style.border).toBe('');
			expect(el.style.opacity).toBe('0');
		}
		overlay.destroy();
	});
});

describe('overlay: what draws', () => {
	const drawn = (slot: PageSlot): string[] =>
		Array.from(slot.el.querySelectorAll<HTMLElement>('[data-qm-field]'), (el) =>
			el.getAttribute('data-qm-field')
		).filter((f): f is string => f != null);

	// `fieldBoxes` is span-bearing-content-only, so enumerating `regions()` and asking
	// it for the rects covers the content half of the compile and nothing else. The
	// fallback is runtime.d.ts's own sentence: such a field's box is a single
	// `regions()` rect.
	it('draws every address regions() names, unioned or raw', () => {
		const slots = mockSlots();
		const overlay = createOverlay(mockSession(), slots);

		expect(new Set(drawn(slots[0]))).toEqual(
			new Set([
				'main.subject',
				'main.body',
				'main.signature_block',
				'main.references.0',
				'main.references.1'
			])
		);
		overlay.destroy();
	});

	it('blooms an address and everything under it', () => {
		const overlay = createOverlay(mockSession(), mockSlots());

		// The two ends speak different granularities and neither is wrong: the boxes are
		// keyed as `regions()` names them, an editor-side signal names the declared field.
		overlay.flashField('main.references');
		expect(calls.map((c) => c.field)).toEqual(['main.references.0', 'main.references.1']);

		// The element address alone is still its own address.
		calls = [];
		overlay.flashField('main.references.0');
		expect(calls.map((c) => c.field)).toEqual(['main.references.0']);

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
		// Resumed, not restarted: a restart here is the bug that would make the wash
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

		// And so is coming back; the guard is the last address, not a visited set.
		calls = [];
		overlay.flashField('main.body');
		expect(calls.map((c) => c.field)).toEqual(['main.body']);

		overlay.destroy();
	});
});
