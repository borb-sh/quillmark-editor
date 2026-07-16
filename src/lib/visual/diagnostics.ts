// Diagnostics routing (VISUAL_EDITOR §Diagnostics, Phase 4b). Pure merge + route
// of the three producers into a `Map<fieldKey, Diagnostic[]>` the card tree
// reads. No runes, no Document — VisualEditor.svelte's `$derived.by` re-runs
// this from its revision counter + the three raw sources, mirroring
// structure.ts's split of pure projection math from reactive orchestration.
//
// Three producers (VISUAL_EDITOR §Diagnostics):
//   1. `quill.validate(doc)`  — `Diagnostic[]`, `.path` field-keyed. Routed here
//      by `routeAndResolve`; empirically always `[]` for usaf_memo (no field in
//      the fixture carries a `!must_fill` marker — verified against the
//      pristine seed AND a seeded `indorsement` card), so the routing exists for
//      the general contract, not because this fixture exercises it.
//   2. Local commit errors — a `writer.set`/`writer.card(i).set` throw at
//      commit time (VisualEditor's `commitScalar`). The editor KNOWS the exact
//      field/card being committed, so these are constructed directly at the
//      call site with a `FieldKey` — never parsed from a message. Empirically
//      (probed against the live boundary): the thrown `QuillmarkError`'s
//      `diagnostics[0]` carries `severity`/`message` only — no `path`/`code` —
//      confirming the message-parsing approach the phase brief warns off.
//   3. External diagnostics — the consumer-supplied `diagnostics?: Diagnostic[]`
//      prop (Phase 5: `LiveSession.warnings` + render errors via
//      `FieldRegion.field`), routed by `.path` like #1.
//
// FIELD-KEY SPACE. Two addressing schemes meet here: producers #1/#3 speak
// `Diagnostic.path`, a POSITIONAL string (the CorpusHit/FieldRegion grammar,
// BOUNDARY_NOTES — `$body` / `<field>` / `$cards.<kind>.<i>.<field>`; verified
// for CorpusHit/FieldRegion, BEST-EFFORT for Diagnostic.path since the fixture
// cannot produce a non-empty `validate()` result to check the card-path shape
// against). The editor's OWN addressing (VisualEditor's `commitScalar`, the
// `leaves` registry) is STABLE-ID keyed so a diagnostic stays pinned to the
// right card across a reorder (VISUAL_EDITOR §"The address is the spine").
// `resolveCardKey` bridges positional → stable-id using the live `cardIds`
// array; `fieldKeyToString` is the one shared string form both sides collapse
// to for the `Map`.
import type { Diagnostic } from '../core/index.js';

/** A field's routing address. `card` is `undefined` for the main card; a
 * composable card slot is a stable session id (the editor's own bookkeeping)
 * once resolved, or a raw PER-KIND ordinal straight off a parsed `path`
 * (resolve via {@link resolveCardKey} before merging with id-keyed sources).
 * `field` `undefined` addresses the body (the field-less leaf). */
export interface FieldKey {
	card?: string | number;
	/** The `<kind>` segment of a positional `$cards.` path — the ordinal is
	 * per-kind (fixture plate.typ: the absolute loop index is NOT the ordinal
	 * once kinds interleave). Dropped by {@link resolveCardKey}. */
	cardKind?: string;
	field?: string;
}

/** Canonical string key for a `FieldKey` — the routing `Map`'s key space. */
export function fieldKeyToString(k: FieldKey): string {
	return `${k.card ?? 'main'}:${k.field ?? '$body'}`;
}

/**
 * Parse a producer's `path` grammar (BOUNDARY_NOTES §"FieldRegion.field /
 * CorpusHit.field GRAMMAR") into a `FieldKey`, `card` as a raw corpus index.
 * Verified for CorpusHit/FieldRegion; `Diagnostic.path` is assumed to share it
 * (both are quillmark's one field-addressing grammar) but is NOT independently
 * confirmed for card paths — BEST-EFFORT, per the phase brief. Returns
 * `undefined` for a grammar this can't place as ONE field (an array element
 * like `references.0` has no single-field commit address to route to; a
 * malformed `$cards.` path).
 */
