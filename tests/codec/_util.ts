// Shared codec test helpers. A REAL Document is the normalizer: the corpus
// normalizes on write, so round-trips are idempotent only up to normalization —
// `normalize` installs a RichText and reads it back through the WASM corpus so
// tests assert POST-NORMALIZE equality (per the phase brief).
import { Quill, Document, importMarkdown } from '$lib/core';
import type { RichText } from '$lib/core';
import { corpusEqual } from '$lib/core/codec/reconcile.js';
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
export function normalize(rt: RichText): RichText {
	const doc = freshDoc();
	doc.install({}, rt);
	return doc.main.body;
}

/** Corpus value-equality (key-order-insensitive), re-exported for assertions. */
export { corpusEqual };

/** A corpus from markdown — a guaranteed-valid `RichText` for test inputs. */
export function md(markdown: string): RichText {
	return importMarkdown(markdown);
}

/** The reference quill's seeded `subject` (inline richtext) corpus. */
export function subjectCorpus(): RichText {
	return freshDoc().get('subject') as RichText;
}
/** The reference quill's seeded main body corpus. */
export function bodyCorpus(): RichText {
	return freshDoc().main.body;
}
