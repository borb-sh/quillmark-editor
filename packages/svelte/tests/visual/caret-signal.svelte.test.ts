// @vitest-environment jsdom
// `onCaretMove` reports a PLACE, so a transaction that moved the caret nowhere is
// not one to report: a leaf dispatches one caret signal per transaction, and
// landing a caret where it already sits is a transaction like any other. Driven
// through `setCaret`, which is the one entry that places a caret on demand and so
// the one that can ask for the same place twice.
//
// The memo spans leaves, which is what a per-leaf guard cannot do: leaving a place
// and coming back to the same offset in it is two moves, and a consumer following
// the caret has to hear both.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { Quill, type ContentHit, type Document } from '@quillmark/wasm';
import type { Place } from '$lib/core';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { quill } from '../helpers/fixtures.js';

// jsdom implements neither, and the reveal `setCaret` runs first reaches both.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];

interface EditorRef {
	setCaret(hit: ContentHit): Promise<void>;
}

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

function mountEditor(q: Quill, doc: Document) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const places: Place[] = [];
	const app = mount(VisualEditor, {
		target,
		props: { doc, quill: q, onCaretMove: (at: Place) => places.push(at) }
	}) as unknown as EditorRef;
	flushSync();
	cleanup = () => {
		void unmount(app);
		target.remove();
	};
	return { editor: app, places };
}

const at = (field: string, pos: number): ContentHit => ({ field, pos }) as ContentHit;

describe('the caret signal reports places, not transactions', () => {
	it('landing the caret where it already sits reports once', async () => {
		const q = quill();
		const { editor, places } = mountEditor(q, q.seedDocument());

		await editor.setCaret(at('main.body', 3));
		const first = places.length;
		expect(places.at(-1)).toEqual({ field: 'main.body', pos: 3 });

		await editor.setCaret(at('main.body', 3));
		await editor.setCaret(at('main.body', 3));
		expect(places.length).toBe(first);
	});

	it('a place left and returned to is two moves, across leaves', async () => {
		const q = quill();
		const { editor, places } = mountEditor(q, q.seedDocument());

		await editor.setCaret(at('main.body', 3));
		places.length = 0;

		await editor.setCaret(at('main.subject', 3));
		await editor.setCaret(at('main.body', 3));
		expect(places).toEqual([
			{ field: 'main.subject', pos: 3 },
			{ field: 'main.body', pos: 3 }
		]);
	});
});
