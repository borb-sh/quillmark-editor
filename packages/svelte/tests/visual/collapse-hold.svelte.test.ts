// @vitest-environment jsdom
// The accordion's half of the hold (`visual/hold.ts`), wired: which control the card
// offers as the anchor, and when it offers none. One open section at a time means a press
// can be carried off the fold by exactly one box, the panel closing above it; a press with
// the open section below it moves nothing above the header and spends nothing.
//
// jsdom lays nothing out, so the collapse is stubbed as the pair of reads the hold takes
// across it. `usaf_memo` seeds four groups in a known order, which is what makes above and
// below nameable.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Quill, Document } from '@quillmark/wasm';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { quill } from '../helpers/fixtures.js';

Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];
Element.prototype.hasPointerCapture ??= () => false;

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

/** The mounting site is the scrollport: the editor owns none of its own, so the walk has
 *  to reach the host's box for the hold to have anything to spend. */
function mountInScrollport(q: Quill, doc: Document) {
	const target = document.createElement('div');
	target.style.overflowY = 'auto';
	Object.defineProperty(target, 'scrollHeight', { value: 4000 });
	Object.defineProperty(target, 'clientHeight', { value: 700 });
	document.body.appendChild(target);
	const app = mount(VisualEditor, { target, props: { doc, quill: q } });
	flushSync();
	cleanup = () => {
		void unmount(app);
		target.remove();
	};
	target.scrollTop = 1000;
	return target;
}

const headers = (target: HTMLElement): HTMLElement[] => [
	...target
		.querySelector<HTMLElement>('.qm-card')!
		.querySelectorAll<HTMLElement>('.qm-group-header')
];

/** The reads the hold takes either side of the change: the line the header stood on, and
 *  where the collapse above it left it. */
function collapseUnder(el: HTMLElement, tops: number[]): void {
	const reads = [...tops];
	el.getBoundingClientRect = () => ({ top: reads.shift() ?? tops[tops.length - 1] }) as DOMRect;
}

/** The field whose label reads `label`; an array field carries its name in the header row
 *  beside the add affordance rather than in a `.qm-field-label`. */
function arrayField(target: HTMLElement, label: string): HTMLElement {
	const match = [...target.querySelectorAll<HTMLElement>('.qm-field')].find((f) =>
		[...f.querySelectorAll('span')].some((s) => s.textContent === label)
	);
	if (!match) throw new Error(`no array field labelled ${label}`);
	return match;
}

describe('a section collapsing above the header that was pressed', () => {
	it('holds that header on its line, and spends the closing panel’s motion to do it', () => {
		const q = quill('usaf_memo');
		const target = mountInScrollport(q, q.seedDocument());
		const [addressing, , classification] = headers(target);
		// The first group is the one open on seed, so pressing the third closes it.
		expect(addressing.getAttribute('aria-expanded')).toBe('true');

		collapseUnder(classification, [440, 200]);
		classification.click();
		flushSync();

		expect(classification.getAttribute('aria-expanded')).toBe('true');
		expect(target.scrollTop).toBe(760);
		// The panel whose collapse the scroll paid for does not also animate it.
		expect(addressing.closest('.qm-group')!.classList.contains('qm-instant')).toBe(true);
		expect(classification.closest('.qm-group')!.classList.contains('qm-instant')).toBe(false);
	});

	it('spends nothing when the section closing stands below the header pressed', () => {
		const q = quill('usaf_memo');
		const target = mountInScrollport(q, q.seedDocument());
		const [, letterhead, , additional] = headers(target);

		additional.click();
		flushSync();
		target.scrollTop = 1000;

		collapseUnder(letterhead, [440, 200]);
		letterhead.click();
		flushSync();

		expect(letterhead.getAttribute('aria-expanded')).toBe('true');
		expect(target.scrollTop).toBe(1000);
		expect(target.querySelectorAll('.qm-group.qm-instant').length).toBe(0);
	});

	it('spends nothing when the press closes the section it landed on', () => {
		const q = quill('usaf_memo');
		const target = mountInScrollport(q, q.seedDocument());
		const [addressing] = headers(target);

		collapseUnder(addressing, [440, 200]);
		addressing.click();
		flushSync();

		expect(addressing.getAttribute('aria-expanded')).toBe('false');
		expect(target.scrollTop).toBe(1000);
	});
});

// One open row at a time is the same shape one rung in, and the summary is the control
// the press lands on. The subform unmounts rather than animating, so the whole of the
// hold there is the scroll.
describe('an object row collapsing above the summary that was pressed', () => {
	const summaries = (arr: HTMLElement) => [
		...arr.querySelectorAll<HTMLButtonElement>('.qm-element-summary')
	];

	function twoRows(target: HTMLElement): HTMLElement {
		const arr = arrayField(target, 'Revisions');
		const add = arr.querySelector<HTMLButtonElement>('.qm-add-el')!;
		add.click();
		flushSync();
		add.click();
		flushSync();
		return arr;
	}

	it('holds the summary on its line', () => {
		const q = quill();
		const target = mountInScrollport(q, q.seedDocument());
		const arr = twoRows(target);
		// The second add left the second row open, so pressing the first closes one below
		// it: the press that has something to spend is the other way round.
		summaries(arr)[0].click();
		flushSync();
		target.scrollTop = 1000;

		const second = summaries(arr)[1];
		collapseUnder(second, [440, 200]);
		second.click();
		flushSync();

		expect(second.getAttribute('aria-expanded')).toBe('true');
		expect(target.scrollTop).toBe(760);
	});

	it('spends nothing when the row closing stands below the summary pressed', () => {
		const q = quill();
		const target = mountInScrollport(q, q.seedDocument());
		const arr = twoRows(target);
		target.scrollTop = 1000;

		const first = summaries(arr)[0];
		collapseUnder(first, [440, 200]);
		first.click();
		flushSync();

		expect(first.getAttribute('aria-expanded')).toBe('true');
		expect(target.scrollTop).toBe(1000);
	});
});
