// The `$ext.editor` namespace: editor-only chrome state that never reaches the
// render backend (canon: `CARDS.md`; VISUAL_EDITOR §"Card operations"). Card rename
// keeps `title` here and the tips channel keeps `tips`; both, and every key added
// later, write through the one verb below.
//
// Kept out of VisualEditor.svelte so the write the editor performs is the write a
// test can call: the invariant this module exists to hold fails silently, and a
// test asserting a hand-copy of it would not notice.
import type { Document, CardAddr } from '@quillmark/wasm';

/**
 * Merge `patch` into `$ext.editor` on the card `addr` targets (absent `card` =
 * main). A key whose patch value is `undefined` is dropped; every other key in the
 * namespace is carried through untouched.
 *
 * **The namespace is the write unit.** `storeExtNamespace` replaces the namespace
 * it targets (preserving sibling namespaces, but not sibling keys) so a writer
 * that stores only its own key silently destroys the others, and
 * `removeExtNamespace` destroys all of them. `tips` and `title` are siblings here,
 * so a namespace-replacing dismissal would wipe every renamed card's title. Routing
 * every writer through this function is what makes that unexpressible rather than
 * merely documented: key N+1 inherits the merge instead of re-deriving it.
 *
 * The drop is an explicit `delete`, not a stored `undefined`: whether a JS
 * `undefined` survives the wasm-bindgen crossing is not a property worth depending
 * on.
 *
 * **A namespace emptied of keys is removed, not stored empty**, which is
 * `removeExtNamespace`'s one correct use: it takes the whole namespace, and here
 * there is nothing left in it to lose. `$ext` goes with it when `editor` was the
 * last namespace, and that is what keeps the document emittable — a stored `{}`
 * survives the model but not the round-trip, where an empty mapping omits its own
 * key and leaves the parent a bare `$ext:`, which reads back as null and fails the
 * next parse. A patch that drops keys the namespace does not have writes nothing at
 * all, so a dismissal on a document carrying no tips is not a mutation.
 */
export function patchEditorExt(
	doc: Document,
	addr: CardAddr,
	patch: Record<string, unknown>
): void {
	// `getExtNamespace` reads just this namespace rather than serializing the whole
	// card to fish out one `$ext` slot.
	const current = doc.getExtNamespace(addr, 'editor') as Record<string, unknown> | undefined;
	const next = { ...(current ?? {}) };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) delete next[key];
		else next[key] = value;
	}
	if (Object.keys(next).length > 0) doc.storeExtNamespace(addr, 'editor', next);
	else if (current) doc.removeExtNamespace(addr, 'editor');
}
