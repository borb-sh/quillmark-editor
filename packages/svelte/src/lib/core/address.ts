// The one address vocabulary the surfaces speak in public: canonical `DocPath`
// strings for places, `Addr` for the document verbs. Declared HERE because both
// `/preview` and `/visual` name a place in their hooks, and a type declared twice
// structurally is drift with nothing to catch it: `/core` is the module both
// already import.
//
// Slogan: paths for places, indexes for structure ops. `Addr` (`{card?, field?}`,
// from `@quillmark/wasm`) is the mutator currency; the conversions at the foot of
// this module are the hop between the two. `fieldPathForAddr` and `addrForFieldPath`
// are public, because a host given a path by a hook and holding a verb that takes an
// `Addr` needs them; `cardPath` is the editor's own.
//
// The grammar is the boundary's, reached through the init gate (`core()`):
// `parseDocPath` / `formatDocPath` are on the awaited surface, and the verbs here are
// pure and sync on both sides of it.
import type { Addr, DocPathSeg, HitGranularity } from '@quillmark/wasm';
import { core } from './lifecycle.js';

/**
 * A canonical field address: `main.<field>` / `main.body` /
 * `cards.<kind>[<i>].<field>`, cards keyed by ABSOLUTE document index.
 *
 * The grammar `parseDocPath` / `formatDocPath` speak, and the one
 * `Diagnostic.path`, `ContentHit.field`, `FieldRegion.field` and
 * `session.regions()` keys already use. An alias over `string`: the boundary
 * exports the parser and the segment type, not a nominal type, so this names the
 * grammar at a signature rather than inventing a checked one.
 */
export type DocPath = string;

/**
 * A place in the document: a field and a caret within it. What the editor reports
 * when its caret moves and what the preview scrolls to, so the editor→preview hop
 * is `onCaretMove={preview.focusPosition}` and translates nothing.
 *
 * `pos` is USV, the shared content coordinate on both sides of the boundary: a
 * `ContentHit` is a `Place` with its own extras, and fits wherever one is taken.
 */
export interface Place {
	field: DocPath;
	/** The caret in USV. */
	pos: number;
}

/**
 * Where a preview click landed. What the preview surfaces and what the editor's
 * `setCaret` takes.
 *
 * **An absent `pos` is the PLACEMENT rung**, not a caret at zero: the click resolved
 * a field the plate places without tracking its content (`fieldAt` answers,
 * `positionAt` does not), so there is no offset and the landing is a focus. A `Place`
 * is a landing carrying its caret, and a `ContentHit` is one too.
 */
export interface Landing {
	field: DocPath;
	/** The caret in USV, absent on the placement rung. */
	pos?: number;
	/** Whether `pos` is cluster-exact or floored to a segment start; the boundary's
	 *  own marker, carried through untouched. */
	granularity?: HitGranularity;
}

// ── Addr ↔ DocPath ──────────────────────────────────────────────────────────
// The one hop between the two vocabularies, both directions, pure and
// document-free: `kinds` is the kind of each composable card by content index
// (`doc.cards.map(c => c.kind)`), which is all the card segment needs. The editor
// mints it off its own derived card tree rather than re-reading `doc.cards`, which
// serializes every card per read and is not a thing to do per keystroke.

/**
 * A field's canonical `DocPath`, or `undefined` when `addr.card` is outside the live
 * `kinds` array (a stale address: drop it rather than mis-target). A field-less card
 * addresses its BODY, which is the leaf `{card: i}` names.
 *
 * - `{}` → `"main.body"`
 * - `{field}` → `"main.<field>"`
 * - `{card: i}` → `"cards.<kind>[i].body"`
 * - `{card: i, field}` → `"cards.<kind>[i].<field>"`
 *
 * `cards[i]` stands in for an unknown or blank kind. The index is the addr's own: no
 * per-kind counting, since `DocPath` addresses cards by document-array index.
 */
export function fieldPathForAddr(addr: Addr, kinds: readonly string[]): DocPath | undefined {
	const head = cardHead(addr.card, kinds);
	if (!head) return undefined;
	const tail: DocPathSeg =
		addr.field != null ? { seg: 'field', name: addr.field } : { seg: 'body' };
	return core().formatDocPath([head, tail]);
}

