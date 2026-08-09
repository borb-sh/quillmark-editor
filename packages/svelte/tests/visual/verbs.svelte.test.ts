// @vitest-environment jsdom
// The editor's verbs reached from OUTSIDE its chrome, which is the whole point of
// them: a host toolbar, command palette or shortcut drives the same functions the
// card header calls, through `bind:this`, and gets the same `onChange`. They speak
// the public vocabulary — a `CardId` for a card, a `DocPath` for a place — so a host
// drives them with what the hooks handed it.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import { Quill, type Document } from '@quillmark/wasm';
import type { EditorError } from '$lib/core';
import type { ActiveLeaf, CardId, EditorChange } from '$lib/visual';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { quill } from '../helpers/fixtures.js';

// jsdom implements neither, and a card operation reaches both: the insert/reorder
// scroll hop and the FLIP the removal runs the survivors through.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];

/** The instance surface a host binds to. */
interface EditorRef {
	focusField(field: string): Promise<void>;
	setCaret(at: { field: string; pos?: number; granularity?: string }): Promise<void>;
	insertCard(kind: string, at?: number): CardId | undefined;
	removeCard(cardId: CardId): void;
	moveCard(cardId: CardId, dir: -1 | 1): void;
	setKind(cardId: CardId, kind: string): void;
}

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

function mountEditor(q: Quill, doc: Document) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const changes: EditorChange[] = [];
	const errors: EditorError[] = [];
	const active: ActiveLeaf[] = [];
	const app = mount(VisualEditor, {
		target,
		props: {
			doc,
			quill: q,
			onChange: (c: EditorChange) => changes.push(c),
			onError: (e: EditorError) => errors.push(e),
			onActiveLeafChange: (a: ActiveLeaf) => active.push(a)
		}
	}) as unknown as EditorRef;
	flushSync();
	cleanup = () => {
		void unmount(app);
		target.remove();
	};
	return { target, editor: app, changes, errors, active };
}

const slots = (target: HTMLElement) => [...target.querySelectorAll<HTMLElement>('.qm-card-slot')];
const leafKeys = (slot: HTMLElement) =>
	[...slot.querySelectorAll('[data-leaf-key]')].map((e) => e.getAttribute('data-leaf-key'));

describe('the card verbs', () => {
	it('insert, move, retype and remove, all reported as the click is', () => {
		const q = quill();
		const doc = q.seedDocument(); // one indorsement card, from the seed
		const { target, editor, changes } = mountEditor(q, doc);
		expect(slots(target)).toHaveLength(1);

		// The insert hands back the key, which is what a host tracking the new card
		// needs and the only thing the click path had no way to give it.
		const id = editor.insertCard('indorsement');
		flushSync();
		expect(id).toBe('c1');
		expect(slots(target)).toHaveLength(2);
		expect(changes.at(-1)).toEqual({
			source: 'structure',
			cardId: 'c1',
			path: 'cards.indorsement[1]'
		});

		editor.moveCard(id!, -1);
		flushSync();
		expect(changes.at(-1)).toEqual({
			source: 'structure',
			cardId: 'c1',
			path: 'cards.indorsement[0]'
		});
		expect(leafKeys(slots(target)[0])).toContain('c1:$body');

		editor.setKind(id!, 'indorsement');
		flushSync();
		expect(changes.at(-1)?.cardId).toBe('c1');

		editor.removeCard(id!);
		flushSync();
		expect(changes.at(-1)).toEqual({ source: 'structure', cardId: 'c1', path: undefined });
		expect(slots(target)).toHaveLength(1);
		expect(leafKeys(slots(target)[0])).toContain('c0:$body');
	});

	it('inserts at a given index, and clamps one outside the stack', () => {
		const q = quill();
		const { target, editor } = mountEditor(q, q.seedDocument());

		editor.insertCard('indorsement', 0);
		flushSync();
		expect(leafKeys(slots(target)[0])).toContain('c1:$body');

		// Past the end lands at the end rather than throwing or dropping the card.
		editor.insertCard('indorsement', 99);
		flushSync();
		expect(leafKeys(slots(target)[2])).toContain('c2:$body');
	});

	it('focuses a leaf by its path', async () => {
		const q = quill();
		const { target, editor } = mountEditor(q, q.seedDocument());

		await editor.focusField('cards.indorsement[0].body');
		await tick();

		const focused = document.activeElement;
		expect(slots(target)[0].contains(focused)).toBe(true);
		expect(focused?.closest('[data-leaf-key]')?.getAttribute('data-leaf-key')).toBe('c0:$body');
	});
});

