// @vitest-environment jsdom
// Criterion 8 (standalone leaf) + criterion 7 (field-level reconcile). A
// createField over a REAL usaf_memo `subject` (inline) and body edits via
// applyChange; the caret survives own-edits through the PM StepMap; an external
// content change re-hydrates and the leaf's own edit does not.
import { describe, it, expect, beforeEach } from 'vitest';
import { EditorView } from 'prosemirror-view';
import { createField, blockSchema, pmToContent } from '$lib/core/codec';
import type { FieldController } from '$lib/core/codec';
import type { Document } from '$lib/core';
import { quill, normalize, contentEqual } from './_util.js';

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
		const before = (doc.getStored('subject') as { text: string }).text;
		const view = viewOf(field);
		// Place the caret after the first char (USV 1), then type "X" there —
		// the caret advances to USV 2 as real typing would.
		field.setCaret(1);
		view.dispatch(view.state.tr.insertText('X', view.state.selection.head));
		const after = (doc.getStored('subject') as { text: string }).text;
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

		// A FOREIGN edit straight to the content (another source), then applyExternal.
		doc.applyChange(
			{ field: 'subject' },
			{
				delta: {
					ops: [
						{ insert: 'EXT ' },
						{ retain: (doc.getStored('subject') as { text: string }).text.length }
					]
				}
			}
		);
		field.applyExternal();
		expect(view.state.doc.textContent.startsWith('EXT ')).toBe(true);
		expect((field.getContent() as { text: string }).text.startsWith('EXT ')).toBe(true);
		field.destroy();
	});
});

describe('plaintext fields mount no markdown input rules', () => {
	// `inlineSchema` still declares the mark types, so before the fix a `**x**`
	// input rule would fire in a plaintext field, applying a strong mark and eating
	// the literal delimiters. The rule is triggered the way a keystroke does — via
	// `handleTextInput` with the char that completes the pattern.
	function fireClosingStar(view: EditorView): unknown {
		const pos = view.state.selection.head;
		// `handleTextInput(view, from, to, text, deflt)`; the input-rules plugin
		// never calls `deflt`, so a no-op tr satisfies the type.
		return view.someProp('handleTextInput', (f) => f(view, pos, pos, '*', () => view.state.tr));
	}

	it('a plaintext field does NOT fire the strong rule — delimiters and no-marks survive', () => {
		const doc = quill().seedDocument();
		const field = createField({
			doc,
			addr: { field: 'tag_line' }, // default-only → decodes empty, first edit installs
			container: mount(),
			plaintext: true
		});
		const view = viewOf(field);
		view.dispatch(view.state.tr.insertText('**x*', 1)); // literal; the closing `*` fires the rule
		expect(fireClosingStar(view)).toBeFalsy(); // no input-rules plugin → not intercepted
		view.dispatch(view.state.tr.insertText('*', view.state.selection.head));
		const rt = doc.getStored('tag_line') as { text: string; marks: unknown[] };
		expect(rt.text).toBe('**x**');
		expect(rt.marks).toHaveLength(0);
		field.destroy();
	});

	it('a non-plaintext inline field DOES fire it (proving the guard is what suppresses it)', () => {
		const doc = quill().seedDocument();
		const field = createField({
			doc,
			addr: { field: 'tag_line' },
			container: mount(),
			inline: true
		});
		const view = viewOf(field);
		view.dispatch(view.state.tr.insertText('**x*', 1));
		expect(fireClosingStar(view)).toBe(true); // the rule intercepts and transforms
		const rt = doc.getStored('tag_line') as { text: string; marks: { type: string }[] };
		expect(rt.text).toBe('x');
		expect(rt.marks.some((m) => m.type === 'strong')).toBe(true);
		field.destroy();
	});
});

describe('createField over an ABSENT declared richtext field', () => {
	it('installs on the first edit (applyChange throws on absent), then applyChanges', () => {
		const doc = quill().seedDocument();
		// `tag_line` is `default:`-only, so it is absent from the seed.
		expect(doc.getStored('tag_line')).toBeUndefined();
		const field = createField({
			doc,
			addr: { field: 'tag_line' },
			container: mount(),
			inline: true
		});
		const view = viewOf(field);
		// First edit → the codec installs the field (creating it).
		view.dispatch(view.state.tr.insertText('Motto', 1));
		expect((doc.getStored('tag_line') as { text: string } | undefined)?.text).toBe('Motto');
		// Second edit → the field is now present, so it lowers to applyChange and lands.
		field.setCaret(5);
		view.dispatch(view.state.tr.insertText('!', view.state.selection.head));
		expect((doc.getStored('tag_line') as { text: string }).text).toBe('Motto!');
		field.destroy();
	});
});

