// List-shape round-trip coverage. The decode-idempotence suite carries one
// two-level bullet case; these are the shapes structural list commands produce
// (deeper nesting, mixed kinds, multi-block items, sibling splits). The list
// editing is additive only while these hold, so they are the
// invariant it builds on.
import { describe, it, expect } from 'vitest';
import type { Attrs } from 'prosemirror-model';
import { decode, pmToContent, blockSchema } from '$lib/core/codec';
import type { Content } from '@quillmark/wasm';
import { md, normalize, contentEqual } from './_util.js';

function reContent(rt: Content): Content {
	return normalize(pmToContent(decode(rt, blockSchema)));
}

describe('list shapes round-trip', () => {
	const cases: Record<string, Content> = {
		// sinkListItem twice from a flat list.
		threeLevelBullet: md('- a\n    - b\n        - c'),
		// Toggling an inner list to ordered while the outer stays bullet.
		mixedOrderedInBullet: md('- outer\n    1. one\n    2. two'),
		mixedBulletInOrdered: md('1. outer\n    - inner'),
		// list_item is `block+`: Enter inside an item makes a second paragraph.
		multiParagraphItem: md('- first para\n\n    second para\n\n- next item'),
		// An item carrying BOTH a nested list and a trailing paragraph.
		nestedThenParagraph: md('- outer\n    - inner\n\n    tail para'),
		// Outdenting the middle item of a nested run splits the parent list.
		splitBySibling: md('- a\n    - b\n- c\n    - d'),
		// ordered_list carries `start`; outdent must not reset ordinals.
		ordinalReset: md('1. one\n2. two\n\nbreak\n\n3. three'),
		// Deepest realistic authoring shape.
		deepMixed: md('1. one\n    - bullet\n        1. deep\n2. two')
	};
	for (const [name, rt] of Object.entries(cases)) {
		it(name, () => {
			expect(contentEqual(reContent(rt), normalize(rt)), name).toBe(true);
		});
	}
});

// Two adjacent lists of the SAME type; the shape the cleanup invariant must not
// fuse (`lists.ts` §cleanup). Markdown has no spelling for it (a blank line between
// two bullet runs makes one loose list), so it cannot come from `md()` and every
// case above is blind to it. An ordinal DECREASE is the boundary: `decode` breaks
// its run on one, and the upstream normalizer stores it verbatim.
describe('adjacent same-type lists keep their boundary', () => {
	const item = (t: string) =>
		blockSchema.nodes.list_item.create(
			null,
			blockSchema.nodes.paragraph.create(null, blockSchema.text(t))
		);
	const pair = (listType: 'bullet_list' | 'ordered_list', attrs: Attrs | null) =>
		blockSchema.nodes.doc.create(null, [
			blockSchema.nodes[listType].create(attrs, [item('a'), item('b')]),
			blockSchema.nodes[listType].create(attrs, [item('c')])
		]);

	for (const [name, doc] of Object.entries({
		bullet: pair('bullet_list', null),
		ordered: pair('ordered_list', { start: 1 })
	})) {
		it(`${name}: the ordinal reset survives the normalizer and re-decodes to two`, () => {
			const stored = normalize(pmToContent(doc));
			expect(stored.lines.map((l) => (l.containers[0] as { ordinal: number }).ordinal)).toEqual([
				0, 1, 0
			]);
			expect(decode(stored, blockSchema).childCount).toBe(2);
		});
	}
});
