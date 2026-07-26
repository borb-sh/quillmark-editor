// Diagnostics routing (VISUAL_EDITOR §Diagnostics, Phase 4b). Pure merge + route
// of the three producers into a `Map<fieldKey, Diagnostic[]>` the card tree
// reads. No runes, no Document — VisualEditor.svelte's `$derived.by` re-runs
// this from its revision counter + the three raw sources, mirroring
// structure.ts's split of pure projection math from reactive orchestration.
//
// Three producers (VISUAL_EDITOR §Diagnostics):
//   1. `quill.validate(doc)`  — `Diagnostic[]`, `.path` a canonical `DocPath`.
//      Routed here by `routeAndResolve` (a `!must_fill` marker yields
//      `validation::must_fill` at e.g. `cards.indorsement[0].from`).
//   2. Local commit errors — a `writer.set`/`writer.card(i).set` throw at
//      commit time (VisualEditor's `commitScalar`). The editor KNOWS the exact
//      field/card being committed, so these are keyed directly at the call site
//      with a `FieldKey` — never parsed from a message. As of `@quillmark/wasm`
//      0.96.0 the thrown `QuillmarkError`'s `diagnostics[0]` carries `code` and a
//      canonical `path` (`edit::field_conform` / `edit::unknown_field`), so the
//      editor surfaces that diagnostic verbatim under its own id-keyed address.
//   3. External diagnostics — the consumer-supplied `diagnostics?: Diagnostic[]`
//      prop (Phase 5: `LiveSession.warnings` + render errors via
//      `FieldRegion.field`), routed by `.path` like #1.
//
// FIELD-KEY SPACE. Two addressing schemes meet here: producers #1/#3 speak the
// canonical `DocPath` string (`main.<field>` / `main.body` /
// `cards.<kind>[<i>].<field>`, `<i>` the ABSOLUTE document-array index —
// `Diagnostic.path`, `ContentHit.field`, and `FieldRegion.field` all share this
// one grammar since 0.96.0). Routing runs on the boundary's own `parseDocPath`,
// not a hand-rolled parser. The editor's OWN addressing (VisualEditor's
// `commitScalar`, the `leaves` registry) is STABLE-ID keyed so a diagnostic stays
// pinned to the right card across a reorder (VISUAL_EDITOR §"The address is the
// spine"); `resolveCardKey` bridges the absolute index → stable id, and
// `fieldKeyToString` is the one shared string form both sides collapse to for the
// `Map`.
import { parseDocPath, type DocPathSeg, type Diagnostic } from '../core/index.js';

/** A field's routing address. `card` is `undefined` for the main card; a
 * composable card slot is a stable session id (the editor's own bookkeeping)
 * once resolved, or an ABSOLUTE document-array index straight off a parsed
 * `DocPath` (resolve via {@link resolveCardKey} before merging with id-keyed
 * sources). `field` `undefined` addresses the body (the field-less leaf). */
export interface FieldKey {
	card?: string | number;
	field?: string;
}

/** Canonical string key for a `FieldKey` — the routing `Map`'s key space. */
export function fieldKeyToString(k: FieldKey): string {
	return `${k.card ?? 'main'}:${k.field ?? '$body'}`;
}

/**
 * Route a canonical `DocPath` (a `Diagnostic.path`, or a `ContentHit` /
 * `FieldRegion` field address — one grammar since 0.96.0) to a `FieldKey`,
 * `card` the ABSOLUTE document-array index. Runs on the boundary's `parseDocPath`
 * — no hand-rolled grammar. Returns `undefined` for a path that is not a single
 * field or body commit address: a nested / array-element path
 * (`main.references.0` → `[main, field, field]`) has no single-field target, a
 * field-rooted path (`recipients[0].name`) is not a card/main address, and a
 * malformed path (which `parseDocPath` throws on) is dropped.
 */
