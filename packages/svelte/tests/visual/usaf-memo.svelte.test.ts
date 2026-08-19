// @vitest-environment jsdom
// The shipped quill, drawn. `usaf_memo` is a copy of a real one (fixtures/Quiver.yaml)
// and declares nothing for this tier's benefit, so what it asks the surface for is
// what a quill author asks for: the conformance lane beside `specimen`'s curated one.
//
// Two kinds of claim here, and the difference is what survives a re-copy. The first
// three read the schema the quill happens to declare — every field draws, every group
// sections, in the order the schema gives — and hold whatever it declares next. The
// last two name shapes, and are meant to fail when the shape or the surface moves:
// they are what the tier does with `plaintext` and with a variant whose cells are
// prose, which is most of this quill.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Quill, Document } from '@quillmark/wasm';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { fieldModels, groupOrder } from '$lib/visual/structure';
import { quill } from '../helpers/fixtures.js';

Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];
Element.prototype.hasPointerCapture ??= () => false;

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

const memo = () => quill('usaf_memo');

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

const texts = (target: HTMLElement, selector: string): string[] =>
	[...target.querySelectorAll<HTMLElement>(selector)].map(
		(el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? ''
	);

describe('the shipped quill on the surface', () => {
	it('draws a labelled control for every field of every card it seeds', () => {
		const q = memo();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		const schema = q.schema;
		// The seed lays the main card and one `indorsement`; both are declared kinds, so
		// neither falls to the recovery shell.
		expect(target.querySelectorAll('.qm-card').length).toBe(2);
		expect(target.querySelector('.qm-card-recovery')).toBeNull();

		const declared =
			Object.keys(schema.main.fields).length +
			Object.keys(schema.card_kinds!.indorsement.fields).length;
		expect(target.querySelectorAll('.qm-field').length).toBe(declared);
		// A control nothing names is a control nobody can reach: every field carries its
		// label, closed sections included (a closed panel is inert, not unmounted).
		expect(target.querySelectorAll('.qm-field-label').length).toBe(declared);
	});

	it('sections the main card into the groups the schema registers, in that order', () => {
		const q = memo();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		// The quill spells `ui.groups` as a list and the boundary serves the registry a
		// map, so the JS tier reads one shape however an author wrote it — and the order
		// on the surface is the order the registry gives.
		expect(groupOrder(q.schema.main)).toEqual([
			'addressing',
			'letterhead',
			'classification',
			'additional'
		]);
		const main = target.querySelector<HTMLElement>('.qm-card')!;
		expect(texts(main, '.qm-group-header')).toEqual([
			'Addressing',
			'Letterhead',
			'Classification',
			'Additional'
		]);
	});

	it('names a card kind’s fields as the projection labels them, in declaration order', () => {
		const q = memo();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		const card = [...target.querySelectorAll<HTMLElement>('.qm-card')][1];
		// The marker rides inside the label, so the text carries it: three of this kind's
		// fields declare no `default:` and say so.
		expect(texts(card, '.qm-field-label')).toEqual(
			fieldModels(q.schema.card_kinds!.indorsement).map((m) =>
				m.required ? `${m.label} *` : m.label
			)
		);
	});

	it('takes a `plaintext` field as a block leaf, the `inline` it declares not surviving', () => {
		// Most of this quill is `plaintext` + `inline: true`, and the boundary serves
		// `inline` for richtext alone — so the leaf takes the block floor and `packable`
		// declines the `ui.compact` beside it.
		const byName = Object.fromEntries(fieldModels(memo().schema.main).map((m) => [m.name, m]));
		expect(byName.subject.control).toBe('prose');
		expect(byName.subject.plaintext).toBe(true);
		expect(byName.subject.inline).toBe(false);
		expect(byName.tag_line.inline).toBe(true); // the one richtext scalar, declared alike
		expect(byName.dissemination.compact).toBe(true);

		// And on the surface, where a packed field is a `cell` (or a `lone` where its run
		// is one) and a declined one spans the row.
		const q = memo();
		const target = mountEditor(q, q.seedDocument());
		const span = (label: string) => {
			const el = [...target.querySelectorAll<HTMLElement>('.qm-field')].find(
				(f) => f.querySelector('.qm-field-label')?.textContent?.trim() === label
			)!;
			return el.classList.contains('cell')
				? 'cell'
				: el.classList.contains('lone')
					? 'lone'
					: 'full';
		};
		expect(span('Dissemination')).toBe('full');
		// The `compact` request is read: a scalar the boundary does serve `inline` for
		// packs. Its run is one, the fields around it being the leaves above.
		expect(span('Tag line')).toBe('lone');
	});

	it('draws the CUI world as cells it cannot fill', () => {
		const q = memo();
		const doc = q.seedDocument();
		doc.storeField('classification', { value: 'CUI' });
		const target = mountEditor(q, doc);

		const field = [...target.querySelectorAll<HTMLElement>('.qm-field')].find(
			(f) => f.querySelector('.qm-field-label span')?.textContent === 'Classification'
		)!;
		// The world's four cells are named and obliged as the schema declares them.
		expect(texts(field, '.qm-object-prop .qm-field-label')).toEqual([
			'Controlled by *',
			'Poc *',
			'Category',
			'Limited dissemination'
		]);
		// And every one of them is `plaintext`, which the subform does not recurse into:
		// the whole world stands the line pointing at the source view, so a CUI document
		// cannot be finished from this surface.
		expect(texts(field, '.qm-object-prop .qm-unsupported')).toEqual(
			Array(4).fill('A nested prose — edit this field in the source view.')
		);
		expect(field.querySelectorAll('.qm-object-prop input')).toHaveLength(0);
	});
});
