/**
 * Minimal structural types matching @quillmark/wasm >=0.71.0.
 *
 * Shape:
 *   class Quillmark { quill(tree: Map<string, Uint8Array>): Quill }
 *   class Quill     { render(doc, opts?): RenderResult; open(doc): RenderSession }
 *
 * The first arg to `render`/`open` is a `Document` instance (from
 * `Document.fromMarkdown(...)`). Quiver keeps the arg typed as `unknown` so
 * consumers (and test doubles) satisfy the contract structurally without
 * importing from @quillmark/wasm.
 *
 * These types are re-exported from `index.ts` so consumers can type their
 * own engine wrappers / test doubles against them. Quiver itself never
 * imports from @quillmark/wasm directly.
 *
 * Call-site note: Quiver never invokes `render` or `open` itself; consumers do
 * after `getQuill()`. The loose `unknown` parameter typing is intentional.
 */

export interface QuillmarkLike {
  quill(tree: Map<string, Uint8Array>): QuillLike;
}

export interface QuillLike {
  render(doc: unknown, opts?: unknown): unknown;
  open?: (doc: unknown) => unknown;
}
