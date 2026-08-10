// The anchor for a surface with no element to anchor to: a live reference to what
// the surface floats over, never a rect measured off it. A range of text is that
// case; every other surface passes its own element.
//
// `contextElement` is why this is a named type rather than an object literal per call
// site. floating-ui's `autoUpdate` tracks a DOM element: overflow ancestors for
// scroll, a `ResizeObserver` on the reference, a layout-shift observer. Its
// `unwrapElement` reaches one from a virtual anchor only through `contextElement`, so
// dropping the field skips all three, leaving the floating element's own listeners,
// which for a surface portalled to `[data-qm-root]` need not share a scroll container
// with the editor at all.
import type { EditorView } from 'prosemirror-view';

/** A floating-ui `Measurable` over a PM range, carrying the `contextElement`
 *  `autoUpdate` tracks in the range's place. */
export interface RangeAnchor {
	contextElement: Element;
	getBoundingClientRect: () => DOMRect;
}

/**
 * A virtual anchor over one PM range, measured when asked rather than when made.
 *
 * The measure is total. `coordsAtPos` reads layout, and layout can be gone: a
 * position the document has since invalidated, a leaf inside a collapsed section, a
 * view torn down between a scroll firing and the measure running. `autoUpdate` calls
 * this at moments none of its callers choose, so an unmeasurable anchor returns the
 * last rect that measured rather than throwing out of floating-ui's positioning pass.
 *
 * `from === to` is a caret, which is what the slash menu hangs off.
 */
export function rangeAnchor(view: EditorView, from: number, to: number): RangeAnchor {
	// Plain numbers, not a `DOMRect`: this runs at construction, and the codec's suite
	// is a `node` environment with no DOM in it. The `DOMRect` is minted in the measure,
	// which is a layout read and browser-only by construction.
	let last = { left: 0, top: 0, right: 0, bottom: 0 };
	return {
		contextElement: view.dom,
		getBoundingClientRect: () => {
			try {
				const a = view.coordsAtPos(from);
				const b = view.coordsAtPos(to);
				last = {
					left: Math.min(a.left, b.left),
					top: Math.min(a.top, b.top),
					right: Math.max(a.right, b.right),
					bottom: Math.max(a.bottom, b.bottom)
				};
			} catch {
				// unmeasurable: keep the last good rect
			}
			return new DOMRect(last.left, last.top, last.right - last.left, last.bottom - last.top);
		}
	};
}
