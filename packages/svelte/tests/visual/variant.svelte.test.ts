// @vitest-environment jsdom
// The variant control: a discriminant select over `values:`, and under it the cells
// the chosen world brings into play. Driven off the reference quill's `distribution`
// field on disk — three members, one of them declaring no cells at all — as a pointer
// drives it, and read back through the document rather than off a captured callback.
//
// The claims that are the feature: a world's cells appear and retire with the pick,
// obligation is per world (`lift_on` is required on an embargoed document and exists
// nowhere else), and an answer the discriminant strands is kept rather than dropped.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Quill, Document } from '@quillmark/wasm';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { quill } from '../helpers/fixtures.js';

Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];
// jsdom implements no pointer-capture API, and the trigger probes for one before it
// opens (see enum-policy).
Element.prototype.hasPointerCapture ??= () => false;

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

function field(target: HTMLElement, label: string): HTMLElement {
	const match = [...target.querySelectorAll<HTMLElement>('.qm-field')].find(
		(f) => f.querySelector('.qm-field-label span')?.textContent === label
	);
	if (!match) throw new Error(`no field labelled ${label}`);
	return match;
}

/** Open the variant's discriminant list as a pointer opens it (see enum-policy). */
function openList(target: HTMLElement): void {
	const trigger = field(target, 'Distribution').querySelector<HTMLElement>('.qm-select')!;
	trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
	trigger.click();
	flushSync();
}

function press(row: HTMLElement | undefined, what: string): void {
	if (!row) throw new Error(`no ${what} in the open list`);
	row.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
	flushSync();
}

/** Pick a world by its option text. The sentinel is excluded by class rather than by
 *  text: it ghosts the resolved default, so its row reads `internal` too. */
function pickWorld(target: HTMLElement, text: string): void {
	openList(target);
	press(
		[...target.querySelectorAll<HTMLElement>('.qm-select-item')].find(
			(el) => !el.querySelector('.qm-select-ghost') && el.textContent?.trim() === text
		),
		`option ${text}`
	);
}

/** Pick the unset sentinel: the clear-back-to-default affordance. */
function clearWorld(target: HTMLElement): void {
	openList(target);
	press(
		[...target.querySelectorAll<HTMLElement>('.qm-select-item')].find((el) =>
			el.querySelector('.qm-select-ghost')
		),
		'unset sentinel'
	);
}

/** The drawn cells of the live world, label text in declaration order. The marker is
 *  a sibling node inside the label, so the text is normalized rather than compared
 *  raw: what the assertions are about is the name and its obligation, not the
 *  whitespace `FieldLabel`'s markup leaves between the two. */
function cellLabels(target: HTMLElement): string[] {
	return [
		...field(target, 'Distribution').querySelectorAll<HTMLElement>(
			'.qm-object-prop .qm-field-label'
		)
	].map((el) => el.textContent?.replace(/\s+/g, ' ').trim() ?? '');
}

/** A cell's text input, by the label it sits under. */
function cellInput(target: HTMLElement, label: string): HTMLInputElement {
	const prop = [
		...field(target, 'Distribution').querySelectorAll<HTMLElement>('.qm-object-prop')
	].find((p) => p.querySelector('.qm-field-label')?.textContent?.trim().startsWith(label));
	const input = prop?.querySelector('input');
	if (!input) throw new Error(`no cell input under ${label}`);
	return input;
}

function type(input: HTMLInputElement, value: string): void {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
	input.dispatchEvent(new Event('change', { bubbles: true }));
	flushSync();
}

const stored = (doc: Document) => doc.getStored('distribution');