export function parsePath(path: string): FieldKey | undefined {
	let segs: DocPathSeg[];
	try {
		segs = parseDocPath(path);
	} catch {
		return undefined;
	}
	if (segs.length === 0) return undefined;
	const [head, ...rest] = segs;
	let key: FieldKey;
	if (head.seg === 'main') key = {};
	else if (head.seg === 'card') key = { card: head.index };
	else return undefined; // a field/index/body head — not a card-or-main address
	// Head only (`main`, `cards.<kind>[i]`) or a `body` terminal is the body leaf;
	// one `field` seg is that field; a trailing index or deeper nesting is an
	// array element with no single-field commit address.
	if (rest.length === 0) return key;
	if (rest.length === 1) {
		const tail = rest[0];
		if (tail.seg === 'body') return key;
		if (tail.seg === 'field') return { ...key, field: tail.name };
	}
	return undefined;
}

/**
 * Resolve a positional `FieldKey` (an ABSOLUTE document-array index, straight off
 * {@link parsePath}) to the editor's stable-id keying using the LIVE `cardIds`
 * array — re-resolved fresh on every call (never cached), the same "resolve only
 * at the point of use" discipline `cardIndexOf` applies to writes (VISUAL_EDITOR
 * §"The address is the spine"). A key already id-keyed (`card` a string) or main
 * (`card` undefined) passes through unchanged. `undefined` when the index is out
 * of the current card array — the diagnostic is dropped rather than mis-routed.
 */
export function resolveCardKey(key: FieldKey, cardIds: readonly string[]): FieldKey | undefined {
	if (typeof key.card !== 'number') return key;
	const id = key.card >= 0 && key.card < cardIds.length ? cardIds[key.card] : undefined;
	return id != null ? { card: id, field: key.field } : undefined;
}

/** One diagnostic paired with the `FieldKey` it targets. */
export interface RoutedDiagnostic {
	key: FieldKey;
	diagnostic: Diagnostic;
}

/**
 * Route a path-keyed producer's raw `Diagnostic[]` (validate() / external) to the
 * editor's stable-id keying — the ONE door producers #1/#3 take, `parsePath` and
 * `resolveCardKey` in a single pass. An entry drops rather than mis-routes when it
 * carries no `path`, when `parsePath` cannot place it (a nested / array-element
 * address), or when its absolute card index is out of the live `cardIds`.
 */
export function routeAndResolve(
	diagnostics: Diagnostic[] | undefined,
	cardIds: readonly string[]
): RoutedDiagnostic[] {
	const out: RoutedDiagnostic[] = [];
	for (const d of diagnostics ?? []) {
		if (!d.path) continue;
		const key = parsePath(d.path);
		const resolved = key && resolveCardKey(key, cardIds);
		if (resolved) out.push({ key: resolved, diagnostic: d });
	}
	return out;
}

/** Severity ordering — errors sort before warnings within a field's list (never dropped, just ranked: VISUAL_EDITOR §Diagnostics "nothing gates" extends to nothing hides). */
const SEVERITY_RANK: Record<Diagnostic['severity'], number> = { error: 0, warning: 1 };

/**
 * Merge N routed groups into `Map<fieldKeyToString(key), Diagnostic[]>`.
 * Dedupes an identical `(severity, message)` pair landing on the same key from
 * more than one group (e.g. the same warning present in both `validate()` and
 * an external feed); within a key, errors sort before warnings.
 */
export function mergeDiagnostics(...groups: RoutedDiagnostic[][]): Map<string, Diagnostic[]> {
	const byKey = new Map<string, Diagnostic[]>();
	const seen = new Set<string>();
	for (const group of groups) {
		for (const { key, diagnostic } of group) {
			const k = fieldKeyToString(key);
			// Collision-proof key: JSON-encode the triple so arbitrary `message` text
			// can never merge two distinct triples into one (a real diagnostic dropped).
			const dedupeKey = JSON.stringify([k, diagnostic.severity, diagnostic.message]);
			if (seen.has(dedupeKey)) continue;
			seen.add(dedupeKey);
			const arr = byKey.get(k);
			if (arr) arr.push(diagnostic);
			else byKey.set(k, [diagnostic]);
		}
	}
	for (const arr of byKey.values()) {
		arr.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
	}
	return byKey;
}
