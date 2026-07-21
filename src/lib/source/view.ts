// The debug source view — `createSourceView` (Phase 5, ARCHITECTURE §Public API,
// VISUAL_EDITOR §Source view). A read-only CodeMirror 6 surface over
// `Document.toMarkdown()`: the whole-document serialize the layer federation
// deletes, kept for debugging only. NOT an editable dual mode — the federated
// leaves are the edit surface; this is a mirror. `refresh()` re-serializes after
// the consumer's edit lands, so the markdown tracks the live document.
//
// Round-trip: `toMarkdown()` emits canonical Quillmark markdown that re-parses to
// an equal `Document` (runtime.d.ts) — this view shows exactly that canonical form,
// never a lossy pretty-print. It reaches `/core` (the `Document` handle) and
// CodeMirror; never `/preview` or `/visual` (this is the one editor-side surface
// that pulls CodeMirror, so the `/source` subpath keeps it off `/preview`).
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import type { Document } from '../core/index.js';

/** Options for {@link createSourceView}. */
export interface SourceViewOptions {
	/** The element the read-only editor mounts into. */
	container: HTMLElement;
	/** The live document — serialized on build and on every {@link SourceViewController.refresh}. */
	doc: Document;
}

/** The debug source-view handle. */
export interface SourceViewController {
	/** Re-serialize `doc.toMarkdown()` into the view — call after an edit lands. */
	refresh(): void;
	/** The markdown currently shown (the last successful serialize). */
	markdown(): string;
	destroy(): void;
}

const CONTAINER_CLASS = 'qm-source';

/** Serialize the document, or surface the error text rather than throwing into a paint. */
function serialize(doc: Document): string {
	try {
		return doc.toMarkdown();
	} catch (e) {
		// `toMarkdown` is round-trip safe for any valid document, but a boundary
		// error must not crash the debug view — show it in place instead.
		console.error('[quillmark/editor] toMarkdown failed', e);
		return `# source view unavailable\n\n${e instanceof Error ? e.message : String(e)}`;
	}
}

export function createSourceView(opts: SourceViewOptions): SourceViewController {
	const { container, doc } = opts;
	container.classList.add(CONTAINER_CLASS);

	let current = serialize(doc);

	// Read-only both ways: `EditorState.readOnly` blocks the edit commands and
	// `EditorView.editable.of(false)` drops the `contenteditable` (no caret, no
	// focus grab) — a mirror, not an input. Programmatic `dispatch` still lands,
	// so `refresh` can replace the whole doc.
	const view = new EditorView({
		parent: container,
		state: EditorState.create({
			doc: current,
			extensions: [
				lineNumbers(),
				highlightActiveLine(),
				markdown(),
				syntaxHighlighting(defaultHighlightStyle),
				EditorView.lineWrapping,
				EditorState.readOnly.of(true),
				EditorView.editable.of(false),
				EditorView.theme({ '&': { height: '100%' } })
			]
		})
	});

	return {
		refresh(): void {
			const next = serialize(doc);
			if (next === current) return; // no re-render when the serialize is unchanged
			current = next;
			view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next } });
		},
		markdown(): string {
			return current;
		},
		destroy(): void {
			view.destroy();
			container.classList.remove(CONTAINER_CLASS);
		}
	};
}
