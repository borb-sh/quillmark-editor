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

	// pageCount is immutable for one compile but can change on a later `apply`;
	// zero pages is the one shape `paint`/`pageSize` refuse (BOUNDARY_NOTES), so
	// branch before ever constructing the paint loop.
	if (session.pageCount === 0) {
		const empty = document.createElement('div');
		empty.className = EMPTY_CLASS;
		empty.textContent = 'No pages to preview.';
		container.appendChild(empty);
		return {
			refresh() {},
			scrollToField() {},
			focusPosition() {},
			setZoom() {},
			destroy() {
				empty.remove();
				container.classList.remove(CONTAINER_CLASS);
			}
		};
	}

	const paintLoop: PaintLoop = createPaintLoop(session, container, margin);
	let overlay: OverlayController | undefined = overlaysEnabled
		? createOverlay(session, paintLoop.slots)
		: undefined;
	let bridge: BridgeController = createBridge(session, paintLoop.slots, opts.onCaretPick);

	return {
		refresh(change) {
			const countChanged = change.pageCount !== paintLoop.slots.length;
			paintLoop.refresh(change.dirtyPages, change.pageCount);
			if (countChanged) {
				// The slot set moved under overlay/bridge's feet (pages added or
				// removed) — rebuild both against the reconciled slots rather than
				// patch a stale snapshot in place.
				overlay?.destroy();
				bridge.destroy();
				overlay = overlaysEnabled ? createOverlay(session, paintLoop.slots) : undefined;
				bridge = createBridge(session, paintLoop.slots, opts.onCaretPick);
			} else {
				// Box positions can still shift within the same page set (text
				// reflow), so geometry is always re-read, not just dirty pages.
				overlay?.refresh();
			}
		},
		scrollToField(field) {
			bridge.scrollToField(field);
			overlay?.setActiveField(field);
		},
		focusPosition(field, pos) {
			bridge.focusPosition(field, pos);
			overlay?.setActiveField(field);
		},
		setZoom(scale) {
			paintLoop.setDensityZoom(scale);
		},
		destroy() {
			bridge.destroy();
			overlay?.destroy();
			paintLoop.destroy();
			container.classList.remove(CONTAINER_CLASS);
		}
	};
}
