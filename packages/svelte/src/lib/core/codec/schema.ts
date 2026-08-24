// The PM schema: the codec owns it; decode/encode target it. Nodes mirror the
// content block kinds (para/heading/code/rule/island) and its container nesting
// (list_item/quote → lists/blockquote); marks mirror the content formatting set.
// Each of the three open sets gets an inert carrier so an unrecognized value
// survives a round-trip: the `unknown` mark, the paragraph's `unknown` attribute,
// and the `unknown_container` node. `blockSchema` is the full field; `inlineSchema`
// is the constrained single-textblock form for `richtext(inline)` (one paragraph,
// no block split, no containers, no islands) and `plaintextSchema` is that one
// without marks: same decode/lower/position machinery, narrower shape. Anchors are
// not marks here (decorations).
//
// `toDOM` and `parseDOM` are one tier, not two halves of a rendering: a copy and a
// paste inside one body run the whole document through them (CODEC §"Markdown at the
// edges"), so every attribute written here is read back here. A carrier's payload
// crosses as JSON under a `data-qm-*` name, which is the form the content's open sets
// already have. Foreign HTML spells none of those names, so what a paste takes off the
// web is unchanged; the one rule that widens that door on purpose is the fence's.
import { Schema } from 'prosemirror-model';
import type { MarkSpec, NodeSpec } from 'prosemirror-model';
import { islandBlockSpec, islandInlineSpec } from './islands.js';

// ── The href gate ───────────────────────────────────────────────────────────
// An `href` is an attribute value and not markup, so the markdown → typed node → DOM
// path that keeps a document's text from becoming tags never reaches it: what the
// mark carries is what `toDOM` emits, and `renderContent` paints marks outside a
// `contenteditable` (the tips card), where a click is a plain one.
//
// An allowlist, because the set a document can spell is open: naming the dangerous
// schemes instead loses to the first one this has not heard of. It holds what the
// surface has a caller for; a scheme reaching it later is a line.
const RENDERED_SCHEMES = new Set(['http', 'https', 'mailto', 'tel', 'ftp']);

/** A scheme and its colon: a letter, then letters, digits, `+`, `-` or `.` (RFC 3986). */
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

/** Dropped before the scheme is read, so a tab spliced into `javascript:` is tested
 *  as what it navigates to. Wider than the URL parser's own tab/newline rule: no
 *  scheme carries a control character, and the strip decides without rewriting. */
const IGNORED = /[\u0000-\u0020]/g;

/**
 * Whether a link carrying `href` renders as one. A value with no scheme is relative
 * to the embedding page and has none to refuse.
 *
 * A refused href is unchanged: it stays on the mark and round-trips, so a document
 * survives an editor that declines to make it clickable.
 */
export function rendersHref(href: string): boolean {
	const scheme = SCHEME.exec(href.replace(IGNORED, ''));
	return scheme === null || RENDERED_SCHEMES.has(scheme[1]!.toLowerCase());
}

// ── The open sets' DOM payload ──────────────────────────────────────────────
// A carrier's tag is a `data-qm-unknown-*` name and its `attrs` are JSON beside it,
// under one name across all three: an element carries at most one carrier, a
// paragraph's tag and the mark's sitting on different elements.

/** The `attrs` half of a carrier, absent where there is none. */
function packAttrs(attrs: unknown): Record<string, string> {
	return attrs == null ? {} : { 'data-qm-unknown-attrs': JSON.stringify(attrs) };
}

/** The `attrs` half back off an element. `null` for anything that is not the JSON
 *  this schema wrote: a hand-built document reaches the same parse a paste does, and a
 *  carrier's payload is the keyed object upstream spells, never a bare scalar. */
