// @vitest-environment jsdom
// The scroll that holds a pressed control still across a disclosure's collapse
// (`visual/hold.ts`). jsdom lays nothing out, so the geometry is stubbed and what is
// asserted is the decision; the trip itself is the playground's to show.
import { describe, it, expect } from 'vitest';
import { holdStill } from '$lib/visual/hold.js';

/** A scroller with `tops` to hand back, one per `getBoundingClientRect` on the anchor:
 *  the reads either side of the change, in order. */
function scrollportWith(tops: number[], scrollTop = 1000) {
	const port = document.createElement('div');
	port.style.overflowY = 'auto';
	Object.defineProperty(port, 'scrollHeight', { value: 4000 });
	Object.defineProperty(port, 'clientHeight', { value: 700 });
	port.scrollTop = scrollTop;
	const anchor = document.createElement('button');
	port.append(anchor);
	document.body.append(port);
	const reads = [...tops];
	anchor.getBoundingClientRect = () => ({ top: reads.shift() ?? 0 }) as DOMRect;
	return { port, anchor, left: () => reads.length };
}

describe('holdStill', () => {
	it('spends the drift the change opened up', () => {
		// The header stood at 440 and the collapse above it left it at 200: 240px of
		// scroll is what puts it back on its line.
		const { port, anchor } = scrollportWith([440, 200]);
		let ran = false;
		holdStill(anchor, () => (ran = true));
		expect(ran).toBe(true);
		expect(port.scrollTop).toBe(760);
	});

	it('spends nothing when the change moved nothing above the anchor', () => {
		const { port, anchor } = scrollportWith([440, 440]);
		holdStill(anchor, () => {});
		expect(port.scrollTop).toBe(1000);
	});

	it('runs the change with no anchor to hold', () => {
		const { port } = scrollportWith([440, 200]);
		let ran = false;
		holdStill(undefined, () => (ran = true));
		expect(ran).toBe(true);
		expect(port.scrollTop).toBe(1000);
	});

	it('walks past a box with no overflow to spend', () => {
		const { port, anchor } = scrollportWith([440, 200]);
		const clipped = document.createElement('div');
		clipped.style.overflowY = 'hidden';
		anchor.remove();
		clipped.append(anchor);
		port.append(clipped);
		holdStill(anchor, () => {});
		expect(port.scrollTop).toBe(760);
	});

	it('measures once either side of the change', () => {
		const { anchor, left } = scrollportWith([440, 200]);
		holdStill(anchor, () => {});
		expect(left()).toBe(0);
	});
});
