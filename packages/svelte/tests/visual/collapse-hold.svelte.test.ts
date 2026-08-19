// @vitest-environment jsdom
// The hold, wired (`visual/hold.ts`): which control each disclosure offers as the anchor,
// and that the trip is taken against the change rather than the layout before it.
//
// jsdom lays nothing out, so what the reveal would move is the playground's to show; what
// is asserted here is that it is asked for, on the right element, in the right state.
import { describe, it, expect, afterEach, vi } from 'vitest';
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
	vi.restoreAllMocks();
});

function mountEditor(q: Quill, doc: Document) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(VisualEditor, { target, props: { doc, quill: q } });
	flushSync();
	cleanup = () => {
		void unmount(app);
		target.remove();
	};
	return target;
}

/** Every reveal asked for, as the element that asked and what it said about itself at the
 *  time: the pair the wiring is judged on. */
function reveals(): { el: Element; expanded: string | null }[] {
	const seen: { el: Element; expanded: string | null }[] = [];
	vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
		seen.push({ el: this, expanded: this.getAttribute('aria-expanded') });
	});
	return seen;
}

describe('the control a disclosure holds in view', () => {
	it('is the section header pressed, in the state the press left it', () => {
		const q = quill('usaf_memo');
		const target = mountEditor(q, q.seedDocument());
		const headers = [
			...target.querySelector('.qm-card')!.querySelectorAll<HTMLElement>('.qm-group-header')
		];
		const seen = reveals();

		headers[2].click();
		flushSync();

		expect(seen.map((s) => s.el)).toEqual([headers[2]]);
		expect(seen[0].expanded).toBe('true');
		expect(headers[0].getAttribute('aria-expanded')).toBe('false');
	});

	it('is the header pressed when the press closes its own section', () => {
		const q = quill('usaf_memo');
		const target = mountEditor(q, q.seedDocument());
		const headers = [
			...target.querySelector('.qm-card')!.querySelectorAll<HTMLElement>('.qm-group-header')
		];
		const seen = reveals();

		headers[0].click(); // the group open on seed
		flushSync();

		expect(seen.map((s) => s.el)).toEqual([headers[0]]);
		expect(seen[0].expanded).toBe('false');
	});

	it('is the object row summary pressed, one rung in', () => {
		const q = quill();
		const target = mountEditor(q, q.seedDocument());
		const arr = [...target.querySelectorAll<HTMLElement>('.qm-field')].find((f) =>
			[...f.querySelectorAll('span')].some((s) => s.textContent === 'Revisions')
		)!;
		const add = arr.querySelector<HTMLButtonElement>('.qm-add-el')!;
		add.click();
		flushSync();
		add.click();
		flushSync();

		const summaries = [...arr.querySelectorAll<HTMLButtonElement>('.qm-element-summary')];
		const seen = reveals();

		summaries[0].click(); // the second add left the second row open
		flushSync();

		expect(seen.map((s) => s.el)).toEqual([summaries[0]]);
		expect(seen[0].expanded).toBe('true');
	});
});
