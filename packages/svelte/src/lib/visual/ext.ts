// The `$ext.editor` namespace: editor-only chrome state that never reaches the
// render backend (canon: `CARDS.md`; VISUAL_EDITOR §"Card operations"). Card rename
// keeps `title` here and the tips channel keeps `tips`; both, and every key added
// later, write through the one verb below.
//
// Kept out of VisualEditor.svelte so the write the editor performs is the write a
// test can call: the invariant this module exists to hold fails SILENTLY, and a
// test asserting a hand-copy of it would not notice.
import type { Document, CardAddr } from '@quillmark/wasm';

/**
 * Merge `patch` into `$ext.editor` on the card `addr` targets (absent `card` =
 * main). A key whose patch value is `undefined` is DROPPED; every other key in the
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
 */
export function patchEditorExt(
	doc: Document,
	addr: CardAddr,
	patch: Record<string, unknown>
): void {
	// `getExtNamespace` reads just this namespace rather than serializing the whole
	// card to fish out one `$ext` slot.
	const next = { ...((doc.getExtNamespace(addr, 'editor') ?? {}) as Record<string, unknown>) };
	for (const [key, value] of Object.entries(patch)) {
		if (value === undefined) delete next[key];
		else next[key] = value;
	}
	doc.storeExtNamespace(addr, 'editor', next);
}