function unpackAttrs(el: HTMLElement): unknown {
	const raw = el.getAttribute('data-qm-unknown-attrs');
	if (raw == null) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

// ── The names a carrier may not wear ────────────────────────────────────────
// A carrier holds a value this build does not know, so a name the content model does
// know is the one thing it cannot carry: `textblockKind` re-emits it with `attrs`
// beside it (`encode.ts`), and the store refuses `attrs` beside a built-in
// discriminant, which fails every write for the rest of the session. It is the guard
// `decode` already applies from the other side, where a `para` line mints no carrier.

/** The line kinds `ContentLineKind` names, which decode maps to a node of their own. */
const BUILTIN_LINE_KINDS = new Set(['para', 'heading', 'code', 'rule', 'island']);

/** The containers `ContentContainer` names. */
const BUILTIN_CONTAINERS = new Set(['list_item', 'quote']);

/** A carrier's name, or `null` where it is empty or one the model owns. */
function carrierName(el: HTMLElement, attr: string, builtin: Set<string>): string | null {
	const name = el.getAttribute(attr);
	return name && !builtin.has(name) ? name : null;
}

// ── Marks (the block and inline schemas share them; plaintext declares none) ─
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
			{ tag: 'a[href]', getAttrs: (el) => ({ href: el.getAttribute('href') }) },
			{ tag: 'span[data-qm-href]', getAttrs: (el) => ({ href: el.getAttribute('data-qm-href') }) }
		],
		// A refused href draws as a bare span: the text stands, unstyled and
		// unclickable, and the mark keeps its value for encode. The value rides on the
		// span rather than being dropped with the tag, an `href` no renderer will follow
		// still being one the document holds: a copy is not the explicit conversion that
		// is allowed to lose it, and the pair is one tier (§head).
		toDOM: (mark) => {
			const href = mark.attrs.href as string;
			return rendersHref(href) ? ['a', { href }, 0] : ['span', { 'data-qm-href': href }, 0];
		}
	},
	// The open-set escape hatch: an inert mark that renders as a bare span and
	// re-emits its stored `type`/`attrs` on encode. `excludes: ''` lets marks of
	// this type with different attrs share a range (they are distinct families).
	unknown: {
		attrs: { type: { default: '' }, attrs: { default: null } },
		excludes: '',
		parseDOM: [
			{
				tag: 'span[data-qm-unknown-mark]',
				// `false` declines the rule, so the text arrives unmarked rather than
				// carrying a second spelling of a mark this schema already has.
				getAttrs: (el) => {
					const type = carrierName(el, 'data-qm-unknown-mark', BUILTIN_MARKS);
					return type ? { type, attrs: unpackAttrs(el) } : false;
				}
			}
		],
		toDOM: (mark) => [
			'span',
			{ 'data-qm-unknown-mark': mark.attrs.type as string, ...packAttrs(mark.attrs.attrs) },
			0
		]
	}
};

/** The mark types the content model names: this schema's own, and `anchor`, which is a
 *  decoration here rather than a mark (§Marks). Read off the record above, so a mark
 *  added there closes the carrier's door on its name in the same edit. */
const BUILTIN_MARKS = new Set([...Object.keys(marks), 'anchor']);

// ── The fence's language ────────────────────────────────────────────────────
// The one attribute no keystroke in the visual editor mints: the shorthand fires on
// the third backtick, before a language could be typed, and a slash command is a name
// (VISUAL_EDITOR §"Settled and open"). A paste is the gesture that does, and this is
// what reads it — a fence copied off a highlighted page arrives carrying the language
// that page stated, one copied inside the body keeps its own.

/** A `language-x` / `lang-x` token in a class list. */
const LANG_CLASS = /(?:^|\s)lang(?:uage)?-(\S+)/;

/** The language a `<pre>` states: `data-lang`, which is what `toDOM` writes, else the
 *  class convention on the `pre` or on the `code` it wraps. `null` where it states
 *  none, which is also what an empty value is. */
function fenceLang(pre: HTMLElement): string | null {
	const stated = pre.getAttribute('data-lang');
	if (stated) return stated;
	for (const el of [pre, pre.firstElementChild]) {
		const match = el && LANG_CLASS.exec(el.getAttribute('class') ?? '');
		if (match) return match[1]!;
	}
	return null;
}

