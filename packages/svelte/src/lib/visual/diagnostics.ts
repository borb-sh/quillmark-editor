// Diagnostics routing (VISUAL_EDITOR §Diagnostics). Pure merge + route
// of the three producers into a `Map<fieldKey, Diagnostic[]>` the card tree
// reads. No runes, no Document: VisualEditor.svelte's `$derived.by` re-runs
// this from its revision counter + the three raw sources, mirroring
// structure.ts's split of pure projection math from reactive orchestration.
//
// Three producers (VISUAL_EDITOR §Diagnostics):
// 1. `quill.validate(doc)`: `Diagnostic[]`, `.path` a canonical `DocPath`.
//      Routed here by `routeAndResolve`, less what `inlineShown` withholds.
// 2. Local commit errors: a `writer.set`/`writer.card(i).set` throw at
//      commit time (VisualEditor's `commitScalar`). The editor knows the exact
//      field/card being committed, so these are keyed directly at the call site
//      with a `FieldKey`; never parsed from a message. The thrown
//      `QuillmarkError`'s `diagnostics[0]` carries `code` and a canonical `path`
//      (`edit::field_coercion_failed` / `edit::unknown_field`), so the editor surfaces that
//      diagnostic verbatim under its own id-keyed address.
// 3. External diagnostics: the consumer-supplied `diagnostics?: Diagnostic[]`
//      prop (`LiveSession.warnings` + render errors via `FieldRegion.field`),
//      routed by `.path` like #1.
//
// Field-key space. Two addressing schemes meet here: producers #1/#3 speak the
// canonical `DocPath` string (`main.<field>` / `main.body` /
// `cards.<kind>[<i>].<field>`, `<i>` the absolute document-array index:
// `Diagnostic.path`, `ContentHit.field`, and `FieldRegion.field` all share this
// one grammar). Routing runs on the boundary's own `parseDocPath`, not a
// hand-rolled parser. The editor's own addressing (VisualEditor's
// `commitScalar`, the `leaves` registry) is stable-id keyed so a diagnostic stays
// pinned to the right card across a reorder (VISUAL_EDITOR §"The address is the
// spine"); `resolveCardKey` bridges the absolute index → stable id, and
// `fieldKeyToString` is the one shared string form both sides collapse to for the
// `Map`.
import type { Diagnostic } from '@quillmark/wasm';
import { addrForFieldPath } from '../core/address.js';

/** A field's routing address, and `/core`'s `Addr` structurally: an `Addr` is a
 * positional `FieldKey`, so `addrForFieldPath` is the path→key walk and routing
 * carries no second copy of the grammar. `card` is `undefined` for the main card; a
 * composable card slot is a stable session id (the editor's own bookkeeping) once
 * resolved, or an absolute document-array index straight off a parsed `DocPath`
 * (resolve via {@link resolveCardKey} before merging with id-keyed sources). `field`
 * `undefined` addresses the body (the field-less leaf). */
export interface FieldKey {
	card?: string | number;
	field?: string;
}

/** Canonical string key for a `FieldKey`: the routing `Map`'s key space. */
export function fieldKeyToString(k: FieldKey): string {
	return `${k.card ?? 'main'}:${k.field ?? '$body'}`;
}

/**
 * Resolve a positional `FieldKey` (an absolute document-array index, straight off
 * `addrForFieldPath`) to the editor's stable-id keying using the live `cardIds`
 * array: re-resolved fresh on every call (never cached), the same "resolve only
 * at the point of use" discipline `cardIndexOf` applies to writes (VISUAL_EDITOR
 * §"The address is the spine"). A key already id-keyed (`card` a string) or main
 * (`card` undefined) passes through unchanged. `undefined` when the index is out
 * of the current card array: the diagnostic is dropped rather than mis-routed.
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
 * Whether a validation diagnostic is the surface's to show under a control
 * (VISUAL_EDITOR §Diagnostics). Obligation is not: the label's `*` already states
 * it, from the same schema, for the same cells, and it states it whether or not the
 * cell has been answered — so the warning is a second copy of a mark on screen, once
 * per obliged field, on every document nobody has finished. That is every obliged
 * field of a fresh seed, which is what a consumer's first mount is.
 *
 * Withheld from the boundary's own validation lane only. A consumer's `diagnostics`
 * prop passes whole: what a host hands the surface, the host asked to see. And
 * nothing is suppressed at the source — `quill.validate(doc)` is the completeness
 * read, unchanged and still the host's to make.
 */
export function inlineShown(d: Diagnostic): boolean {
	return d.code !== 'validation::must_fill';
}

/**
 * Route a path-keyed producer's raw `Diagnostic[]` (validate / external) to the
 * editor's stable-id keying: the one door producers #1/#3 take, `addrForFieldPath`
 * and `resolveCardKey` in a single pass. An entry drops rather than mis-routes when
 * it carries no `path`, when the path names no single commit address (a nested /
 * array-element one), or when its absolute card index is out of the live `cardIds`.
 */
export function routeAndResolve(
	diagnostics: Diagnostic[] | undefined,
	cardIds: readonly string[]
): RoutedDiagnostic[] {
	const out: RoutedDiagnostic[] = [];
	for (const d of diagnostics ?? []) {
		if (!d.path) continue;
		const key = addrForFieldPath(d.path);
		const resolved = key && resolveCardKey(key, cardIds);
		if (resolved) out.push({ key: resolved, diagnostic: d });
	}
	return out;
}

/** Severity ordering: errors sort before warnings within a field's list (never dropped, just ranked: VISUAL_EDITOR §Diagnostics "nothing gates" extends to nothing hides). */
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
