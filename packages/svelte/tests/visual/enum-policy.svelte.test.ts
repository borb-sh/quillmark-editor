// @vitest-environment jsdom
// The enum-option policy's two arms, driven the way a pointer opens the listbox and
// judged on the rows it draws. `classification` is the field the distinction exists
// for: a level a deployment does not carry is not a level it withholds, and
// `'disable'` is a promise only the second case can keep.
//
// The third case is the authored-value escape, which is what makes `'hide'` coherent
// rather than merely shorter: the row the control has selected is drawn under either
// policy, so the listbox still shows what the document says.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Addr, Document, Quill } from '@quillmark/wasm';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import type { VisualEditorProps } from '$lib/visual/props';
import { quill } from '../helpers/fixtures.js';

// jsdom implements none of these, and mounting the editor and opening a listbox
// reach all of them: the card scroll hop, the reorder FLIP, the trigger's implicit
// pointer-capture release, and floating-ui's observation of the anchor.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
globalThis.ResizeObserver ??= class {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
};

/** The levels this deployment does not carry, in the reference quill's own set. */
const WITHHELD = ['CONFIDENTIAL', 'SECRET', 'TOP SECRET'];
const allowedLevels = (_addr: Addr, value: string) => !WITHHELD.includes(value);

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

function mountEditor(
	props: Partial<VisualEditorProps> = {},
	seed?: (q: Quill, doc: Document) => void
) {
	const q = quill();
	const doc = q.seedDocument();
	seed?.(q, doc);
	const target = document.createElement('div');
	document.body.appendChild(target);
	const app = mount(VisualEditor, { target, props: { doc, quill: q, ...props } });
	flushSync();
	cleanup = () => {
		void unmount(app);
		target.remove();
		doc.free();
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

/** Open a field's listbox as a pointer opens it: the primitive acts on `pointerdown`
 *  and releases the implicit capture, and the click settles it. */
function openList(target: HTMLElement, label: string): HTMLElement {
	const trigger = field(target, label).querySelector<HTMLElement>('.qm-select')!;
	trigger.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
	trigger.click();
	flushSync();
	return trigger;
}

/** Pick a row as a pointer picks it: the primitive commits on `pointerup`, which is
 *  what lets a press on the trigger release onto a row. */
function pick(target: HTMLElement, text: string): void {
	const row = [...target.querySelectorAll<HTMLElement>('.qm-select-item')].find(
		(el) => el.textContent?.trim() === text
	);
	if (!row) throw new Error(`no option ${text} in the open list`);
	row.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
	flushSync();
}

/** The schema options the open list draws, in order, each with whether it is offered.
 *  The UNSET sentinel is dropped: it is the clear-to-default affordance, exempt from
 *  policy, and it ghosts a `default:` that can read identically to a real member (the
 *  reference quill declares an empty-string level, and both render as an em dash). */
function options(target: HTMLElement): { text: string; disabled: boolean }[] {
	return [...target.querySelectorAll<HTMLElement>('.qm-select-item')]
		.filter((el) => !el.querySelector('.qm-select-ghost'))
		.map((el) => ({
			text: el.textContent?.trim() ?? '',
			disabled: el.hasAttribute('data-disabled')
		}));
}

const texts = (target: HTMLElement) => options(target).map((o) => o.text);

describe("enumDisallowed: 'disable'", () => {
	it('is the default, and draws a refused option greyed in place', () => {
		const target = mountEditor({ enumOptionAllowed: allowedLevels });
		openList(target, 'Classification');

		// The whole schema set, order intact: nothing is stripped.
		expect(texts(target)).toEqual(['—', 'UNCLASSIFIED', 'CUI', ...WITHHELD]);
		expect(
			options(target)
				.filter((o) => o.disabled)
				.map((o) => o.text)
		).toEqual(WITHHELD);
	});

	it('offers every option when no hook is set', () => {
		const target = mountEditor();
		openList(target, 'Classification');

		expect(options(target).some((o) => o.disabled)).toBe(false);
	});
});

describe("enumDisallowed: 'hide'", () => {
	it('leaves a refused option out of the list', () => {
		const target = mountEditor({ enumOptionAllowed: allowedLevels, enumDisallowed: 'hide' });
		openList(target, 'Classification');

		expect(texts(target)).toEqual(['—', 'UNCLASSIFIED', 'CUI']);
	});

	it('draws the authored value anyway, disabled, and no other out-of-policy row', () => {
		// Authored before the mount, the way a stored document arrives: the deployment
		// stopped carrying the level after this document was written.
		const target = mountEditor(
			{ enumOptionAllowed: allowedLevels, enumDisallowed: 'hide' },
			(q, doc) => q.writer(doc).set('classification', 'SECRET')
		);
		const trigger = openList(target, 'Classification');

		expect(texts(target)).toEqual(['—', 'UNCLASSIFIED', 'CUI', 'SECRET']);
		expect(
			options(target)
				.filter((o) => o.disabled)
				.map((o) => o.text)
		).toEqual(['SECRET']);
		// The closed control says what the document says, under either policy.
		expect(trigger.textContent).toContain('SECRET');
	});

	it('drops the row once the document no longer holds it', () => {
		const target = mountEditor(
			{ enumOptionAllowed: allowedLevels, enumDisallowed: 'hide' },
			(q, doc) => q.writer(doc).set('classification', 'SECRET')
		);
		openList(target, 'Classification');
		pick(target, 'CUI');

		openList(target, 'Classification');
		expect(texts(target)).toEqual(['—', 'UNCLASSIFIED', 'CUI']);
	});
});

describe('the policy reaches a card field', () => {
	it('applies to an indorsement enum, not only the main card', () => {
		const target = mountEditor({
			enumOptionAllowed: (_addr, value) => value !== 'separate_page',
			enumDisallowed: 'hide'
		});
		openList(target, 'Format');

		expect(texts(target)).toEqual(['standard', 'informal']);
	});
});

describe('the hook is asked per option, at the field it draws', () => {
	it('carries the field addr', () => {
		const seen: { addr: Addr; value: string }[] = [];
		const target = mountEditor({
			enumOptionAllowed: (addr, value) => {
				seen.push({ addr, value });
				return true;
			}
		});
		openList(target, 'Classification');

		const asked = seen.filter((s) => s.addr.field === 'classification');
		expect(asked.map((s) => s.value)).toEqual(
			expect.arrayContaining(['UNCLASSIFIED', 'CUI', 'SECRET'])
		);
	});
});
