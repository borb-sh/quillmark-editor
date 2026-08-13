// @vitest-environment jsdom
// The click ladder and the scroll's box lookup, driven through real clicks on real
// slots against a stubbed session. Both are about which query answers and what the
// answer carries, not about pixels: the transform they ride is `geometry.ts`'s and is
// tested against a compiled session there.
//
// jsdom lays nothing out, so every `getBoundingClientRect` is zero; the click math is
// therefore fed a page box stubbed to a known size, and what is asserted is the
// payload the hook received.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createBridge } from '$lib/preview/bridge';
import type { Landing } from '$lib/core';
import type { LiveSession, FieldRegion } from '@quillmark/wasm';
import type { PageSlot } from '$lib/preview/paint';

const PAGE = { widthPt: 612, heightPt: 792 };

/** One page slot whose box measures 612×792 CSS px, so a click at (x, y) reads back
 *  as the PDF point `(x, 792 - y)` and the queries can be keyed on plain numbers. */
function mockSlots(): PageSlot[] {
	const el = document.createElement('div');
	el.getBoundingClientRect = () =>
		({ left: 0, top: 0, width: 612, height: 792 }) as unknown as DOMRect;
	document.body.appendChild(el);
	return [{ page: 0, size: PAGE, el } as unknown as PageSlot];
}

function click(el: HTMLElement, x: number, y: number): void {
	el.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
}

describe('the click ladder', () => {
	let picks: Landing[];
	beforeEach(() => {
		picks = [];
	});

	// Content ink: `positionAt` answers, and its whole hit rides through untouched.
	it('surfaces a content hit with its caret and granularity', () => {
		const session = {
			positionAt: () => ({ field: 'main.body', pos: 42, granularity: 'cluster' }),
			fieldAt: () => 'main.body'
		} as unknown as LiveSession;
		const slots = mockSlots();
		const bridge = createBridge(session, document.body, slots, (at) => picks.push(at));

		click(slots[0].el, 100, 100);

		expect(picks).toEqual([{ field: 'main.body', pos: 42, granularity: 'cluster' }]);
		bridge.destroy();
	});

	// A field the plate places without tracking its content: the second rung names it
	// and there is no offset to hand over. A fabricated `0` would be an invented caret
	// wearing a real one's type, so the pick carries none.
	it('surfaces a placement with no caret when only fieldAt answers', () => {
		const session = {
			positionAt: () => undefined,
			fieldAt: () => 'main.signature_block'
		} as unknown as LiveSession;
		const slots = mockSlots();
		const bridge = createBridge(session, document.body, slots, (at) => picks.push(at));

		click(slots[0].el, 100, 100);

		expect(picks).toEqual([{ field: 'main.signature_block' }]);
		expect(picks[0].pos).toBeUndefined();
		bridge.destroy();
	});

	// Off everything the compile tracks the hook stays silent: there is no third rung
	// hit-testing `regions()`, whose rects bound ink the field does not fill.
	it('does not fire where neither query answers', () => {
		const regions = vi.fn(() => [{ field: 'main.body', page: 0, rect: [0, 0, 612, 792] }]);
		const session = {
			positionAt: () => undefined,
			fieldAt: () => undefined,
			regions
		} as unknown as LiveSession;
		const slots = mockSlots();
		const bridge = createBridge(session, document.body, slots, (at) => picks.push(at));

		click(slots[0].el, 300, 300);

		expect(picks).toEqual([]);
		expect(regions).not.toHaveBeenCalled();
		bridge.destroy();
	});
});

describe('scrollToField', () => {
	const region = (field: string): FieldRegion =>
		({ field, page: 0, rect: [10, 10, 110, 30] }) as FieldRegion;

	function bridgeOver(boxes: FieldRegion[], regions: FieldRegion[]) {
		const session = {
			fieldBoxes: (field: string) => boxes.filter((b) => b.field === field),
			regions: () => regions
		} as unknown as LiveSession;
		return createBridge(session, document.body, mockSlots(), undefined);
	}

	it('answers for an address whose rect only regions() carries', () => {
		// `fieldBoxes` is span-bearing-content-only, so a plate-placed scalar has no
		// union; runtime.d.ts says its box is the single `regions()` rect.
		const bridge = bridgeOver([], [region('main.signature_block')]);
		expect(bridge.scrollToField('main.signature_block')).toBe(true);
		bridge.destroy();
	});

	it('answers for a declared array off the rects of its elements', () => {
		// Nothing is named `main.keywords`: the compile tracks its elements. A host
		// holding the declared path reaches the rows it prints.
		const bridge = bridgeOver([], [region('main.keywords[0]'), region('main.keywords[1]')]);
		expect(bridge.scrollToField('main.keywords')).toBe(true);
		bridge.destroy();
	});

	it('is false for an address this compile places nothing at', () => {
		// The honest answer, not a failure: the plate places plenty it does not track,
		// and the preview carries no schema to tell that from a misnamed field.
		const bridge = bridgeOver([], [region('main.body')]);
		expect(bridge.scrollToField('main.date')).toBe(false);
		// …and a prefix that is not a path boundary is not a match.
		expect(bridge.scrollToField('main.bod')).toBe(false);
		bridge.destroy();
	});
});