// A memo's scalar fields ARE its front matter, and the preview reports a region for
// them (`session.regions()` names `main.signature_block` beside `main.body`), so a
// landing that reached content leaves only covered the smaller half of the bridge.
describe('the landing verbs over a form control', () => {
	it('focuses a string field, revealing the collapsed group holding it', async () => {
		const q = quill();
		const { target, editor, errors } = mountEditor(q, q.seedDocument());

		// `letterhead` is not the initially-expanded group, so the control starts inside
		// an `inert` panel: the reveal is half of the landing, not a nicety.
		const header = [...target.querySelectorAll<HTMLElement>('.qm-group-header')].find((h) =>
			h.textContent?.includes('Letterhead')
		);
		expect(header?.getAttribute('aria-expanded')).toBe('false');

		await editor.focusField('main.letterhead_title');
		await tick();

		expect(header?.getAttribute('aria-expanded')).toBe('true');
		// The input the field's own `<label for>` names, inside the panel the reveal
		// opened: the same place a click on that label lands, which is the point of the
		// two reading one function.
		const focused = document.activeElement as HTMLElement;
		expect(focused.tagName).toBe('INPUT');
		const panel = document.getElementById(header!.getAttribute('aria-controls')!);
		expect(panel?.contains(focused)).toBe(true);
		expect(panel?.querySelector(`label[for="${focused.id}"]`)).not.toBeNull();
		expect(errors).toHaveLength(0);
	});

	it('focuses an array field at its first element, and a date field at its first segment', async () => {
		const q = quill();
		const { editor, errors } = mountEditor(q, q.seedDocument());

		// The array's own answer to "focus this field", the one its label click takes.
		await editor.focusField('main.memo_for');
		await tick();
		expect(document.activeElement?.closest('.qm-array-row')).not.toBeNull();

		await editor.focusField('main.date');
		await tick();
		expect(document.activeElement?.getAttribute('data-segment')).toBeTruthy();

		expect(errors).toHaveLength(0);
	});

	it('reports the focused control as the active leaf, as a prose leaf reports', async () => {
		const q = quill();
		const { editor, active } = mountEditor(q, q.seedDocument());

		await editor.focusField('main.letterhead_title');
		await tick();
		expect(active.at(-1)).toEqual({ field: 'main.letterhead_title', cardId: 'main' });

		// An array of `richtext`: the element is a PM view with no controller of its own,
		// and the report is the wrapper's bubbling `focusin` like every other control's.
		await editor.focusField('main.references');
		await tick();
		expect(active.at(-1)).toEqual({ field: 'main.references', cardId: 'main' });
	});

	it('lands a preview hit on a control by focusing it, placing no caret', async () => {
		const q = quill();
		const { editor, errors } = mountEditor(q, q.seedDocument());

		// A `pos` a control has no coordinate to spend: the field is revealed and
		// focused, which is the whole of what a click on plate-placed ink can mean.
		await editor.setCaret({ field: 'main.letterhead_title', pos: 3 });
		await tick();

		expect(document.activeElement?.tagName).toBe('INPUT');
		expect(errors).toHaveLength(0);
	});

	it('lands a pick that carries no caret, the rung a plate-placed field answers on', async () => {
		const q = quill();
		const { editor, errors } = mountEditor(q, q.seedDocument());

		// `main.signature_block` is placed with its content untracked: the preview's
		// second rung names the field and has no offset to hand over.
		await editor.setCaret({ field: 'main.signature_block' });
		await tick();

		expect(document.activeElement?.closest('.qm-array-row')).not.toBeNull();
		expect(errors).toHaveLength(0);
	});
});

// An array ELEMENT address (`main.references.0`) is a granularity `Addr` cannot name
// and the registry is not keyed at: the ladder reads the trailing segment as an index
// under a field the SCHEMA declares an array, reveals the parent, and takes the row.
describe('a landing on an array element', () => {
	it('takes the row the address names rather than the first', async () => {
		const q = quill();
		const { editor, errors } = mountEditor(q, q.seedDocument());

		await editor.setCaret({ field: 'main.references.1', pos: 4 });
		await tick();

		// The element's own accessible name is `label` + its 1-based index, so this
		// distinguishes the row from the one a bare `focusField` would land on.
		expect(document.activeElement?.getAttribute('aria-label')).toBe('References 2');
		expect(errors).toHaveLength(0);
	});

	it('reads both spellings of the index the boundary emits', async () => {
		const q = quill();
		const { editor, errors } = mountEditor(q, q.seedDocument());

		// `regions()` and `positionAt` mint `main.references.0`; `formatDocPath` spells
		// the same address `main.references[0]`. Both are the same row.
		await editor.focusField('main.references[1]');
		await tick();

		expect(document.activeElement?.getAttribute('aria-label')).toBe('References 2');
		expect(errors).toHaveLength(0);
	});

	it('falls back to the field for a row this document no longer has', async () => {
		const q = quill();
		const { editor, errors } = mountEditor(q, q.seedDocument());

		// A landing off a compile the document has moved past: the field is right and
		// the row is gone, so the array's own focus answer stands.
		await editor.focusField('main.references.9');
		await tick();

		expect(document.activeElement?.getAttribute('aria-label')).toBe('References 1');
		expect(errors).toHaveLength(0);
	});
});

describe('a verb handed a target the surface does not hold', () => {
	it('no-ops and reports target-unknown at dev, for a card and for a path', async () => {
		const q = quill();
		const { target, editor, changes, errors } = mountEditor(q, q.seedDocument());

		editor.removeCard('c99');
		editor.moveCard('c99', 1);
		editor.setKind('c99', 'indorsement');
		await editor.focusField('main.no_such_field');
		flushSync();

		// Nothing moved and nothing was reported as a change: the document is untouched.
		expect(slots(target)).toHaveLength(1);
		expect(changes).toHaveLength(0);
		expect(errors.map((e) => e.code)).toEqual(Array(4).fill('target-unknown'));
		expect(errors.every((e) => e.severity === 'dev')).toBe(true);
		expect(errors.at(-1)?.path).toBe('main.no_such_field');
	});

	it('reports an element path whose array is not one, through either verb', async () => {
		const q = quill();
		const { editor, errors } = mountEditor(q, q.seedDocument());

		// The element rung is SCHEMA-GUARDED: a trailing index under a field that is no
		// array is a nested address the tree mounts nothing at, and reading it as a row
		// would land the caret in a field the path does not name. `letterhead_title` is
		// a string; `no_such_field` is nothing at all.
		await editor.focusField('main.letterhead_title.0');
		await editor.setCaret({ field: 'main.no_such_field.0', pos: 0 });
		flushSync();

		expect(errors.map((e) => e.code)).toEqual(['target-unknown', 'target-unknown']);
		expect(errors.every((e) => e.severity === 'dev')).toBe(true);
		expect(errors.at(-1)?.path).toBe('main.no_such_field.0');
	});
});