describe('a variant enum field', () => {
	it('draws the cells of the world the document renders as, and retires them on a flip', () => {
		const q = quill();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		// Unset: the ghosted `default:` is `internal`, which declares no cells. The drawn
		// world follows the ghost rather than nothing, so the form shows the cells the
		// document will actually print.
		expect(stored(doc)).toBeUndefined();
		expect(cellLabels(target)).toEqual([]);

		// `lift_on` declares no `default:` and is obliged; `held_by` declares `""` and is
		// not. The pair is what the axis buys: required *in this world*.
		pickWorld(target, 'embargoed');
		expect(cellLabels(target)).toEqual(['Lift on *', 'Held by']);

		// One world's cells are not the other's: the flip retires both and brings the
		// licence in, rather than accumulating a union of every world's fields.
		pickWorld(target, 'public');
		expect(cellLabels(target)).toEqual(['License']);

		pickWorld(target, 'internal');
		expect(cellLabels(target)).toEqual([]);
	});

	it('names an obliged cell through a real label, and says "required" on the marker', () => {
		const q = quill();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		pickWorld(target, 'embargoed');
		// A cell is named the way every other control on the surface is: a `<label for>`
		// pointing at it, so the name is the label's own text and there is no second
		// `aria-label` beside it for an implementation to have to choose between.
		const input = cellInput(target, 'Lift on');
		expect(input.getAttribute('aria-label')).toBeNull();
		const label = target.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`);
		expect(label?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Lift on *');
		// The glyph announces the word rather than the character, and it rides inside the
		// label so it names the control along with the text.
		expect(label?.querySelector('.qm-field-required')?.getAttribute('aria-label')).toBe('required');

		const unobliged = cellInput(target, 'Held by');
		expect(
			target
				.querySelector<HTMLLabelElement>(`label[for="${unobliged.id}"]`)
				?.querySelector('.qm-field-required')
		).toBeNull();
	});

	it('commits a cell into the container, keeping the discriminant beside it', () => {
		const q = quill();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		pickWorld(target, 'embargoed');
		expect(stored(doc)).toEqual({ value: 'embargoed' });

		type(cellInput(target, 'Lift on'), '2027-01-01');
		expect(stored(doc)).toEqual({ value: 'embargoed', lift_on: '2027-01-01' });

		// The container commits by value, so the cell beside it has to ride along.
		type(cellInput(target, 'Held by'), 'Legal');
		expect(stored(doc)).toEqual({
			value: 'embargoed',
			lift_on: '2027-01-01',
			held_by: 'Legal'
		});
	});

	it('keeps an answer the discriminant strands, through the flip and back', () => {
		const q = quill();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		pickWorld(target, 'embargoed');
		type(cellInput(target, 'Lift on'), '2027-01-01');

		// Flip away to compare: the boundary carries a stranded answer and warns rather
		// than dropping it, and the control does the same. Dropping here would spend the
		// answer on the ordinary gesture.
		pickWorld(target, 'internal');
		expect(cellLabels(target)).toEqual([]);
		expect(stored(doc)).toEqual({ value: 'internal', lift_on: '2027-01-01' });

		// And back: the answer is still the document's, so the cell re-draws filled.
		pickWorld(target, 'embargoed');
		expect(cellInput(target, 'Lift on').value).toBe('2027-01-01');
		expect(stored(doc)).toEqual({ value: 'embargoed', lift_on: '2027-01-01' });
	});

	it('clears the discriminant alone, and the whole field when it held nothing else', () => {
		const q = quill();
		const doc = q.seedDocument();
		const target = mountEditor(q, doc);

		// Nothing beside the discriminant: clearing leaves an empty container, which is
		// an unset field — removed, so the `default:` resolves at render rather than a
		// `{}` being written.
		pickWorld(target, 'public');
		expect(stored(doc)).toEqual({ value: 'public' });
		clearWorld(target);
		expect(stored(doc)).toBeUndefined();

		// With an answer beside it, clearing is the discriminant's own gesture: it takes
		// that cell and leaves the answer, for the same reason a flip does.
		pickWorld(target, 'embargoed');
		type(cellInput(target, 'Lift on'), '2027-01-01');
		clearWorld(target);
		expect(stored(doc)).toEqual({ lift_on: '2027-01-01' });
	});
});
