// @vitest-environment jsdom
// The three controls no prose leaf covers: the boolean switch, the object subform,
// and the array's `object` element. The reference quill declares a field for each,
// so they are driven off the fixture on disk rather than off a schema patched in
// memory or hand-built behind the WASM boundary.
//
// Each control is driven as a pointer drives it and the value read back through
// `DocumentReader`, so the commit is judged by the writer's own conformance rather
// than by a captured callback argument.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { DocumentReader, type Quill, type Document } from '@quillmark/wasm';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { quill } from '../helpers/fixtures.js';

// jsdom implements neither, and mounting the editor reaches both: the card
// scroll hop and the flip the survivors run through.
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

/** The field whose label reads `label`: the one locator that does not spend an id
 *  minted per editor instance (`fieldDomIds` keys off `$props.id()`). */
function field(target: HTMLElement, label: string): HTMLElement {
	const match = [...target.querySelectorAll<HTMLElement>('.qm-field')].find(
		(f) => f.querySelector('.qm-field-label span')?.textContent === label
	);
	if (!match) throw new Error(`no field labelled ${label}`);
	return match;
}

/** An array field carries no `.qm-field-label`; its label sits in the header row
 *  {@link ArrayField} builds beside the add affordance. */
function arrayField(target: HTMLElement, label: string): HTMLElement {
	const match = [...target.querySelectorAll<HTMLElement>('.qm-field')].find((f) =>
		[...f.querySelectorAll('span')].some((s) => s.textContent === label)
	);
	if (!match) throw new Error(`no array field labelled ${label}`);
	return match;
}

/** Type into a text/number input the way a pointer entry settles: `input` carries
 *  the keystroke, `change` the settle, and the two controls commit on different
 *  ones. */
function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	input.dispatchEvent(new Event('change', { bubbles: true }));
	flushSync();
}

const read = (q: Quill, doc: Document, name: string) => new DocumentReader(q, doc).get(name);

describe('a boolean field', () => {
	it('commits the switch toggle, and toggles back off', () => {
		const q = quill();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		const sw = field(target, 'Draft watermark').querySelector<HTMLElement>('[role="switch"]')!;
		expect(sw.getAttribute('aria-checked')).toBe('false');

		sw.click();
		flushSync();
		expect(sw.getAttribute('aria-checked')).toBe('true');
		expect(read(q, doc, 'draft_watermark')).toBe(true);

		// The switch is a control, not a latch: the second click writes `false`
		// rather than clearing the field back to its `default:`.
		sw.click();
		flushSync();
		expect(read(q, doc, 'draft_watermark')).toBe(false);
	});
});

describe('an object field', () => {
	it('commits the whole object on each property, keeping the properties beside it', () => {
		const q = quill();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		const obj = field(target, 'Point of contact');
		const props = [...obj.querySelectorAll<HTMLElement>('.qm-object-prop')];
		// Declaration order, which is what the subform renders by.
		expect(props.map((p) => p.querySelector('.qm-object-label')?.textContent)).toEqual([
			'Name',
			'Email',
			'Reply by',
			'Listed'
		]);

		type(props[0].querySelector('input')!, 'Ada Lovelace');
		expect(read(q, doc, 'contact')).toEqual({ name: 'Ada Lovelace' });

		// The second property commits the object by value, so the first has to ride
		// along: a commit that carried only the edited key would drop it.
		type(props[1].querySelector('input')!, 'ada@example.org');
		expect(read(q, doc, 'contact')).toEqual({
			name: 'Ada Lovelace',
			email: 'ada@example.org'
		});

		props[3].querySelector<HTMLElement>('[role="switch"]')!.click();
		flushSync();
		expect(read(q, doc, 'contact')).toEqual({
			name: 'Ada Lovelace',
			email: 'ada@example.org',
			listed: true
		});
	});

	it('drops a cleared property rather than committing a hole', () => {
		const q = quill();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		const props = [
			...field(target, 'Point of contact').querySelectorAll<HTMLElement>('.qm-object-prop')
		];
		type(props[0].querySelector('input')!, 'Ada Lovelace');
		type(props[1].querySelector('input')!, 'ada@example.org');
		expect(read(q, doc, 'contact')).toEqual({
			name: 'Ada Lovelace',
			email: 'ada@example.org'
		});

		// Cleared to empty: the key goes absent (resolving to its own `default:`)
		// rather than being committed as `undefined`.
		type(props[0].querySelector('input')!, '');
		expect(read(q, doc, 'contact')).toEqual({ email: 'ada@example.org' });
	});
});

describe('an array of objects', () => {
	it('commits an element parsed from its JSON, and keeps the prior value on invalid JSON', () => {
		const q = quill();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		const arr = arrayField(target, 'Revisions');
		arr.querySelector<HTMLButtonElement>('.qm-add-el')!.click();
		flushSync();

		// The `object` element is a JSON editor, not a text input: the empty element
		// renders as an object literal.
		const json = arr.querySelector<HTMLTextAreaElement>('textarea.qm-json')!;
		expect(json.value).toBe('{}');

		json.value = '{"note":"First cut","pages":3}';
		json.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(read(q, doc, 'revisions')).toEqual([{ note: 'First cut', pages: 3 }]);

		// Unparseable entry is swallowed by the element's own `catch`: the committed
		// array is the last one that parsed, not an empty object and not a throw.
		json.value = '{"note":';
		json.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(read(q, doc, 'revisions')).toEqual([{ note: 'First cut', pages: 3 }]);
	});
});
