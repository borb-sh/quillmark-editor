// The tips channel (issue #71): `$ext.editor.tips`, a list of authoring hints a
// quill or consumer seeds, which the editor only ever RENDERS and CLEARS.
// Editor-only chrome — never reaches the render backend, never gates, absent when
// the channel is empty (VISUAL_EDITOR §"Card operations").
//
// Nothing here touches a `Document`: the narrowing that feeds `CardModel.tips`, the
// payload the dismissal write stores, and the markdown render the card paints are
// all pure (tests/visual/tips.test.ts). The write itself is
// `VisualEditor.clearTips`, with the other mutators.
import { importMarkdown } from '../core/index.js';
import { decode, inlineSchema } from '../core/codec/index.js';
import { DOMSerializer } from 'prosemirror-model';

/**
 * Narrow a raw `$ext.editor.tips` value to the renderable channel. The channel is
 * CONSUMER-authored and opaque to the schema — nothing validates it on the way in —
 * so anything unusable drops here rather than reaching the card: a non-array, a
 * non-string element, a blank string. `[]` reads as "no tips" everywhere downstream.
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
 * namespaces, so storing this remainder is what clears the channel.
 * `removeExtNamespace` is the verb that looks right and is not: card rename stores
 * `$ext.editor.title` in the SAME namespace, so removing it destroys every renamed
 * card's title. That failure is silent and only reachable on a document carrying
 * both keys, so a test guards it.
 */
export function extWithoutTips(existing: Record<string, unknown>): Record<string, unknown> {
	const { tips: _dropped, ...rest } = existing;
	return rest;
}

/**
 * One tip's markdown as DOM, through the same path a content leaf takes:
 * `importMarkdown` → `Content` → the codec's `decode` → the PM node's own `toDOM`.
 * The tip is written in the body's mark vocabulary (`strong`/`emph`/`code`/`link`)
 * rather than by a second markdown renderer that would drift from it.
 *
 * The INLINE schema, not the block one: a tip is a one-line hint, and
 * `decodeInline` folds stray lines to a space and drops island slots, so any string
 * produces one paragraph — no tip can change the card's block structure as the
 * cursor advances.
 *
 * Raw HTML does not survive the round-trip, so this is not the injection seam an
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
