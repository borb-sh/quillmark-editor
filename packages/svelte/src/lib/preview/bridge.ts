// The click bridge: a click on a page slot resolves pixel -> PDF-pt (the EXACT
// inverse of overlay.ts's forward transform, both from geometry.ts) -> an address,
// surfaced through `onPick`. Also the
// editor->preview scroll commands (`scrollToField`/`focusPosition`), which
// place an ephemeral marker at the target's % position and measure it, reading
// the SAME percent geometry the overlay draws, so zoom and resize need no
// hand-rolled pixel offset of their own.
//
// The scroll itself is the SCROLLPORT's, written as `container.scrollTop`, not
// `marker.scrollIntoView()`: that walks every scrollable ancestor, so a host
// whose document scrolls (the playground below its split threshold) has the
// whole page dragged to the preview by a keystroke in the editor. The preview
// moves its own scrollport and nothing else, instantly: no `scroll-behavior` on
// the container means no motion for a reduced-motion term to cancel.
import type { LiveSession } from '@quillmark/wasm';
import type { Landing } from '../core/address.js';
import type { PageSlot } from './paint.js';
import {
	boxesForField,
	rectToPercent,
	clickToPdfPt,
	applyPercentRect,
	type PercentRect
} from './geometry.js';

export interface BridgeController {
	/** Scroll `field`'s first box to centre; `false` when this compile places none
	 *  for that address, which is the whole of what the preview can say about it. */
	scrollToField(field: string): boolean;
	/**
	 * Bring the caret rect at `field`/`pos` into view (a no-op off-content, and a
	 * no-op when it is already clear of the fold).
	 */
	focusPosition(field: string, pos: number): void;
	destroy(): void;
}

export function createBridge(
	session: LiveSession,
	container: HTMLElement,
	slots: readonly PageSlot[],
	onPick: ((at: Landing) => void) | undefined
): BridgeController {
	const unlisten: Array<() => void> = [];

	// TWO RUNGS: `positionAt` over span-tracked content, `fieldAt` over every placement
	// the compile tracks, a strict superset of it (PREVIEW.md §"Click bridge" carries
	// the measurement). The second fires where a field is placed without its content
	// being tracked, and the pick carries NO `pos` there: a fabricated `0` would be an
	// invented offset wearing a real one's type. No third rung hit-tests `regions()`,
	// whose rects bound ink the field does not fill.
	if (onPick) {
		for (const { page, el } of slots) {
			const handleClick = (ev: MouseEvent): void => {
				// Re-read through the live array: a same-count `refresh` swaps the
				// slot objects to re-cache `size`, and the click math must use the
				// current compile's PageSize, not the one captured at bridge build.
				const slot = slots[page];
				if (!slot) return;
				const box = slot.el.getBoundingClientRect();
				const px = ev.clientX - box.left;
				const py = ev.clientY - box.top;
				const pt = clickToPdfPt(px, py, box.width, box.height, slot.size);
				const hit = session.positionAt(slot.page, pt.x, pt.y);
				if (hit) return void onPick(hit);
				const field = session.fieldAt(slot.page, pt.x, pt.y);
				if (field) onPick({ field });
			};
			el.addEventListener('click', handleClick);
			unlisten.push(() => el.removeEventListener('click', handleClick));
		}
	}

	// Where the % rect `pct` on `slot` currently sits, in the scrollport's own
	// coordinates: a throwaway marker, measured and removed. Absolutely positioned,
	// so it displaces nothing and no layout survives the read.
	function measure(slot: PageSlot, pct: PercentRect): DOMRect {
		const marker = document.createElement('div');
		applyPercentRect(marker, pct);
		slot.el.appendChild(marker);
		const rect = marker.getBoundingClientRect();
		marker.remove();
		return rect;
	}

	// Centre `target` vertically in the scrollport; the cross axis takes the minimum
	// trip instead, since the container is a vertical scroller and only a page wider
	// than the port has anything to move there.
	function centre(target: DOMRect): void {
		const port = container.getBoundingClientRect();
		container.scrollTop += target.top + target.height / 2 - (port.top + port.height / 2);
		if (target.left < port.left) container.scrollLeft += target.left - port.left;
		else if (target.right > port.right) container.scrollLeft += target.right - port.right;
	}

	// Clear of the fold is the target's OWN height of clearance at each edge, not bare
	// intersection: a caret rect flush against one is visible and unusable, and the
	// next line typed lands past it. Derived from the target rather than a margin
	// dial, so it scales with zoom exactly as the caret does.
	function clearOfTheFold(target: DOMRect): boolean {
		const port = container.getBoundingClientRect();
		return target.top - target.height >= port.top && target.bottom + target.height <= port.bottom;
	}

	return {
		scrollToField(field) {
			const box = boxesForField(field, session.fieldBoxes(field), session.regions())[0];
			if (!box) return false;
			const slot = slots[box.page];
			if (!slot) return false;
			// A discrete act ("show me this field"), so it centres every time: the
			// asymmetry the bloom draws between a continuous signal and a one-shot one.
			centre(measure(slot, rectToPercent(box.rect, slot.size)));
			return true;
		},
		focusPosition(field, pos) {
			const region = session.locate(field, pos);
			if (!region) return;
			const slot = slots[region.page];
			if (!slot) return;
			// The CONTINUOUS hop: one call per keystroke and per arrow key, so it moves
			// the pane only when the caret has left the fold. Centring unconditionally
			// takes the scrollport back from the user on every one of them, including
			// the ones that changed nothing about where the caret already was.
			const target = measure(slot, rectToPercent(region.rect, slot.size));
			if (clearOfTheFold(target)) return;
			centre(target);
		},
		destroy() {
			for (const off of unlisten) off();
		}
	};
}
