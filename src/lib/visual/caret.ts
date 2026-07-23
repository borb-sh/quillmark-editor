// The editor→preview half of the caret bridge, as one pure helper (Phase 5,
// VISUAL_EDITOR §Editor→preview). The VisualEditor emits `onCaretMove(addr, pos)`
// with a plain `Addr` (`{card?: content-index, field?}`) and a USV caret; the
// preview's `focusPosition(field, pos)` wants the canonical `DocPath` field
// address (`main.<field>` / `main.body` / `cards.<kind>[<i>].<field>`, the grammar
// that keys `session.regions()` / `fieldBoxes` / `locate`). This builds it with
// the boundary's own `formatDocPath` — the inverse of the `parseDocPath` route
// `diagnostics.ts` and `VisualEditor`'s `leafKeyForHit` consume. The USV `pos`
// needs no codec hop — it is already the shared content coordinate `focusPosition`
// takes; only the address is translated here.
//
// It lives at the CONSUMER seam, not inside the editor: the VisualEditor stays
// unaware of the preview (the two headline surfaces are deliberately independent),
// so the split shell calls this in its `onCaretMove` handler.
import { formatDocPath, type Addr, type DocPathSeg } from '../core/index.js';

/**
 * Map an editor `Addr` (`card` an ABSOLUTE document-array index) to the preview's
 * canonical `DocPath` field address, or `undefined` when `addr.card` is out of the
 * live `kinds` array (a stale address — drop it rather than mis-target). `kinds`
 * is the kind of each composable card by content index (`doc.cards.map(c =>
 * c.kind)`), read only to name the card segment (`cards.<kind>[i]`, or `cards[i]`
 * for an unknown/blank kind); the index is the addr's own — no per-kind counting,
 * since `DocPath` (0.96.0) addresses cards by document-array index.
 *
 * - `{}`               → `"main.body"`
 * - `{field}`          → `"main.<field>"`
 * - `{card: i}`        → `"cards.<kind>[i].body"`
 * - `{card: i, field}` → `"cards.<kind>[i].<field>"`
 */
export function fieldPathForAddr(addr: Addr, kinds: readonly string[]): string | undefined {
	let head: DocPathSeg;
	if (addr.card == null) {
		head = { seg: 'main' };
	} else {
		const i = addr.card;
		if (!Number.isInteger(i) || i < 0 || i >= kinds.length) return undefined;
		head = { seg: 'card', kind: kinds[i] || null, index: i };
	}
	const tail: DocPathSeg =
		addr.field != null ? { seg: 'field', name: addr.field } : { seg: 'body' };
	return formatDocPath([head, tail]);
}
