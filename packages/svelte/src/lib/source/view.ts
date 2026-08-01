// The debug source view: `createSourceView` (ARCHITECTURE §Public API,
// VISUAL_EDITOR §Source view). A read-only text mirror of `Document.toMarkdown()`:
// the whole-document serialize the layer federation deletes, kept for debugging
// only. NOT an editable dual mode; the federated leaves are the edit surface;
// this is a mirror. `refresh()` re-serializes after the consumer's edit lands, so
// the markdown tracks the live document.
//
// Round-trip: `toMarkdown()` emits canonical Quillmark markdown that re-parses to
// an equal `Document` (runtime.d.ts); this view shows exactly that canonical form,
// never a lossy pretty-print. It reaches `/core` (the `Document` handle) and
// nothing else; never `/preview` or `/visual`.
//
// A `<pre>` carrying text, not an editor component: a mirror needs selectable
// monospace text and nothing more, and the shipped package buys none of an editor
// library's weight for a surface with no caret (ARCHITECTURE §Packaging). Syntax
// highlighting is the one thing given up, and it is worth less here than a
// dependency-free `/source`: the markdown is short, structural, and read for its
// front-matter and line breaks rather than its token colours. Text lands through
// `textContent`, so the document is never parsed as markup.
import type { Document, EditorErrorHandler } from '../core/index.js';
import { reportError, errorMessage } from '../core/index.js';

/** Options for {@link createSourceView}. */
export interface SourceViewOptions {
	/** The element the read-only mirror mounts into. */
	container: HTMLElement;
	/** The live document; serialized on build and on every {@link SourceViewController.refresh}. */
	doc: Document;
	/** A serialize that threw ({@link EditorErrorHandler}); the view shows the
	 *  error text in place either way. */
	onError?: EditorErrorHandler;
}

/** The debug source-view handle. */
export interface SourceViewController {
	/** Re-serialize `doc.toMarkdown()` into the view; call after an edit lands. */
	refresh(): void;
	destroy(): void;
}

const CONTAINER_CLASS = 'qm-source';
/** The text element's class; `SourceView.svelte` styles it. */
const TEXT_CLASS = 'qm-source-text';

/** Serialize the document, or surface the error text rather than throwing into a paint. */
function serialize(doc: Document, onError: EditorErrorHandler | undefined): string {
	try {
		return doc.toMarkdown();
	} catch (e) {
		// `toMarkdown` is round-trip safe for any valid document, but a boundary
		// error must not crash the debug view; show it in place instead.
		reportError(onError, {
			code: 'serialize-failed',
			severity: 'error',
			message: `doc.toMarkdown threw; the mirror shows the error in place: ${errorMessage(e)}`,
			cause: e
		});
		return `# source view unavailable\n\n${errorMessage(e)}`;
	}
}

export function createSourceView(opts: SourceViewOptions): SourceViewController {
	const { container, doc } = opts;
	container.classList.add(CONTAINER_CLASS);

	let current = serialize(doc, opts.onError);
	const text = container.ownerDocument.createElement('pre');
	text.className = TEXT_CLASS;
	text.textContent = current;
	container.append(text);

	return {
		refresh(): void {
			const next = serialize(doc, opts.onError);
			if (next === current) return; // no re-render when the serialize is unchanged
			current = next;
			// The container is the scroller, so a shorter document clamps its offset;
			// hold it across the swap and the drawer stays where the reader left it,
			// which matters because `refresh` runs on every recompile tick.
			const { scrollTop } = container;
			text.textContent = next;
			container.scrollTop = scrollTop;
		},
		destroy(): void {
			text.remove();
			container.classList.remove(CONTAINER_CLASS);
		}
	};
}