// ── Block nodes ─────────────────────────────────────────────────────────────
const blockNodes: Record<string, NodeSpec> = {
	doc: { content: 'block+' },
	// `unknown` carries a line `kind` this build does not know (`{ kind, attrs }`,
	// else null). A paragraph is how such a line renders, so the carrier is an
	// attribute rather than a node type: every paragraph command already reaches it,
	// and retyping it to a heading or a list drops the attribute: an explicit
	// conversion, which is the one place the unknown kind should be lost.
	paragraph: {
		content: 'inline*',
		group: 'block',
		attrs: { unknown: { default: null } },
		parseDOM: [
			{
				tag: 'p',
				getAttrs: (el) => {
					const kind = carrierName(el, 'data-qm-unknown-line', BUILTIN_LINE_KINDS);
					return { unknown: kind ? { kind, attrs: unpackAttrs(el) } : null };
				}
			}
		],
		toDOM: (node) => {
			const u = node.attrs.unknown as { kind: string; attrs: unknown } | null;
			return u ? ['p', { 'data-qm-unknown-line': u.kind, ...packAttrs(u.attrs) }, 0] : ['p', 0];
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
		parseDOM: [
			{
				tag: 'pre',
				preserveWhitespace: 'full',
				getAttrs: (el) => ({ lang: fenceLang(el) })
			}
		],
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
		parseDOM: [
			{
				tag: 'ol',
				getAttrs: (el) => {
					// A list stating no `start` starts at one, which is what `toDOM` leaves
					// unwritten; `Number(null)` would read that absence as zero. A value the
					// store would normalize away reads as that absence too, the leaf
					// re-hydrating only on an external change (CODEC §Reconciliation), so a PM
					// doc keeping one disagrees with what is stored for the rest of the
					// session. Zero is not such a value: `0.` is an ordinal `importMarkdown`
					// produces and the store keeps.
					const stated = el.getAttribute('start');
					const start = stated ? Number(stated) : 1;
					return { start: Number.isSafeInteger(start) && start >= 0 ? start : 1 };
				}
			}
		],
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
		parseDOM: [
			{
				tag: 'div[data-qm-unknown-container]',
				// `false` declines the rule, so the div's children flow at the enclosing
				// level — which is how a transparent container renders anyway.
				getAttrs: (el) => {
					const container = carrierName(el, 'data-qm-unknown-container', BUILTIN_CONTAINERS);
					return container ? { container, attrs: unpackAttrs(el) } : false;
				}
			}
		],
		toDOM: (node) => [
			'div',
			{
				'data-qm-unknown-container': node.attrs.container as string,
				...packAttrs(node.attrs.attrs)
			},
			0
		]
	},
	island_block: islandBlockSpec
};

// ── Inline nodes ────────────────────────────────────────────────────────────
const inlineLeafNodes: Record<string, NodeSpec> = {
	text: { group: 'inline' },
	// `linebreakReplacement` is what makes a join across a `code_block`'s edge
	// lossless: `Transform.join` and `setBlockType` convert its `\n`s to breaks
	// rather than flattening them to spaces, and a break is a `continues` line.
	hard_break: {
		inline: true,
		group: 'inline',
		selectable: false,
		linebreakReplacement: true,
		parseDOM: [{ tag: 'br' }],
		toDOM: () => ['br']
	},
	island_inline: islandInlineSpec
};

/** The full field schema: every block kind, container, mark, and island. */
export const blockSchema = new Schema({
	nodes: { ...blockNodes, ...inlineLeafNodes },
	marks
});

// ── The constrained inline nodes (both inline schemas) ──────────────────────
// `doc: "paragraph"` (exactly one child) is what makes an Enter a no-op at the
// model level: there is no second block for a split to land.
const inlineNodes: Record<string, NodeSpec> = {
	doc: { content: 'paragraph' },
	paragraph: { content: 'inline*', toDOM: () => ['p', 0] },
	text: { group: 'inline' }
};

/** The constrained inline schema: one paragraph, no block splitting, no
 *  containers, no islands, and the full mark set (a `richtext(inline)` field, and
 *  a table cell, which is the same content unit). */
export const inlineSchema = new Schema({ nodes: inlineNodes, marks });

/**
 * The inline schema with no mark types at all: a `plaintext` field, whose value is
 * literal text the boundary refuses to coerce back once it carries a mark.
 *
 * Declaring none is what makes that structural rather than a rule each path
 * restates: `toggleMark` has no type to apply, the mark input rules build nothing,
 * a paste parses its marks away, and `decode` drops any a stray content arrives
 * carrying (CODEC §Inline mode).
 */
export const plaintextSchema = new Schema({ nodes: inlineNodes, marks: {} });

/** Whether `schema` can carry formatting at all: false for {@link plaintextSchema}
 *  alone. What a mark command asks before it offers itself. */
export function hasMarks(schema: Schema): boolean {
	return Object.keys(schema.marks).length > 0;
}

/** True for the constrained inline schema (no block containers); decode branches on it. */
export function isInlineSchema(schema: Schema): boolean {
	return !schema.nodes.blockquote;
}
