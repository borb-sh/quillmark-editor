// @vitest-environment jsdom
// An array of `richtext` on a document that came through the transport door
// (`Document.fromMarkdown`): elements rest as authored strings, the same rest
// form a scalar richtext field takes. The row reads one through
// `reader.getContentAt`, which decodes at the codec the declared type names, so
// the emphasis below is lowered by the boundary rather than by the row.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { init, type Document, type Quill } from '@quillmark/wasm';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { quill } from '../helpers/fixtures.js';

const core = await init();

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

const ELEMENT_LABEL = 'Keywords ';

function rows(target: HTMLElement): HTMLElement[] {
	return [...target.querySelectorAll<HTMLElement>(`.ProseMirror[aria-label^="${ELEMENT_LABEL}"]`)];
}

describe('an array of richtext loaded from markdown', () => {
	it('mounts authored-string elements as prose rows, with emphasis lowered', () => {
		const q = quill();
		const doc = core.Document.fromMarkdown(`~~~
$quill: specimen@1.0.0
$kind: main
title: Probe
keywords:
  - Dominion Fleet Intelligence, 2504, *Char Orbital Reconnaissance Summary*
  - Raynor's Raiders Field Report, 2504, *Zerg Hive Cluster Activity on Char*
~~~

Body.
`);
		expect((doc.getStored('keywords') as unknown[]).every((e) => typeof e === 'string')).toBe(true);

		const target = mountEditor(q, doc);
		const text = rows(target).map((el) => el.textContent);
		expect(text).toEqual([
			'Dominion Fleet Intelligence, 2504, Char Orbital Reconnaissance Summary',
			"Raynor's Raiders Field Report, 2504, Zerg Hive Cluster Activity on Char"
		]);
		expect(text.some((t) => t?.includes('*'))).toBe(false);

		doc.free();
	});
});
