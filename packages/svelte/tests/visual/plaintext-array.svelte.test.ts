// @vitest-environment jsdom
// An array of `plaintext`: the element control the reference quill declares no
// field for. Its `distribution` is retyped in memory through the same YAML patch
// `absent-types.svelte.test.ts` splices with — the `string` → `plaintext` upgrade
// a quill makes to hand its list rows the content model.
//
// The type is what the row has to agree with. A `plaintext` value rests as its
// literal string, so the element is a text input and never the prose element the
// scalar field of that type mounts: handing a string to the codec is a decode of
// `undefined`. The rows are driven here and the values read back through
// `DocumentReader`, so the resting form is judged by the writer rather than by the
// control that wrote it.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { init, DocumentReader, type Quill, type Document } from '@quillmark/wasm';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { loadFixtureTree } from '../helpers/fixtures.js';

const core = await init();

// jsdom implements neither, and mounting the editor reaches both.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];

/** `distribution`'s element type, named so the patch cannot land on one of the
 *  other `string` arrays beside it. Its `example:` seeds the field, so a seeded
 *  document carries string elements before anything in the editor has run. */
const STRING_ITEMS = `    distribution:
      type: array
      items:
        type: string`;

function quillWithPlaintextArray(): Quill {
	const tree = loadFixtureTree();
	const yaml = new TextDecoder().decode(tree.get('Quill.yaml')!);
	const patched = yaml.replace(STRING_ITEMS, STRING_ITEMS.replace(/string$/, 'plaintext'));
	if (patched === yaml) throw new Error('fixture drift: `distribution` is no longer `string[]`');
	tree.set('Quill.yaml', new Uint8Array(Buffer.from(patched, 'utf8')));
	return core.Quill.fromTree(tree);
}

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

const ELEMENT_LABEL = 'Distribution ';

/** The array control itself: the memo declares several, and the add affordance
 *  sits inside each one's own header row. */
function arrayControl(target: HTMLElement): HTMLElement {
	const match = [...target.querySelectorAll<HTMLElement>('.qm-array')].find((a) =>
		[...a.querySelectorAll('span')].some((s) => s.textContent === 'Distribution')
	);
	if (!match) throw new Error('no array field labelled Distribution');
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
			const q = quillWithPlaintextArray();
			const doc = q.seedDocument();
			// The seed is what the row is handed: string elements, not `Content`.
			expect(doc.getStored('distribution')).toEqual(['ORG1/SYMBOL', 'ORG2/SYMBOL']);

			const target = mountEditor(q, doc);
			expect(inputs(target).map((i) => i.value)).toEqual(['ORG1/SYMBOL', 'ORG2/SYMBOL']);
			// The messages, not just the count: a failure here should name what it saw.
			expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([]);
			expect(error.mock.calls.map((c) => String(c[0]))).toEqual([]);
		} finally {
			warn.mockRestore();
			error.mockRestore();
		}
	});

	it('adds an element and commits it as a string', () => {
		const q = quillWithPlaintextArray();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		arrayControl(target).querySelector<HTMLButtonElement>('.qm-add-el')!.click();
		flushSync();
		const rows = inputs(target);
		expect(rows).toHaveLength(3);
		expect(rows[2].value).toBe('');

		type(rows[2], 'ORG3/SYMBOL');
		// Read through the codec, and stored under it: the element rests as its
		// literal string either way.
		expect(read(q, doc, 'distribution')).toEqual(['ORG1/SYMBOL', 'ORG2/SYMBOL', 'ORG3/SYMBOL']);
		expect(doc.getStored('distribution')).toEqual(['ORG1/SYMBOL', 'ORG2/SYMBOL', 'ORG3/SYMBOL']);
	});

	it('removes an element on Backspace only once it reads empty', () => {
		const q = quillWithPlaintextArray();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		// The emptiness test reads the input, not the committed value: a populated
		// element keeps its row, whatever the stored form is.
		press(inputs(target)[0], 'Backspace');
		expect(inputs(target)).toHaveLength(2);

		type(inputs(target)[0], '');
		press(inputs(target)[0], 'Backspace');
		expect(inputs(target).map((i) => i.value)).toEqual(['ORG2/SYMBOL']);
		expect(read(q, doc, 'distribution')).toEqual(['ORG2/SYMBOL']);
	});
});