export function parsePath(path: string): FieldKey | undefined {
	if (path === '$body') return {};
	if (path.startsWith('$cards.')) {
		const parts = path.split('.'); // $cards.<kind>.<i>[.<field>]
		const i = Number(parts[2]);
		if (!Number.isInteger(i) || i < 0) return undefined;
		return parts[3] != null
			? { card: i, cardKind: parts[1], field: parts[3] }
			: { card: i, cardKind: parts[1] };
	}
	if (path.includes('.')) return undefined; // an array element (e.g. references.0) — not routable
	return { field: path };
}

/**
 * Resolve a positional `FieldKey` (a raw corpus index, straight off
 * `parsePath`) to the editor's stable-id keying using the LIVE `cardIds`
 * array — re-resolved fresh on every call (never cached), the same "resolve
 * only at the point of use" discipline `cardIndexOf` applies to writes
 * (VISUAL_EDITOR §"The address is the spine"). A key that is already
 * id-keyed (`card` a string) or main (`card` undefined) passes through
 * unchanged. `undefined` when the index is out of the current card array —
 * the diagnostic is dropped rather than mis-routed to the wrong card.
 */
export function resolveCardKey(
	key: FieldKey,
	cardIds: readonly string[],
	cardKinds?: readonly string[]
): FieldKey | undefined {
	if (typeof key.card !== 'number') return key;
	// A positional ordinal is PER-KIND (see {@link FieldKey.cardKind}); resolve
	// it to the absolute slot against the live kinds when the caller supplies
	// them, else fall back to treating it as absolute (single-kind documents
	// make the two readings identical).
	const abs =
		key.cardKind != null && cardKinds != null
			? perKindCardIndex(cardKinds, key.cardKind, key.card)
			: key.card;
	const id = abs >= 0 ? cardIds[abs] : undefined;
	return id != null ? { card: id, field: key.field } : undefined;
}

/** The absolute slot of the `ordinal`-th card of `kind`, or -1 when absent. */
export function perKindCardIndex(kinds: readonly string[], kind: string, ordinal: number): number {
	let seen = -1;
	for (let i = 0; i < kinds.length; i++) {
		if (kinds[i] === kind && ++seen === ordinal) return i;
	}
	return -1;
}

/** One diagnostic paired with the `FieldKey` it targets. */
export interface RoutedDiagnostic {
	key: FieldKey;
	diagnostic: Diagnostic;
}

/** Route a producer's raw `Diagnostic[]` (validate() / external) via `.path`, dropping unroutable entries (no `path`, or a `path` `parsePath` can't place). */
export function routeByPath(diagnostics: Diagnostic[] | undefined): RoutedDiagnostic[] {
	const out: RoutedDiagnostic[] = [];
	for (const d of diagnostics ?? []) {
		if (!d.path) continue;
		const key = parsePath(d.path);
		if (key) out.push({ key, diagnostic: d });
	}
	return out;
}

/** `routeByPath` + `resolveCardKey` in one step — the convenience a reactive caller (VisualEditor) wants for producers #1/#3. */
export function routeAndResolve(
	diagnostics: Diagnostic[] | undefined,
	cardIds: readonly string[],
	cardKinds?: readonly string[]
): RoutedDiagnostic[] {
	const out: RoutedDiagnostic[] = [];
	for (const r of routeByPath(diagnostics)) {
		const resolved = resolveCardKey(r.key, cardIds, cardKinds);
		if (resolved) out.push({ key: resolved, diagnostic: r.diagnostic });
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
			const dedupeKey = `${k}\u0000${diagnostic.severity}\u0000${diagnostic.message}`;
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
