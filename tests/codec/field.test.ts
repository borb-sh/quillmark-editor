// @vitest-environment jsdom
// Criterion 8 (standalone leaf) + criterion 7 (field-level reconcile). A
// createField over a REAL usaf_memo `subject` (inline) and body edits via
// applyChange; the caret survives own-edits through the PM StepMap; an external
// corpus change re-hydrates and the leaf's own edit does not.
import { describe, it, expect, beforeEach } from 'vitest';
import { EditorView } from 'prosemirror-view';
import { createField, blockSchema, pmToRichText } from '$lib/core/codec';
import type { FieldController } from '$lib/core/codec';
import type { Document } from '$lib/core';
import { quill, normalize, corpusEqual } from './_util.js';

/** The view is attached to the controller as an undocumented handle. */
function viewOf(f: FieldController): EditorView {
	return (f as FieldController & { view: EditorView }).view;
}

function mount(): HTMLElement {
	const el = document.createElement('div');
	document.body.appendChild(el);
	return el;
}

describe('createField over a real usaf_memo leaf', () => {
	let doc: Document;
	beforeEach(() => {
		doc = quill().seedDocument();
	});

	it('edits the inline `subject` field via applyChange', () => {
		const caret: number[] = [];
		const field = createField({
			doc,
			addr: { field: 'subject' },
			container: mount(),
			inline: true,
			onCaretMove: (_addr, pos) => caret.push(pos)
		});
		const before = (doc.get('subject') as { text: string }).text;
		const view = viewOf(field);
		// Place the caret after the first char (USV 1), then type "X" there —
		// the caret advances to USV 2 as real typing would.
		field.setCaret(1);
		view.dispatch(view.state.tr.insertText('X', view.state.selection.head));
		const after = (doc.get('subject') as { text: string }).text;
		expect(after).not.toBe(before);
		expect(after[0]).toBe(before[0]);
		expect(after[1]).toBe('X');
		// onCaretMove fired with the post-edit USV caret (past the inserted char).
		expect(caret.at(-1)).toBe(2);
		field.destroy();
	});

	it('edits the main body via applyChange and preserves marks path', () => {
		const field = createField({ doc, addr: {}, container: mount() });
		const before = doc.main.body.text;
		const view = viewOf(field);
		view.dispatch(view.state.tr.insertText('Z', 2)); // PM 2 = USV 1 (after first char)
		const after = doc.main.body.text;
		expect(after).not.toBe(before);
		expect(after[0]).toBe(before[0]);
		expect(after[1]).toBe('Z');
		field.destroy();
	});

	it('caret survives an own-edit through the StepMap', () => {
		const field = createField({
			doc,
			addr: { field: 'subject' },
			container: mount()
		});
		const view = viewOf(field);
		// Put the caret at USV 5, then insert two chars before it.
		field.setCaret(5);
		const head0 = view.state.selection.head;
		expect(head0).toBe(6); // USV 5 ↔ PM 6
		view.dispatch(view.state.tr.insertText('AB', 1)); // insert before the caret
		// The selection mapped forward by 2 (StepMap) — caret continuity across own-edits.
		expect(view.state.selection.head).toBe(head0 + 2);
		field.destroy();
	});

	it('setCaret maps a USV position to the PM caret', () => {
		const field = createField({
			doc,
			addr: { field: 'subject' },
			container: mount()
		});
		const view = viewOf(field);
		field.setCaret(7);
		// Inline single paragraph: USV k → PM k+1.
		expect(view.state.selection.head).toBe(8);
		field.destroy();
	});
});

describe('field-level reconciliation', () => {
	it('applyExternal re-hydrates on a foreign edit; own edit does not', () => {
		const doc = quill().seedDocument();
		const field = createField({
			doc,
			addr: { field: 'subject' },
			container: mount()
		});
		const view = viewOf(field);

		// The field's OWN edit: applyExternal must NOT re-hydrate (no divergence).
		view.dispatch(view.state.tr.insertText('Q', 1));
		const afterOwn = view.state.doc;
		field.applyExternal();
		expect(view.state.doc).toBe(afterOwn); // same state object → no re-hydrate

		// A FOREIGN edit straight to the corpus (another source), then applyExternal.
		doc.applyChange(
			{ field: 'subject' },
			{ delta: { ops: [{ insert: 'EXT ' }, { retain: doc.get('subject').text.length }] } }
		);
		field.applyExternal();
		expect(view.state.doc.textContent.startsWith('EXT ')).toBe(true);
		expect((field.getCorpus() as { text: string }).text.startsWith('EXT ')).toBe(true);
		field.destroy();
	});
});

describe('createField over an ABSENT declared richtext field', () => {
	it('installs on the first edit (applyChange throws on absent), then applyChanges', () => {
		const doc = quill().seedDocument();
		// `tag_line` is `default:`-only, so it is absent from the seed.
		expect(doc.get('tag_line')).toBeUndefined();
		const field = createField({
			doc,
			addr: { field: 'tag_line' },
			container: mount(),
			inline: true
		});
		const view = viewOf(field);
		// First edit → the codec installs the field (creating it).
		view.dispatch(view.state.tr.insertText('Motto', 1));
		expect((doc.get('tag_line') as { text: string } | undefined)?.text).toBe('Motto');
		// Second edit → the field is now present, so it lowers to applyChange and lands.
		field.setCaret(5);
		view.dispatch(view.state.tr.insertText('!', view.state.selection.head));
		expect((doc.get('tag_line') as { text: string }).text).toBe('Motto!');
		field.destroy();
	});
});

describe('field install-fallback for an un-lowerable structural edit', () => {
	it('a hard break falls back to install without corrupting the store', () => {
		const doc = quill().seedDocument();
		const field = createField({ doc, addr: {}, container: mount() });
		const view = viewOf(field);
		// Insert a hard_break into the first paragraph (a `continues` line ops
		// cannot create → the field installs the whole corpus instead).
		field.setCaret(3);
		view.dispatch(view.state.tr.replaceSelectionWith(blockSchema.nodes.hard_break.create(), false));
		// The store now carries a within-block hard break (continues:true), and it
		// matches the optimistic PM up to normalization (the install fallback path).
		const body = doc.main.body;
		expect(body.lines.some((l) => l.continues)).toBe(true);
		expect(corpusEqual(body, normalize(pmToRichText(view.state.doc)))).toBe(true);
		field.destroy();
	});
});

describe('createField accessible name (a11y follow-up)', () => {
	it('sets aria-label on the editable element when a label is given', () => {
		const doc = quill().seedDocument();
		const field = createField({
			doc,
			addr: { field: 'subject' },
			container: mount(),
			inline: true,
			label: 'Subject'
		});
		expect(viewOf(field).dom.getAttribute('aria-label')).toBe('Subject');
		field.destroy();
	});

	it('leaves the editable element unnamed when no label is given', () => {
		const doc = quill().seedDocument();
		const field = createField({
			doc,
			addr: { field: 'subject' },
			container: mount(),
			inline: true
		});
		expect(viewOf(field).dom.hasAttribute('aria-label')).toBe(false);
		field.destroy();
	});
});
