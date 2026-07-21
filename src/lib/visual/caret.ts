// The editor→preview half of the caret bridge, as one pure helper (Phase 5,
// VISUAL_EDITOR §Editor→preview). The VisualEditor emits `onCaretMove(addr, pos)`
// with a plain `Addr` (`{card?: content-index, field?}`) and a USV caret; the
// preview's `focusPosition(field, pos)` wants the quill field-path GRAMMAR string
// (`$body` / `<field>` / `$cards.<kind>.<ordinal>[.<field>]`, verified against
// `session.regions()`). This is the mapping between them — the inverse of the
// grammar `diagnostics.ts`'s `parsePath` / `VisualEditor`'s `leafKeyForHit`
// consume, and the same per-kind ordinal `perKindCardIndex` resolves.
//
// It lives at the CONSUMER seam, not inside the editor: the VisualEditor stays
// unaware of the preview (the two headline surfaces are deliberately independent),
// so the split shell calls this in its `onCaretMove` handler. The USV `pos` needs
// no codec hop — it is already the shared content coordinate `focusPosition`
// takes; only the address is translated here.
import type { Addr } from '../core/index.js';

/**
 * Map an editor `Addr` to the preview's field-path grammar string, or `undefined`
 * when `addr.card` is out of the live `kinds` array (a stale address — drop it
 * rather than mis-target). `kinds` is the kind of each composable card by content
 * index (`doc.cards.map(c => c.kind)`), the array the ordinal is counted against.
 *
 * - `{}`                    → `"$body"`             (main body)
 * - `{field}`               → `"<field>"`           (a main field)
 * - `{card: i}`             → `"$cards.<kind>.<ord>"`         (a card body)
 * - `{card: i, field}`      → `"$cards.<kind>.<ord>.<field>"`(a card field)
 *
 * `<ord>` is the card's PER-KIND ordinal (fixture plate.typ: the absolute index
 * is not the ordinal once kinds interleave), matching the region grammar.
 */
export function fieldPathForAddr(addr: Addr, kinds: readonly string[]): string | undefined {
	if (addr.card == null) {
		return addr.field != null ? addr.field : '$body';
	}
	const i = addr.card;
	if (!Number.isInteger(i) || i < 0 || i >= kinds.length) return undefined;
	const kind = kinds[i];
	// Ordinal = how many same-kind cards precede this one.
	let ord = 0;
	for (let k = 0; k < i; k++) if (kinds[k] === kind) ord++;
	const base = `$cards.${kind}.${ord}`;
	return addr.field != null ? `${base}.${addr.field}` : base;
}
