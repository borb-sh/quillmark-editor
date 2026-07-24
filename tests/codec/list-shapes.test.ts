// List-shape round-trip coverage. The decode-idempotence suite carries one
// two-level bullet case; these are the shapes structural list commands produce —
// deeper nesting, mixed kinds, multi-block items, sibling splits. The list
// editing in issue #70 is additive only while these hold, so they are the
// invariant it builds on.
import { describe, it, expect } from 'vitest';
import { decode, pmToContent, blockSchema } from '$lib/core/codec';
import type { Content } from '$lib/core';
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
		// list_item is `block+` — Enter inside an item makes a second paragraph.
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
