// @vitest-environment jsdom
// An array of `plaintext`, which the reference quill declares as `errata`: rows an
// author writes verbatim, where markdown in one is the text rather than markup.
//
// The type is what the row has to agree with. A `plaintext` value rests as its
// literal string, so the element is a text input and never the prose element the
// scalar field of that type mounts: handing a string to the codec is a decode of
// `undefined`. The rows are driven here and the values read back through
// `DocumentReader`, so the resting form is judged by the writer rather than by the
// control that wrote it.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { DocumentReader, type Quill, type Document } from '@quillmark/wasm';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { quill } from '../helpers/fixtures.js';

// jsdom implements neither, and mounting the editor reaches both.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
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

const ELEMENT_LABEL = 'Errata ';

/** The array control itself: the quill declares several, and the add affordance
 *  sits inside each one's own header row. */
function arrayControl(target: HTMLElement): HTMLElement {
	const match = [...target.querySelectorAll<HTMLElement>('.qm-array')].find((a) =>
		[...a.querySelectorAll('span')].some((s) => s.textContent === 'Errata')
	);
	if (!match) throw new Error('no array field labelled Errata');
	return match;
}

/** The array's element inputs, in DOM order, located by the accessible name each
 *  carries (`${label} ${index + 1}`, ArrayField). */
function inputs(target: HTMLElement): HTMLInputElement[] {
	return [...target.querySelectorAll<HTMLInputElement>(`input[aria-label^="${ELEMENT_LABEL}"]`)];
}

function press(el: HTMLElement, key: string): void {
	el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
	flushSync();
}

function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	input.dispatchEvent(new Event('change', { bubbles: true }));
	flushSync();
}

const read = (q: Quill, doc: Document, name: string) => new DocumentReader(q, doc).get(name);

describe('an array of plaintext', () => {
	it('mounts its seeded string elements as text inputs, logging nothing', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const q = quill();
			const doc = q.seedDocument();
			// The seed is what the row is handed: string elements, not `Content`.
			const seeded = doc.getStored('errata') as string[];
			expect(seeded.every((e) => typeof e === 'string')).toBe(true);
			expect(seeded.length).toBeGreaterThan(1);

			const target = mountEditor(q, doc);
			expect(inputs(target).map((i) => i.value)).toEqual(seeded);
			// The messages, not just the count: a failure here should name what it saw.
			expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([]);
			expect(error.mock.calls.map((c) => String(c[0]))).toEqual([]);
		} finally {
			warn.mockRestore();
			error.mockRestore();
		}
	});

	it('adds an element and commits it as a string', () => {
		const q = quill();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		const seeded = doc.getStored('errata') as string[];
		arrayControl(target).querySelector<HTMLButtonElement>('.qm-add-el')!.click();
		flushSync();
		const rows = inputs(target);
		expect(rows).toHaveLength(seeded.length + 1);
		expect(rows.at(-1)!.value).toBe('');

		type(rows.at(-1)!, 'Page 9 omits the colophon.');
		// Read through the codec, and stored under it: the element rests as its
		// literal string either way.
		const grown = [...seeded, 'Page 9 omits the colophon.'];
		expect(read(q, doc, 'errata')).toEqual(grown);
		expect(doc.getStored('errata')).toEqual(grown);
	});

	it('removes an element on Backspace only once it reads empty', () => {
		const q = quill();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		const seeded = doc.getStored('errata') as string[];
		// The emptiness test reads the input, not the committed value: a populated
		// element keeps its row, whatever the stored form is.
		press(inputs(target)[0], 'Backspace');
		expect(inputs(target)).toHaveLength(seeded.length);

		type(inputs(target)[0], '');
		press(inputs(target)[0], 'Backspace');
		expect(inputs(target).map((i) => i.value)).toEqual(seeded.slice(1));
		expect(read(q, doc, 'errata')).toEqual(seeded.slice(1));
	});
});
