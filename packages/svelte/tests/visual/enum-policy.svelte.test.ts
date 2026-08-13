// @vitest-environment jsdom
// The enum-option policy's two arms and the authored-value escape (VISUAL_EDITOR
// §"Enum policy"), driven the way a pointer opens the listbox and judged on the rows
// it draws. `status` is the case the distinction exists for, and the six stages the
// reference quill declares leave a deployment carrying three with both kinds of row
// in one list.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Addr, Document, Quill } from '@quillmark/wasm';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import type { VisualEditorProps } from '$lib/visual/props';
import { quill } from '../helpers/fixtures.js';

// jsdom implements no pointer-capture API, and the trigger probes for one before it
// opens. `false` is the whole of what it needs: with nothing captured, the release
// beside it is never reached.
Element.prototype.hasPointerCapture ??= () => false;

/** The stages this deployment does not carry, in the reference quill's own set. */
const WITHHELD = ['approved', 'final', 'withdrawn'];
const allowedStages = (_addr: Addr, value: string) => !WITHHELD.includes(value);

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
 *  The unset sentinel is dropped: it is the clear-to-default affordance, exempt from
 *  policy, and it ghosts a `default:` that can read identically to a real member (the
 *  reference quill declares an empty-string stage, and both render as an em dash). */
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
		const target = mountEditor({ enumOptionAllowed: allowedStages });
		openList(target, 'Status');

		// The whole schema set, order intact: nothing is stripped.
		expect(texts(target)).toEqual(['—', 'draft', 'in_review', ...WITHHELD]);
		expect(
			options(target)
				.filter((o) => o.disabled)
				.map((o) => o.text)
		).toEqual(WITHHELD);
	});

	it('offers every option when no hook is set', () => {
		const target = mountEditor();
		openList(target, 'Status');

		expect(options(target).some((o) => o.disabled)).toBe(false);
	});
});

describe("enumDisallowed: 'hide'", () => {
	it('leaves a refused option out of the list', () => {
		const target = mountEditor({ enumOptionAllowed: allowedStages, enumDisallowed: 'hide' });
		openList(target, 'Status');

		expect(texts(target)).toEqual(['—', 'draft', 'in_review']);
	});

	it('draws the authored value anyway, disabled, and no other out-of-policy row', () => {
		// Authored before the mount, the way a stored document arrives: the deployment
		// stopped carrying the stage after this document was written.
		const target = mountEditor(
			{ enumOptionAllowed: allowedStages, enumDisallowed: 'hide' },
			(q, doc) => q.writer(doc).set('status', 'final')
		);
		const trigger = openList(target, 'Status');

		expect(texts(target)).toEqual(['—', 'draft', 'in_review', 'final']);
		expect(
			options(target)
				.filter((o) => o.disabled)
				.map((o) => o.text)
		).toEqual(['final']);
		// The closed control says what the document says, under either policy.
		expect(trigger.textContent).toContain('final');
	});

	it('drops the row once the document no longer holds it', () => {
		const target = mountEditor(
			{ enumOptionAllowed: allowedStages, enumDisallowed: 'hide' },
			(q, doc) => q.writer(doc).set('status', 'final')
		);
		openList(target, 'Status');
		pick(target, 'in_review');

		openList(target, 'Status');
		expect(texts(target)).toEqual(['—', 'draft', 'in_review']);
	});
});

describe('the policy reaches a card field', () => {
	it('applies to a section enum, not only the main card', () => {
		const target = mountEditor({
			enumOptionAllowed: (_addr, value) => value !== 'aside',
			enumDisallowed: 'hide'
		});
		openList(target, 'Layout');

		expect(texts(target)).toEqual(['prose', 'callout']);
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
		openList(target, 'Status');

		const asked = seen.filter((s) => s.addr.field === 'status');
		expect(asked.map((s) => s.value)).toEqual(
			expect.arrayContaining(['draft', 'in_review', 'final'])
		);
	});
});
