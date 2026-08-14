// @vitest-environment jsdom
// The reorder, driven through the card's own control, and what the surface says
// about it. A card's address does not survive a `moveCard` — `Addr` and `DocPath`
// are both positional — so every card-naming payload carries the session `cardId`
// beside it (VISUAL_EDITOR §"The address is the spine"). What is asserted here is
// that the two disagree after the move and that the key is the one that stays
// right: the address a host captured before the reorder now names the other card,
// while the key still names the one that moved.
//
// The id-keyed commit-error map rides the same fact and is checked with it: a
// refused write pins a diagnostic to its field, and the diagnostic travels with the
// card rather than staying at the index.
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import type { Document, Quill } from '@quillmark/wasm';
import { addrForFieldPath } from '$lib/core';
import type { ActiveLeaf, EditorChange } from '$lib/visual';
import VisualEditor from '$lib/visual/VisualEditor.svelte';
import { quill } from '../helpers/fixtures.js';

/**
 * A document holding exactly two `section` cards: the blueprint seeds one card per
 * kind, so the others are dropped and a second section inserted beside the first.
 * A pair is the smallest stack a reorder is visible in.
 *
 * `section` is also the kind carrying the fixture's card-side `datetime`
 * (`reviewed_at`), which is the one commit a mounted control cannot satisfy: the V1
 * date control emits `YYYY-MM-DD` whatever the declared type, and a `datetime` field
 * coerces none of them (`edit::field_coercion_failed`). Every other control emits a
 * value its field accepts, so this is the door to the commit-error lane.
 */
function docWithTwoCards(q: Quill): Document {
	const doc = q.seedDocument();
	for (let i = doc.cardCount - 1; i >= 0; i--) {
		if (doc.card(i).kind !== 'section') doc.removeCard(i);
	}
	const card = q.seedCard('section', doc.seedOverlay('section'));
	if (!card) throw new Error('fixture drift: the quill seeds no section card');
	doc.insertCard(card, 1);
	return doc;
}

// jsdom implements neither, and a card operation reaches both: the insert/reorder
// scroll hop (`Card.scrollIntoViewCard`) and the flip the removal runs the survivors
// through (`motion.ts`). Stubbed rather than guarded in the source: both are chrome
// the surface is right to call unconditionally in a browser.
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.getAnimations ??= () => [];

let cleanup: (() => void) | undefined;
afterEach(() => {
	cleanup?.();
	cleanup = undefined;
});

function mountEditor(q: Quill, doc: Document) {
	const target = document.createElement('div');
	document.body.appendChild(target);
	const changes: EditorChange[] = [];
	const actives: ActiveLeaf[] = [];
	const app = mount(VisualEditor, {
		target,
		props: {
			doc,
			quill: q,
			onChange: (c: EditorChange) => changes.push(c),
			onActiveLeafChange: (a: ActiveLeaf) => actives.push(a)
		}
	});
	flushSync();
	cleanup = () => {
		void unmount(app);
		target.remove();
	};
	return { target, changes, actives };
}

/** The composable cards, in DOM order (the main card renders outside the slots). */
function slots(target: HTMLElement): HTMLElement[] {
	return [...target.querySelectorAll<HTMLElement>('.qm-card-slot')];
}
/** The leaf keys a card holds: `c<N>:$body` for a card body, so a slot names its card. */
function leafKeys(slot: HTMLElement): (string | null)[] {
	return [...slot.querySelectorAll('[data-leaf-key]')].map((e) => e.getAttribute('data-leaf-key'));
}
/** Focus a card's body leaf the way PM sees it: the focus handler is on the view's
 *  own element, and focus does not bubble. */
function focusBody(slot: HTMLElement): void {
	slot
		.querySelector('[data-leaf-key$="$body"] .ProseMirror')!
		.dispatchEvent(new FocusEvent('focus'));
	flushSync();
}
/** Fill a card's date control: one ArrowUp per segment completes the date, and the
 *  completed value is what the writer refuses. */
function fillDate(slot: HTMLElement): void {
	const segments = [...slot.querySelectorAll('[data-date-field-segment]')].filter(
		(s) => s.getAttribute('data-segment') !== 'literal'
	);
	for (const seg of segments) {
		seg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
		flushSync();
	}
}
/** A card's move-down control: the second of the reorder pair. */
function moveDown(slot: HTMLElement): void {
	slot.querySelectorAll<HTMLButtonElement>('.qm-card-reorder button')[1].click();
	flushSync();
}
/** A card's refused commit: the error lane. Every card the blueprint seeds also
 *  carries `must_fill` warnings, which are a different lane and a different claim. */
function refusal(slot: HTMLElement): HTMLElement | null {
	return slot.querySelector<HTMLElement>('.qm-diag-line[data-severity="error"]');
}
function removeCard(slot: HTMLElement): void {
	slot.querySelector<HTMLButtonElement>('.qm-card-delete')!.click();
	flushSync();
}

describe('a reorder through the card control', () => {
	it('moves the key with the card and leaves the address behind', () => {
		const q = quill();
		const doc = docWithTwoCards(q);
		const { target, changes, actives } = mountEditor(q, doc);
		expect(slots(target)).toHaveLength(2);

		// A host captures the active leaf: a path and a key, both naming the first card.
		focusBody(slots(target)[0]);
		const captured = actives.at(-1)!;
		expect(captured).toEqual({ field: 'cards.section[0].body', cardId: 'c0' });

		moveDown(slots(target)[0]);

		// The move reports both: where the card landed, and which card it was. The path
		// names the card, not the body leaf inside it: a card op is about the card.
		expect(changes.at(-1)).toEqual({
			source: 'structure',
			cardId: 'c0',
			path: 'cards.section[1]'
		});

		// The trap, pinned. The captured PATH now names the other card; the captured key
		// still names the one that moved, and the card is where the change said.
		const after = slots(target);
		const staleIndex = addrForFieldPath(captured.field)!.card!;
		expect(leafKeys(after[staleIndex])).toContain('c1:$body');
		expect(leafKeys(after[1])).toContain(`${captured.cardId}:$body`);
	});

	it('carries a refused commit with the card, not with the index', () => {
		const q = quill();
		const doc = docWithTwoCards(q);
		const { target } = mountEditor(q, doc);

		// The first card's date control refuses its own value: the diagnostic pins to
		// the field, and the document is unchanged (the write threw).
		fillDate(slots(target)[0]);
		expect(refusal(slots(target)[0])?.textContent).toContain('could not be coerced');
		expect(refusal(slots(target)[1])).toBeNull();

		moveDown(slots(target)[0]);

		// The map is keyed by session id, so the error goes where the card goes.
		const after = slots(target);
		expect(refusal(after[0])).toBeNull();
		expect(refusal(after[1])?.textContent).toContain('could not be coerced');
		expect(leafKeys(after[1])).toContain('c0:$body');
	});
});

describe('a removal', () => {
	it('names the card it removed, and no address', () => {
		const q = quill();
		const doc = docWithTwoCards(q);
		const { target, changes } = mountEditor(q, doc);

		removeCard(slots(target)[0]);

		// No address: the removed card has none left and every survivor's shifted. The
		// key is the whole payload, and the only handle a host keying on it has left.
		expect(changes.at(-1)).toEqual({ source: 'structure', cardId: 'c0', path: undefined });
		expect(slots(target)).toHaveLength(1);
		expect(leafKeys(slots(target)[0])).toContain('c1:$body');
	});
});
