// @vitest-environment jsdom
// The editor's verbs reached from OUTSIDE its chrome, which is the whole point of
// them: a host toolbar, command palette or shortcut drives the same functions the
// card header calls, through `bind:this`, and gets the same `onChange`. They speak
// the public vocabulary — a `CardId` for a card, a `DocPath` for a place — so a host
// drives them with what the hooks handed it.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync, tick } from 'svelte';
import { Quill, type Document, type EditorError } from '$lib/core';
import type { CardId, EditorChange } from '$lib/visual';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { quill } from '../helpers/fixtures.js';

// jsdom implements neither, and a card operation reaches both: the insert/reorder
// scroll hop and the FLIP the removal runs the survivors through.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];

/** The instance surface a host binds to. */
interface EditorRef {
	focusField(field: string): Promise<void>;
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
	const app = mount(VisualEditor, {
		target,
		props: {
			doc,
			quill: q,
			onChange: (c: EditorChange) => changes.push(c),
			onError: (e: EditorError) => errors.push(e)
		}
	}) as unknown as EditorRef;
	flushSync();
	cleanup = () => {
		void unmount(app);
		target.remove();
	};
	return { target, editor: app, changes, errors };
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
});
