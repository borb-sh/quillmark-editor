// @vitest-environment jsdom
// The three controls the reference quill declares no field for: the boolean
// switch, the object subform, and the array's `object` element. The rest of the
// suite drives the fixture's own leaves; these have none, so the quill grows them
// here, through the in-memory YAML patch `reorder.svelte.test.ts` also spends,
// rather than a second fixture on disk or a hand-built schema the WASM boundary
// never sees.
//
// Each control is driven as a pointer drives it and the value read back through
// `DocumentReader`, so the commit is judged by the writer's own conformance rather
// than by a captured callback argument.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { Quill, Document, DocumentReader } from '@quillmark/wasm';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { loadFixtureTree } from '../helpers/fixtures.js';

// jsdom implements neither, and mounting the editor reaches both: the card
// scroll hop and the FLIP the survivors run through.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];

/**
 * The three fields the fixture lacks, spliced into `main.fields` ahead of
 * `card_kinds:`, the one anchor that closes the main card's field map. They join
 * the declared `additional` group, where no leaf collides with them.
 */
const ABSENT_TYPES = `
    draft:
      type: boolean
      default: false
      ui:
        group: additional
      description: Mark the memo as a working draft.

    seal_override:
      type: object
      properties:
        caption:
          type: string
        scale:
          type: number
        enabled:
          type: boolean
      ui:
        group: additional
      description: Replace the letterhead seal.

    routing_stops:
      type: array
      items:
        type: object
        properties:
          office:
            type: string
          days:
            type: number
      ui:
        group: additional
      description: Offices the memo passes through.

`;

function quillWithAbsentTypes(): Quill {
	const tree = loadFixtureTree();
	const yaml = new TextDecoder().decode(tree.get('Quill.yaml')!);
	const patched = yaml.replace(/\ncard_kinds:\n/, `\n${ABSENT_TYPES}card_kinds:\n`);
	if (patched === yaml)
		throw new Error('fixture drift: `card_kinds:` no longer closes main.fields');
	tree.set('Quill.yaml', new Uint8Array(Buffer.from(patched, 'utf8')));
	return Quill.fromTree(tree);
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
		const q = quillWithAbsentTypes();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		const sw = field(target, 'Draft').querySelector<HTMLElement>('[role="switch"]')!;
		expect(sw.getAttribute('aria-checked')).toBe('false');

		sw.click();
		flushSync();
		expect(sw.getAttribute('aria-checked')).toBe('true');
		expect(read(q, doc, 'draft')).toBe(true);

		// The switch is a control, not a latch: the second click writes `false`
		// rather than clearing the field back to its `default:`.
		sw.click();
		flushSync();
		expect(read(q, doc, 'draft')).toBe(false);
	});
});

describe('an object field', () => {
	it('commits the whole object on each property, keeping the properties beside it', () => {
		const q = quillWithAbsentTypes();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		const obj = field(target, 'Seal override');
		const props = [...obj.querySelectorAll<HTMLElement>('.qm-object-prop')];
		// Declaration order, which is what the subform renders by.
		expect(props.map((p) => p.querySelector('.qm-object-label')?.textContent)).toEqual([
			'Caption',
			'Scale',
			'Enabled'
		]);

		type(props[0].querySelector('input')!, 'Wing seal');
		expect(read(q, doc, 'seal_override')).toEqual({ caption: 'Wing seal' });

		// The second property commits the object BY VALUE, so the first has to ride
		// along: a commit that carried only the edited key would drop it.
		type(props[1].querySelector('input')!, '1.5');
		expect(read(q, doc, 'seal_override')).toEqual({ caption: 'Wing seal', scale: 1.5 });

		props[2].querySelector<HTMLElement>('[role="switch"]')!.click();
		flushSync();
		expect(read(q, doc, 'seal_override')).toEqual({
			caption: 'Wing seal',
			scale: 1.5,
			enabled: true
		});
	});

	it('drops a cleared property rather than committing a hole', () => {
		const q = quillWithAbsentTypes();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		const props = [
			...field(target, 'Seal override').querySelectorAll<HTMLElement>('.qm-object-prop')
		];
		type(props[0].querySelector('input')!, 'Wing seal');
		type(props[1].querySelector('input')!, '1.5');
		expect(read(q, doc, 'seal_override')).toEqual({ caption: 'Wing seal', scale: 1.5 });

		// Cleared to empty: the key goes ABSENT (resolving to its own `default:`)
		// rather than being committed as `undefined`.
		type(props[0].querySelector('input')!, '');
		expect(read(q, doc, 'seal_override')).toEqual({ scale: 1.5 });
	});
});

describe('an array of objects', () => {
	it('commits an element parsed from its JSON, and keeps the prior value on invalid JSON', () => {
		const q = quillWithAbsentTypes();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		const arr = arrayField(target, 'Routing stops');
		arr.querySelector<HTMLButtonElement>('.qm-add-el')!.click();
		flushSync();

		// The `object` element is a JSON editor, not a text input: the empty element
		// renders as an object literal.
		const json = arr.querySelector<HTMLTextAreaElement>('textarea.qm-json')!;
		expect(json.value).toBe('{}');

		json.value = '{"office":"ORG/SYMBOL","days":3}';
		json.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(read(q, doc, 'routing_stops')).toEqual([{ office: 'ORG/SYMBOL', days: 3 }]);

		// Unparseable entry is swallowed by the element's own `catch`: the committed
		// array is the last one that parsed, not an empty object and not a throw.
		json.value = '{"office":';
		json.dispatchEvent(new Event('change', { bubbles: true }));
		flushSync();
		expect(read(q, doc, 'routing_stops')).toEqual([{ office: 'ORG/SYMBOL', days: 3 }]);
	});
});
