/**
 * Minimal structural types matching @quillmark/wasm >=0.86.0.
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
  /**
   * Auto-generated annotated Markdown blueprint for LLM/authoring consumers.
   * Carries `<must-fill>` sentinels for Must Fill fields, so it is *not*
   * directly renderable — render `example` instead.
   */
  blueprint: string;
  /**
   * The illustrative "filled-out" reference document — always renderable.
   * Each field resolves to its `example:`, else its `default:`, else a
   * type-empty zero value, with no `<must-fill>` sentinels. Introduced in
   * @quillmark/wasm >=0.86.0. Used by Quiver's preview/testing helpers to
   * render a sample artifact for each quill.
   */
  example: string;
}
