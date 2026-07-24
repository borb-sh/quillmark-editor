// Shared codec test helpers. A REAL Document is the normalizer: the content
// normalizes on write, so round-trips are idempotent only up to normalization —
// `normalize` installs a Content and reads it back through the WASM content so
// tests assert POST-NORMALIZE equality (per the phase brief).
import { Quill, Document, importMarkdown } from '$lib/core';
import type { Content } from '$lib/core';
import { contentEqual } from '$lib/core/codec/reconcile.js';
import { loadFixtureTree } from '../helpers/fixtures.js';

let cachedQuill: Quill | undefined;
export function quill(): Quill {
	if (!cachedQuill) cachedQuill = Quill.fromTree(loadFixtureTree());
	return cachedQuill;
}
export function freshDoc(): Document {
	return quill().seedDocument();
}

/** Install `rt` into a fresh main body and read it back — the canonical (normalized) form. */
export function normalize(rt: Content): Content {
	const doc = freshDoc();
	doc.install({}, rt);
	return doc.main.body;
}

/** Content value-equality (key-order-insensitive), re-exported for assertions. */
export { contentEqual };

/** A content from markdown — a guaranteed-valid `Content` for test inputs. */
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
