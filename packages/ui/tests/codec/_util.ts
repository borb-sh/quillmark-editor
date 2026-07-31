// Shared codec test helpers. A REAL Document is the normalizer: the content
// normalizes on write, so round-trips are idempotent only up to normalization:
// `normalize` installs a Content and reads it back through the WASM content so
// tests assert POST-NORMALIZE equality.
import { expect } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
import { baseKeymap } from 'prosemirror-commands';
import { Document, importMarkdown } from '$lib/core';
import type { Content } from '$lib/core';
import { contentEqual } from '$lib/core/codec/reconcile.js';
import {
	blockSchema,
	buildLineIndex,
	decode,
	pmToContent,
	pmToUsv,
	usvLength,
	usvToPM
} from '$lib/core/codec';
import { quill } from '../helpers/fixtures.js';

export { quill };
export function freshDoc(): Document {
	return quill().seedDocument();
}

/** Install `rt` into a fresh main body and read it back; the canonical (normalized) form. */
export function normalize(rt: Content): Content {
	const doc = freshDoc();
	doc.install({}, rt);
	return doc.main.body;
}

/** Content value-equality (key-order-insensitive), re-exported for assertions. */
export { contentEqual };

/** A content from markdown; a guaranteed-valid `Content` for test inputs. */
export function md(markdown: string): Content {
	return importMarkdown(markdown);
}

/** The reference quill's seeded `subject` (inline richtext) content. */
export function subjectContent(): Content {
	return freshDoc().getStored('subject') as Content;
}
/** The reference quill's seeded main body content. */
export function bodyContent(): Content {
	return freshDoc().main.body;
}

/**
 * The position map's defining property, asserted over EVERY USV offset of `doc`:
 * `pmToUsv ∘ usvToPM` is the identity, and every PM position it produces is in
 * range. The index is built fresh here, so a caller that mutated the doc is
 * asserting against the rebuilt map rather than a stale one.
 *
 * One helper for every caller: the property does not change with the doc's origin,
 * so a decode (positions.test.ts) and a structural edit (roundtrip.test.ts) assert
 * it identically. A per-suite copy is a per-suite assertion set.
 */
/** The doc's textblocks in document order, with their content-start positions. */
export function textblocks(doc: PMNode): { node: PMNode; start: number }[] {
	const out: { node: PMNode; start: number }[] = [];
	doc.descendants((node, pos) => {
		if (node.isTextblock) out.push({ node, start: pos + 1 });
		return !node.isTextblock;
	});
	return out;
}

/** A state with the caret at the START of the `index`-th textblock; where every
 * structural key branches, and the only way to address an EMPTY item (it carries
 * no text to anchor on). */
export function atBlock(doc: PMNode, index: number): EditorState {
	const block = textblocks(doc)[index];
	if (!block) throw new Error(`no textblock at index ${index}`);
	return EditorState.create({ doc, selection: TextSelection.create(doc, block.start) });
}

/** A state over `markdown` with the caret at the start of the `index`-th textblock. */
export function startOf(markdown: string, index: number): EditorState {
	return atBlock(decode(md(markdown), blockSchema), index);
}

/** Run `cmd`; the new state, or null when the command declined the key. */
export function run(state: EditorState, cmd: Command): EditorState | null {
	let out: EditorState | null = null;
	const handled = cmd(state, (tr) => {
		out = state.apply(tr);
	});
	return handled ? out : null;
}

/** `doc(bullet_list(list_item(paragraph("a"))))`: PM's own compact rendering. */
export const shape = (state: EditorState): string => state.doc.toString();

/** The mutation survives the boundary: encode → normalize → decode is a fixpoint. A
 * command that produces a shape `Content` cannot hold would pass a doc-shape
 * assertion and still lose the user's edit on commit. */
export function representable(state: EditorState): boolean {
	const stored = normalize(pmToContent(state.doc));
	return decode(stored, blockSchema).toString() === state.doc.toString();
}

/**
 * A press-and-check driver over one bound keymap: the leaf's own bindings, falling
 * through to `baseKeymap` exactly as the plugin stack does (`proseLeafPlugins`
 * mounts `editorKeymap` over `baseKeymap`).
 *
 * One driver for every caller: what a press MEANS does not change with which link
 * of the chain is under test, so the list keys and the code-block keys drive
 * identically and differ only in the keymap passed in.
 */
export function keyDriver(keys: Record<string, Command>) {
	/** Run the leaf's binding for `key`, falling through to the base keymap. */
	function press(state: EditorState, key: string): EditorState {
		const bound = keys[key] ? run(state, keys[key]) : null;
		if (bound) return bound;
		const base = baseKeymap[key] ? run(state, baseKeymap[key]) : null;
		return base ?? state;
	}

	/** Assert a press's result AND its representability in one place. */
	function expectPress(state: EditorState, key: string, expected: string): EditorState {
		const next = press(state, key);
		expect(shape(next)).toBe(expected);
		expect(representable(next), `not representable: ${shape(next)}`).toBe(true);
		return next;
	}

	return { press, expectPress };
}

export function assertPositionInverse(doc: PMNode, label = 'position map'): void {
	const index = buildLineIndex(doc);
	const total = usvLength(pmToContent(doc).text);
	for (let p = 0; p <= total; p++) {
		const pm = usvToPM(index, p);
		expect(pm, `${label}: usvToPM(${p}) below range`).toBeGreaterThanOrEqual(0);
		expect(pm, `${label}: usvToPM(${p}) above range`).toBeLessThanOrEqual(doc.content.size);
		expect(pmToUsv(index, pm), `${label}: roundtrip at USV ${p}`).toBe(p);
	}
}
