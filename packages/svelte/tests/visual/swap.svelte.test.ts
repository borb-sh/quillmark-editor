// @vitest-environment jsdom
// The document swap, driven through a MAIN-CARD leaf, which is the case a hand
// reseed misses: composable cards key on session id and would re-mount on their
// own, the main card is keyed on nothing, and its prose leaves mount once per
// stable leaf key with `createField` closing over the `doc` handed to them. So a
// swap the surface does not re-key on leaves the main card rendering — and
// committing to — the previous document, with every id and index still agreeing.
//
// What is asserted is the remount itself: the leaf's DOM node is replaced and its
// content is the new document's. That is the whole mechanism, because a leaf whose
// `createField` ran against the new handle commits there by construction.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { Document, type Quill } from '$lib/core';
import type { EditorError } from '$lib/core';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { quill } from '../helpers/fixtures.js';

/** A document whose `subject` is `text`, seeded off the reference quill. */
function docWith(q: Quill, text: string): Document {
	const doc = q.seedDocument();
	q.writer(doc).set('subject', text);
	return doc;
}

/** The main card's `subject` leaf, by the key the registry stamps on it. */
function subjectLeaf(target: HTMLElement): HTMLElement | null {
	return target.querySelector('[data-leaf-key$="subject"]');
}

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

/** Mount the editor over a reactive prop bag the test can swap under it. */
function mountEditor(q: Quill, doc: Document) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const errors: EditorError[] = [];
	const props = $state({ doc, quill: q, onError: (e: EditorError) => errors.push(e) });
	const app = mount(VisualEditor, { target, props });
	flushSync();
	cleanup = () => {
		void unmount(app);
		target.remove();
	};
	return { target, props, errors };
}

describe('swapping the doc prop', () => {
	it('remounts the main card leaf onto the new handle', () => {
		const q = quill();
		const a = docWith(q, 'FIRST SUBJECT');
		const b = docWith(q, 'SECOND SUBJECT');
		const { target, props } = mountEditor(q, a);

		const before = subjectLeaf(target);
		expect(before).not.toBeNull();
		expect(before?.textContent).toContain('FIRST SUBJECT');

		props.doc = b;
		flushSync();

		const after = subjectLeaf(target);
		expect(after).not.toBeNull();
		// A REMOUNT, not a re-render: the node itself is replaced, which is what
		// `createField` running again against `b` looks like from outside.
		expect(after).not.toBe(before);
		expect(after?.textContent).toContain('SECOND SUBJECT');
		// And the leaf carries none of the previous document's text.
		expect(after?.textContent).not.toContain('FIRST SUBJECT');

		a.free();
		b.free();
	});

	it('reports nothing when the doc swaps: the re-key covers it', () => {
		const q = quill();
		const a = docWith(q, 'A');
		const b = docWith(q, 'B');
		const { props, errors } = mountEditor(q, a);

		props.doc = b;
		flushSync();

		expect(errors.filter((e) => e.code === 'rebind-ignored')).toHaveLength(0);
		a.free();
		b.free();
	});
});

describe('swapping the quill prop alone', () => {
	it('reports rebind-ignored once, at dev severity', () => {
		const q = quill();
		const a = docWith(q, 'A');
		const { props, errors } = mountEditor(q, a);

		// A distinct handle over the same fixture: the pairing is what the guard
		// watches, not the schema's contents.
		props.quill = Object.create(q) as Quill;
		flushSync();
		props.quill = Object.create(q) as Quill;
		flushSync();

		const reported = errors.filter((e) => e.code === 'rebind-ignored');
		expect(reported).toHaveLength(1);
		expect(reported[0].severity).toBe('dev');
		a.free();
	});
});
