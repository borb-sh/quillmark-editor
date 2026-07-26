// Shared codec test helpers. A REAL Document is the normalizer: the content
// normalizes on write, so round-trips are idempotent only up to normalization —
// `normalize` installs a Content and reads it back through the WASM content so
// tests assert POST-NORMALIZE equality (per the phase brief).
import { expect } from 'vitest';
import type { Node as PMNode } from 'prosemirror-model';
import { Document, importMarkdown } from '$lib/core';
import type { Content } from '$lib/core';
import { contentEqual } from '$lib/core/codec/reconcile.js';
import { buildLineIndex, pmToContent, pmToUsv, usvLength, usvToPM } from '$lib/core/codec';
import { quill } from '../helpers/fixtures.js';

export { quill };
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

/**
 * The position map's defining property, asserted over EVERY USV offset of `doc`:
 * `pmToUsv ∘ usvToPM` is the identity, and every PM position it produces is in
 * range. The index is built fresh here, so a caller that mutated the doc is
 * asserting against the rebuilt map rather than a stale one.
 *
 * One helper, not three: the property is the same whether the doc came from a
 * decode (positions.test.ts) or from a structural edit (roundtrip.test.ts), and
 * three copies drifted into three slightly different assertion sets.
 */
export function assertPositionInverse(doc: PMNode, label = 'position map'): void {
	const index = buildLineIndex(doc);
	const total = usvLength(pmToContent(doc).text);
	for (let p = 0; p <= total; p++) {
		const pm = usvToPM(index, p);
		expect(pm, `${label}: usvToPM(${p}) below range`).toBeGreaterThanOrEqual(0);
		expect(pm, `${label}: usvToPM(${p}) above range`).toBeLessThanOrEqual(doc.content.size);
		expect(pmToUsv(index, pm), `${label}: roundtrip at USV ${p}`).toBe(p);
	}
}
