// The PM schema — the codec OWNS it; decode/encode target it. Nodes mirror the
// content block kinds (para/heading/code/rule/island) and its container nesting
// (list_item/quote → lists/blockquote); marks mirror the content formatting set.
// Each of the three open sets gets an inert carrier so an unrecognized value
// survives a round-trip: the `unknown` mark, the paragraph's `unknown` attribute,
// and the `unknown_container` node. `blockSchema` is the full field; `inlineSchema`
// is the constrained single-textblock form for `richtext(inline)` / `plaintext`
// (one paragraph, no block split, no containers, no islands) — same decode/lower/
// position machinery, narrower shape. Anchors are NOT marks here (decorations).
import { Schema } from 'prosemirror-model';
import type { MarkSpec, NodeSpec } from 'prosemirror-model';
import { islandBlockSpec, islandInlineSpec } from './islands.js';

// ── Marks (shared by both schemas; plaintext mounts none) ───────────────────
const marks: Record<string, MarkSpec> = {
	// Order matters: it fixes mark-set sort order and parse precedence. `link`
	// last so it wraps outermost; `unknown` after it, non-exclusive so several
	// distinct unknown marks coexist on one range.
	strong: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }], toDOM: () => ['strong', 0] },
	em: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
	underline: { parseDOM: [{ tag: 'u' }], toDOM: () => ['u', 0] },
	strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }], toDOM: () => ['s', 0] },
	code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
	link: {
		attrs: { href: { default: '' } },
		inclusive: false,
		parseDOM: [
			{ tag: 'a[href]', getAttrs: (el) => ({ href: (el as HTMLElement).getAttribute('href') }) }
		],
		toDOM: (mark) => ['a', { href: mark.attrs.href as string }, 0]
	},
	// The open-set escape hatch: an inert mark that renders as a bare span and
	// re-emits its stored `type`/`attrs` on encode. `excludes: ''` lets marks of
	// this type with different attrs share a range (they are distinct families).
	unknown: {
		attrs: { type: { default: '' }, attrs: { default: null } },
		excludes: '',
		toDOM: () => ['span', { 'data-unknown': '' }, 0]
	}
};

// ── Block nodes ─────────────────────────────────────────────────────────────
const blockNodes: Record<string, NodeSpec> = {
	doc: { content: 'block+' },
	// `unknown` carries a line `kind` this build does not know (`{ kind, attrs }`,
	// else null). A paragraph IS how such a line renders, so the carrier is an
	// attribute rather than a node type: every paragraph command already reaches it,
	// and retyping it to a heading or a list drops the attribute — an explicit
	// conversion, which is the one place the unknown kind SHOULD be lost.
	paragraph: {
		content: 'inline*',
		group: 'block',
		attrs: { unknown: { default: null } },
		parseDOM: [{ tag: 'p' }],
		toDOM: (node) => {
			const u = node.attrs.unknown as { kind: string } | null;
			return u ? ['p', { 'data-qm-unknown-line': u.kind }, 0] : ['p', 0];
		}
	},
	heading: {
		content: 'inline*',
		group: 'block',
		defining: true,
		attrs: { level: { default: 1 } },
		parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
		toDOM: (node) => [`h${node.attrs.level as number}`, 0]
	},
	code_block: {
		content: 'text*',
		group: 'block',
		code: true,
		defining: true,
		marks: '',
		whitespace: 'pre',
		attrs: { lang: { default: null } },
		parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
		toDOM: (node) => [
			'pre',
			node.attrs.lang ? { 'data-lang': node.attrs.lang as string } : {},
			['code', 0]
		]
	},
	blockquote: {
		content: 'block+',
		group: 'block',
		defining: true,
		parseDOM: [{ tag: 'blockquote' }],
		toDOM: () => ['blockquote', 0]
	},
	horizontal_rule: { group: 'block', parseDOM: [{ tag: 'hr' }], toDOM: () => ['hr'] },
	ordered_list: {
		content: 'list_item+',
		group: 'block',
		attrs: { start: { default: 1 } },
		parseDOM: [{ tag: 'ol' }],
		toDOM: (node) =>
			node.attrs.start === 1 ? ['ol', 0] : ['ol', { start: node.attrs.start as number }, 0]
	},
	bullet_list: {
		content: 'list_item+',
		group: 'block',
		parseDOM: [{ tag: 'ul' }],
		toDOM: () => ['ul', 0]
	},
	list_item: {
		content: 'block+',
		defining: true,
		parseDOM: [{ tag: 'li' }],
		toDOM: () => ['li', 0]
	},
	// A container this build does not know: a transparent wrapper that renders as a
	// bare block (its children flow at the enclosing level, which is how upstream
	// renders it) and re-emits its `container`/`attrs` on encode. `defining` so a
	// lift out of it is deliberate rather than a backspace away.
	unknown_container: {
		content: 'block+',
		group: 'block',
		defining: true,
		attrs: { container: { default: '' }, attrs: { default: null } },
		toDOM: (node) => ['div', { 'data-qm-unknown-container': node.attrs.container as string }, 0]
	},
	island_block: islandBlockSpec
};

// ── Inline nodes ────────────────────────────────────────────────────────────
const inlineLeafNodes: Record<string, NodeSpec> = {
	text: { group: 'inline' },
	hard_break: {
		inline: true,
		group: 'inline',
		selectable: false,
		parseDOM: [{ tag: 'br' }],
		toDOM: () => ['br']
	},
	island_inline: islandInlineSpec
};

/** The full field schema — every block kind, container, mark, and island. */
export const blockSchema = new Schema({
	nodes: { ...blockNodes, ...inlineLeafNodes },
	marks
});

/**
 * The constrained inline schema — one paragraph, no block splitting, no
 * containers, no islands. `doc: "paragraph"` (exactly one child) is what makes an
 * Enter a no-op at the model level: there is no second block for a split to land.
 * Marks are present; `plaintext` fields strip them at decode and mount no
 * mark input (a schema-level distinction the field draws, per CODEC §Inline mode).
 */
export const inlineSchema = new Schema({
	nodes: {
		doc: { content: 'paragraph' },
		paragraph: { content: 'inline*', toDOM: () => ['p', 0] },
		text: { group: 'inline' }
	},
	marks
});

/** True for the constrained inline schema (no block containers) — decode branches on it. */
export function isInlineSchema(schema: Schema): boolean {
	return !schema.nodes.blockquote;
}
