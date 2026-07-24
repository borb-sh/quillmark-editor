// The tips channel (issue #71): `$ext.editor.tips`, an ephemeral list of authoring
// hints a quill or consumer seeds and the editor only ever RENDERS and CLEARS.
// Editor-only chrome — it never reaches the render backend, never gates, and is
// absent when the channel is empty (VISUAL_EDITOR §"Card operations").
//
// Two halves, both pure enough to unit-test (tests/visual/tips.test.ts): the
// channel narrowing the card derive feeds `CardModel.tips`, and the markdown
// render the tips card paints. Nothing here reads a `Document` — the write side
// (the merge-clear) lives in VisualEditor.svelte with the other mutators.
import { importMarkdown } from '../core/index.js';
import { decode, inlineSchema } from '../core/codec/index.js';
import { DOMSerializer } from 'prosemirror-model';

/**
 * Narrow a raw `$ext.editor.tips` value to the renderable channel. The channel is
 * CONSUMER-authored and opaque to the schema — nothing validates it on the way in —
 * so a non-array, a non-string element, or a blank string is dropped rather than
 * rendered as an empty card. An unusable channel narrows to `[]`, which reads as
 * "no tips" everywhere downstream.
 */
export function tipsChannel(raw: unknown): string[] {
	if (!Array.isArray(raw)) return [];
	return raw.filter((t): t is string => typeof t === 'string' && t.trim() !== '');
}

/**
 * The `editor` namespace with its `tips` key dropped — the payload the dismissal
 * merge-write stores.
 *
 * `storeExtNamespace` REPLACES the namespace it targets while preserving sibling
 * namespaces (verified against 0.97.0), so storing this remainder is what clears
 * the channel. `removeExtNamespace` is the verb that looks right and is not: card
 * rename stores `$ext.editor.title` in the SAME namespace, so removing it destroys
 * every renamed card's title. That failure is silent and only reachable on a
 * document carrying both — hence a test, not a comment alone.
 */
export function extWithoutTips(existing: Record<string, unknown>): Record<string, unknown> {
	const { tips: _dropped, ...rest } = existing;
	return rest;
}

/**
 * One tip's markdown as DOM, through the same path a content leaf takes:
 * `importMarkdown` → `Content` → the codec's `decode` → the PM node's own
 * `toDOM`. The tip is thus rendered in exactly the body's mark vocabulary
 * (`strong`/`emph`/`code`/`link`) rather than by a second markdown renderer that
 * would drift from it.
 *
 * The INLINE schema, not the block one: a tip is a one-line hint, and
 * `decodeInline` folds stray lines to a space and drops island slots, so any
 * string produces one paragraph — no tip can change the card's block structure
 * as the cursor advances.
 *
 * Raw HTML in the source never survives the round-trip (markdown → `Content` →
 * typed PM nodes → serializer), so this is not an injection seam the way an
 * `{@html}` of the same string would be. A throw degrades to the literal text —
 * chrome never breaks the editor.
 */
export function renderTip(markdown: string): Node {
	try {
		const node = decode(importMarkdown(markdown), inlineSchema);
		return DOMSerializer.fromSchema(inlineSchema).serializeFragment(node.content);
	} catch (e) {
		console.error('[quillmark/editor] tip render failed; showing literal text', e);
		return document.createTextNode(markdown);
	}
}