/**
 * A CARD's own path (`cards.<kind>[i]`), not a leaf's: what a structure op names,
 * where the change is the card rather than anything inside it. `undefined` for an
 * index outside `kinds`.
 */
export function cardPath(index: number, kinds: readonly string[]): DocPath | undefined {
	const head = cardHead(index, kinds);
	return head ? core().formatDocPath([head]) : undefined;
}

/**
 * The inverse: a canonical `DocPath` back to the `Addr` the document verbs take, or
 * `undefined` for a path that names no single commit address — a nested or
 * array-element path (`main.references.0`, which {@link elementAddrForFieldPath}
 * takes instead), a field-rooted one, or a malformed one. A bare card and a `.body`
 * terminal both land on the field-less `{card: i}` the body leaf answers to.
 *
 * Needs no `kinds`: the path carries the absolute index, and the kind in it is
 * decoration the `Addr` has no room for.
 */
export function addrForFieldPath(path: DocPath): Addr | undefined {
	const segs = segsOf(path);
	return segs && addrForSegs(segs);
}

/**
 * An ARRAY ELEMENT's address, split. `main.references.0` and `main.references[0]`
 * both land here; anything {@link addrForFieldPath} can name, and anything whose
 * trailing segment is not an index, does not.
 *
 * Both spellings, because the boundary mints one and formats the other: `regions()`
 * and `positionAt` emit `main.references.0`, which `parseDocPath` reads as a field
 * literally named `"0"`, while `formatDocPath` spells the index segment
 * `main.references[0]`. A trailing all-digits field name is therefore an index that
 * lost its brackets — but only under a field the SCHEMA declares an array, the
 * caller's guard to apply: this module holds the grammar and no schema.
 */
export function elementAddrForFieldPath(path: DocPath): ElementAddr | undefined {
	const segs = segsOf(path);
	if (!segs) return undefined;
	const last = segs[segs.length - 1];
	const index =
		last?.seg === 'index'
			? last.index
			: last?.seg === 'field' && /^\d+$/.test(last.name)
				? Number(last.name)
				: undefined;
	if (index == null) return undefined;
	const field = addrForSegs(segs.slice(0, -1));
	// A body has no elements: the parent must name a FIELD.
	return field?.field != null ? { field, index } : undefined;
}

/** An array element's address: the ARRAY's `Addr`, and which element of it. */
export interface ElementAddr {
	field: Addr;
	index: number;
}

/** `parseDocPath`, with a malformed path as `undefined` rather than a throw. The gate
 *  is read OUTSIDE the try: an uninitialized core is not a malformed path, and would
 *  otherwise leave here as one. */
function segsOf(path: DocPath): DocPathSeg[] | undefined {
	const { parseDocPath } = core();
	try {
		return parseDocPath(path);
	} catch {
		return undefined;
	}
}

/** {@link addrForFieldPath} over already-parsed segments, so the element walk reuses
 *  it for the head of a path rather than re-serializing one. */
function addrForSegs(segs: DocPathSeg[]): Addr | undefined {
	const [head, ...rest] = segs;
	if (!head) return undefined;
	let addr: Addr;
	if (head.seg === 'main') addr = {};
	else if (head.seg === 'card') addr = { card: head.index };
	else return undefined;
	if (rest.length === 0) return addr;
	if (rest.length > 1) return undefined;
	const tail = rest[0];
	if (tail.seg === 'body') return addr;
	if (tail.seg === 'field') return { ...addr, field: tail.name };
	return undefined;
}

/** The head segment a card index resolves to, or `undefined` when it is out of the
 *  live array. `null` kind is the unknown-kind form the grammar spells `cards[i]`. */
function cardHead(index: number | undefined, kinds: readonly string[]): DocPathSeg | undefined {
	if (index == null) return { seg: 'main' };
	if (!Number.isInteger(index) || index < 0 || index >= kinds.length) return undefined;
	return { seg: 'card', kind: kinds[index] || null, index };
}