describe('field install-fallback for an un-lowerable structural edit', () => {
	it('a hard break falls back to install without corrupting the store', () => {
		const doc = quill().seedDocument();
		const field = createField({ doc, addr: {}, container: mount() });
		const view = viewOf(field);
		// Insert a hard_break into the first paragraph (a `continues` line ops
		// cannot create → the field installs the whole content instead).
		field.setCaret(3);
		view.dispatch(view.state.tr.replaceSelectionWith(blockSchema.nodes.hard_break.create(), false));
		// The store now carries a within-block hard break (continues:true), and it
		// matches the optimistic PM up to normalization (the install fallback path).
		const body = doc.main.body;
		expect(body.lines.some((l) => l.continues)).toBe(true);
		expect(contentEqual(body, normalize(pmToContent(view.state.doc)))).toBe(true);
		field.destroy();
	});
});

describe('anchor insertion', () => {
	/** The `anchor` identity marks of the stored body content. */
	function bodyAnchors(doc: Document): { id: string; start: number; end: number }[] {
		return doc.main.body.marks.filter((m) => m.type === 'anchor') as {
			id: string;
			start: number;
			end: number;
		}[];
	}

	it('inserts a caller-supplied identity anchor that persists in the content', () => {
		const doc = quill().seedDocument();
		const field = createField({ doc, addr: {}, container: mount() });
		field.insertAnchor('a1', 3);
		const anchors = bodyAnchors(doc);
		expect(anchors).toHaveLength(1);
		expect(anchors[0]).toMatchObject({ id: 'a1', start: 3, end: 3 }); // zero-width
		field.destroy();
	});

	it('a duplicate id is a no-op; removeAnchor drops the anchor', () => {
		const doc = quill().seedDocument();
		const field = createField({ doc, addr: {}, container: mount() });
		field.insertAnchor('a1', 3);
		field.insertAnchor('a1', 5); // same id → ignored (unique + invariant, 0.97 policy)
		expect(bodyAnchors(doc)).toHaveLength(1);
		field.removeAnchor('a1');
		expect(bodyAnchors(doc)).toHaveLength(0);
		field.destroy();
	});

	it('the anchor rebases through a later text edit — it survives like a mark', () => {
		const doc = quill().seedDocument();
		const field = createField({ doc, addr: {}, container: mount() });
		field.insertAnchor('a1', 5);
		const view = viewOf(field);
		// Insert two chars at the very start (PM 1 = USV 0): the anchor shifts by 2.
		view.dispatch(view.state.tr.insertText('XY', 1));
		expect(bodyAnchors(doc)).toMatchObject([{ id: 'a1', start: 7 }]);
		field.destroy();
	});

	it('anchorsInRange reports coverage for the popover active state', () => {
		const doc = quill().seedDocument();
		const field = createField({ doc, addr: {}, container: mount() });
		field.insertAnchor('a1', 4);
		expect(field.anchorsInRange(0, 10)).toEqual(['a1']);
		expect(field.anchorsInRange(0, 3)).toEqual([]);
		field.destroy();
	});
});

describe('empty-leaf ghost placeholder', () => {
	it('stamps the empty leaf with the ghost text, and drops it once typed', () => {
		const doc = quill().seedDocument();
		const container = mount();
		// `tag_line` is `default:`-only → decodes an empty leaf, the placeholder case.
		const field = createField({
			doc,
			addr: { field: 'tag_line' },
			container,
			inline: true,
			placeholder: 'DEPARTMENT MOTTO'
		});
		const ghost = container.querySelector('.qm-prose-placeholder');
		expect(ghost).not.toBeNull();
		expect(ghost?.getAttribute('data-placeholder')).toBe('DEPARTMENT MOTTO');

		// Any content dismisses the ghost (the emptiness test fails).
		const view = viewOf(field);
		view.dispatch(view.state.tr.insertText('X', 1));
		expect(container.querySelector('.qm-prose-placeholder')).toBeNull();

		// Clearing back to empty restores it.
		view.dispatch(view.state.tr.delete(1, view.state.doc.content.size - 1));
		expect(container.querySelector('.qm-prose-placeholder')).not.toBeNull();
		field.destroy();
	});

	it('adds no ghost when no placeholder is given (never enters the content)', () => {
		const doc = quill().seedDocument();
		const container = mount();
		const field = createField({ doc, addr: { field: 'tag_line' }, container, inline: true });
		expect(container.querySelector('.qm-prose-placeholder')).toBeNull();
		// The ghost is decoration-only: the stored content stays absent (unset).
		expect(doc.getStored('tag_line')).toBeUndefined();
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
