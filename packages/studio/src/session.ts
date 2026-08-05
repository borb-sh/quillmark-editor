// One quill, one document, one `LiveSession`: what the surfaces are mounted over,
// and what a repack replaces. The handle lifecycle lives here rather than in the
// component, because it is the one thing in studio that is not chrome.
import type { Diagnostic, Document, Engine, LiveSession, Quill } from '@quillmark/wasm';
import type { Quiver } from '@quillmark/quiver';

/** What a document brought with it across a quill change, and what it lost. */
export type Carry =
	/** Seeded from the schema: a first open, or a different quill picked. */
	| { how: 'seeded' }
	/** The previous document, landed under the schema in hand. `stranded` is the
	 *  `conform::*` diagnostics for the values that no longer project — the point of
	 *  the surface rather than an error to swallow. */
	| { how: 'carried'; stranded: Diagnostic[] }
	/** The previous document did not survive at all: the new quill's parse refused
	 *  it. Seeded instead, and the reason is said out loud. */
	| { how: 'reseeded'; because: string };

export interface Opened {
	/** Canonical ref, `name@x.y.z`. */
	ref: string;
	/** Borrowed from the quiver, never freed here (see `close`). */
	quill: Quill;
	doc: Document;
	session: LiveSession;
	carry: Carry;
}

/**
 * Open `ref` from `quiver`, over `carry`: the canonical markdown of the document the
 * surfaces were holding, or `undefined` to seed a fresh example.
 *
 * Carrying is what makes a repack an edit to the quill rather than a reset of the
 * work: a plate-only change lands the same document verbatim, an additive schema
 * change keeps it and defaults the new fields, and an incompatible one leaves what no
 * longer projects as authored with a diagnostic naming it.
 */
export async function openRef(
	engine: Engine,
	quiver: Quiver,
	ref: string,
	carry?: string
): Promise<Opened> {
	// BORROWED: `getQuill` caches one quill per canonical ref and hands it to every
	// caller for the quiver's lifetime, so studio holds it and frees nothing
	// (QUIVER §getQuill). Studio rewrites no quill bytes, so it needs no quill of its
	// own and pays for no second materialization.
	const quill = await quiver.getQuill(ref);

	let doc: Document | undefined;
	let how: Carry = { how: 'seeded' };
	if (carry !== undefined) {
		try {
			// The BOUND ingestion door: parse, then conform against the schema in hand,
			// landing every declared field at its canonical rest. The `conform::*`
			// diagnostics for the values that would not commit arrive on `warnings`.
			doc = quill.parse(carry);
			how = { how: 'carried', stranded: doc.warnings };
		} catch (err) {
			how = {
				how: 'reseeded',
				because: err instanceof Error ? err.message : String(err)
			};
		}
	}
	doc ??= quill.seedDocument();

	const session = await engine.open(quill, doc);
	return { ref, quill, doc, session, carry: how };
}

/** The document as text, for the next quill to land. */
export function carryOf(open: Opened): string {
	return open.doc.toMarkdown();
}

/**
 * Free what studio owns: the session and the document. The quill is the quiver's,
 * borrowed for as long as the quiver lives, and freeing it would leave the next
 * caller holding a freed handle; dropping the quiver drops the last reference to it.
 */
export function close(open: Opened): void {
	open.session.free();
	open.doc.free();
}
