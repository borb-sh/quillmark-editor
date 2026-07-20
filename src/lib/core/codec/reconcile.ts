// Reconciliation — the field-scoped external-change gate (CODEC §Reconciliation).
// The content normalizes on write, so `decode ∘ lower` is idempotent only up to
// normalization: the optimistic PM state and the re-decoded stored content agree
// after normalize, not byte-for-byte. So the field holds its PM state and
// re-hydrates ONLY on an EXTERNAL content change (another edit source, a paste, a
// `revise`), gated by canonical-content equality scoped to the leaf's addr — the
// analog of web-app's whole-document `Document.equals`, narrowed to one field.
// Caret continuity across the field's OWN edits is the PM `StepMap`, not this.
import type { Content } from '@quillmark/wasm';

/** Tracks the last content the codec knows for a leaf, to distinguish foreign edits. */
export interface Reconciler {
	/** Should `current` (a fresh read of the leaf) trigger a re-hydrate? */
	shouldRehydrate(current: Content): boolean;
	/** Record `rt` as the codec's known state (after its own edit or a re-hydrate). */
	commit(rt: Content): void;
	/** The last known content (for tests / diagnostics). */
	readonly last: Content | undefined;
}

/** A reconciler seeded with the leaf's initial content. */
export function createReconciler(initial: Content): Reconciler {
	let known: Content = initial;
	return {
		shouldRehydrate(current: Content): boolean {
			return !contentEqual(current, known);
		},
		commit(rt: Content): void {
			known = rt;
		},
		get last(): Content {
			return known;
		}
	};
}

/**
 * Canonical content equality — a structural deep-equal, key-order-insensitive so a
 * WASM read (`doc.get`) and a codec projection (`pmToContent`) compare by value.
 * This is the per-field twin of `Document.equals`.
 */
export function contentEqual(a: Content, b: Content): boolean {
	return deepEqual(a, b);
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true;
	if (typeof a !== typeof b) return false;
	if (a === null || b === null) return a === b;
	if (Array.isArray(a) || Array.isArray(b)) {
		if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
		return true;
	}
	if (typeof a === 'object' && typeof b === 'object') {
		const ao = a as Record<string, unknown>;
		const bo = b as Record<string, unknown>;
		const ak = Object.keys(ao);
		const bk = Object.keys(bo);
		if (ak.length !== bk.length) return false;
		for (const k of ak) {
			if (!Object.prototype.hasOwnProperty.call(bo, k)) return false;
			if (!deepEqual(ao[k], bo[k])) return false;
		}
		return true;
	}
	return false;
}
