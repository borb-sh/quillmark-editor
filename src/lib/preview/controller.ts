// `createPreview` wires paint.ts + overlay.ts + bridge.ts over one `LiveSession`
// and `opts.container`, and is the only thing that composes them: the paint
// loop owns the page slots; overlay and bridge attach their own DOM/listeners
// to those same slots. A pure view — never calls `session.apply`, never
// mutates the session; the consumer drives edits and hands the resulting
// `ChangeSet` to `refresh`.
import type { LiveSession, ChangeSet, CorpusHit } from '../core/index.js';
import { createPaintLoop, type PaintLoop } from './paint.js';
import { createOverlay, type OverlayController } from './overlay.js';
import { createBridge, type BridgeController } from './bridge.js';

export interface PreviewOptions {
	/** The element the preview mounts into — becomes the scroll viewport. */
	container: HTMLElement;
	/** Pages kept painted beyond the visible band. Default 1. */
	margin?: number;
	/** Draw field-box overlays. Default true. */
	overlays?: boolean;
	/** A click resolved to a corpus position; the hook does not fire off-ink. */
	onCaretPick?(hit: CorpusHit): void;
}

export interface PreviewController {
	/** Repaint `dirtyPages ∩ visible` and re-read geometry — the only apply-driven hop. */
	refresh(change: ChangeSet): void;
	/** Scroll `field`'s first box into view and ring it. */
	scrollToField(field: string): void;
	/** Scroll the caret at `field`/`pos` into view and ring its field. */
	focusPosition(field: string, pos: number): void;
	/** Fold a density multiplier into every future paint (crispness, not layout). */
	setZoom(scale: number): void;
	destroy(): void;
}

const EMPTY_CLASS = 'qm-preview-empty';
const CONTAINER_CLASS = 'qm-preview';

export function createPreview(session: LiveSession, opts: PreviewOptions): PreviewController {
	const container = opts.container;
	const margin = opts.margin ?? 1;
	const overlaysEnabled = opts.overlays ?? true;
	container.classList.add(CONTAINER_CLASS);

	// The paint loop is safe to construct at any page count: zero pages reconciles
	// to zero slots and never calls the `paint`/`pageSize` verbs the boundary
	// refuses there (BOUNDARY_NOTES). What it must NOT do at zero pages is query
	// geometry — so overlay (`session.regions()` at build) and bridge are held
	// until slots actually exist, (re)built by `refresh` when the count crosses 0.
	const paintLoop: PaintLoop = createPaintLoop(session, container, margin);
	let overlay: OverlayController | undefined;
	let bridge: BridgeController | undefined;

	// The empty-state element, shown whenever the LIVE page count is 0 — at
	// construction (an empty seed) OR after an `apply` drops back to 0. Toggled,
	// never a permanent branch: the old code returned a stub controller here whose
	// `refresh` ignored every later `ChangeSet`, so a session that opened empty and
	// later compiled pages stayed stuck on this message forever, and the N→0
	// direction left a blank container instead of the message.
	let empty: HTMLElement | undefined;
	function showEmpty(): void {
		if (empty) return;
		empty = document.createElement('div');
		empty.className = EMPTY_CLASS;
		empty.textContent = 'No pages to preview.';
		container.appendChild(empty);
	}
	function hideEmpty(): void {
		empty?.remove();
		empty = undefined;
	}

	// overlay/bridge live and die with the slot set. Rebuilt (not patched) whenever
	// the count changes: the slots array is a stable identity but its members are
	// swapped on reconcile, and both attach DOM/listeners per slot.
	function attach(): void {
		overlay = overlaysEnabled ? createOverlay(session, paintLoop.slots) : undefined;
		bridge = createBridge(session, paintLoop.slots, opts.onCaretPick);
	}
	function detach(): void {
		overlay?.destroy();
		bridge?.destroy();
		overlay = undefined;
		bridge = undefined;
	}

	if (paintLoop.slots.length > 0) attach();
	else showEmpty();

	return {
		refresh(change) {
			const countChanged = change.pageCount !== paintLoop.slots.length;
			paintLoop.refresh(change.dirtyPages, change.pageCount);
			if (change.pageCount === 0) {
				// Dropped to (or held at) zero pages — tear the geometry attachments
				// down and surface the empty state.
				detach();
				showEmpty();
				return;
			}
			hideEmpty();
			if (countChanged || !bridge) {
				// The slot set moved under overlay/bridge's feet (pages added/removed,
				// or we are leaving the empty state) — rebuild both against the
				// reconciled slots rather than patch a stale snapshot in place.
				detach();
				attach();
			} else {
				// Box positions can still shift within the same page set (text
				// reflow), so geometry is always re-read, not just dirty pages.
				overlay?.refresh();
			}
		},
		scrollToField(field) {
			bridge?.scrollToField(field);
			overlay?.setActiveField(field);
		},
		focusPosition(field, pos) {
			bridge?.focusPosition(field, pos);
			overlay?.setActiveField(field);
		},
		setZoom(scale) {
			paintLoop.setDensityZoom(scale);
		},
		destroy() {
			detach();
			paintLoop.destroy();
			hideEmpty();
			container.classList.remove(CONTAINER_CLASS);
		}
	};
}
