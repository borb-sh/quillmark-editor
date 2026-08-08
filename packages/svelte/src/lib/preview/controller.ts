// `createPreview` wires paint.ts + overlay.ts + bridge.ts over one `LiveSession`
// and `opts.container`, and is the only thing that composes them: the paint
// loop owns the page slots; overlay and bridge attach their own DOM/listeners
// to those same slots. A pure view: never calls `session.apply`, never
// mutates the session; the consumer drives edits and hands the resulting
// `ChangeSet` to `refresh`.
import type { LiveSession, ChangeSet } from '@quillmark/wasm';
import type { DocPath, Landing, Place } from '../core/address.js';
import { reportError, errorMessage, type EditorErrorHandler } from '../core/errors.js';
import { createPaintLoop, type PaintLoop } from './paint.js';
import { createOverlay, type OverlayController } from './overlay.js';
import { createBridge, type BridgeController } from './bridge.js';
import { mergePreviewStrings, type PreviewStringsInput } from './strings.js';

export interface PreviewOptions {
	/** The element the preview mounts into; becomes the scroll viewport. */
	container: HTMLElement;
	/** Pages kept painted beyond the visible band. Default 1. */
	margin?: number;
	/** Draw field-box overlays. Default true. */
	overlays?: boolean;
	/** A click resolved to an address ({@link Landing}): a caret where the compile
	 *  tracks the content under the point, the field alone where it tracks only the
	 *  placement. The hook does not fire where the compile tracks neither. */
	onPick?(at: Landing): void;
	/** A page paint the backend refused ({@link EditorErrorHandler}). The preview
	 *  shows its error message state either way; this routes it to an app's sink. */
	onError?: EditorErrorHandler;
	/** The three message-state strings, keyed and partial: unset keys take the
	 *  package's English. */
	strings?: PreviewStringsInput;
}

export interface PreviewController {
	/** Repaint `dirtyPages ∩ visible` and re-read geometry; the only apply-driven hop. */
	refresh(change: ChangeSet): void;
	/**
	 * Scroll `field`'s first box into view and bloom it. `false` when this compile
	 * places nothing at that address, which is a legitimate answer rather than a
	 * failure: the plate places plenty it does not track, and the preview carries no
	 * schema, so it cannot tell that case from a field the host misnamed. The editor's
	 * `focusField` is what distinguishes them — it holds the mounted tree and reports
	 * `target-unknown` for a name it has no field for.
	 */
	scrollToField(field: DocPath): boolean;
	/**
	 * Bring the caret at `at` into view and bloom its field on arrival. Both halves
	 * are change-guarded: the pane moves only when the caret has left the fold, the
	 * bloom fires only on a change of address.
	 *
	 * Takes the editor's own `onCaretMove` payload, so the editor→preview half of
	 * the bridge is `onCaretMove={preview.focusPosition}` and translates nothing. A
	 * `ContentHit` carries both members and fits here too.
	 */
	focusPosition(at: Place): void;
	/** Fold a density multiplier into every future paint (crispness, not layout). */
	setZoom(scale: number): void;
	destroy(): void;
}

const CONTAINER_CLASS = 'qm-preview';
// The message states share one element; each carries `MESSAGE_CLASS` plus a
// state class so a consumer (and the tests) can target them. `EMPTY_CLASS` is
// the zero-page hook consumers and tests target.
const MESSAGE_CLASS = 'qm-preview-message';
const EMPTY_CLASS = 'qm-preview-empty';
const UNSUPPORTED_CLASS = 'qm-preview-unsupported';
const ERROR_CLASS = 'qm-preview-error';

export function createPreview(session: LiveSession, opts: PreviewOptions): PreviewController {
	const container = opts.container;
	const margin = opts.margin ?? 1;
	const overlaysEnabled = opts.overlays ?? true;
	const t = mergePreviewStrings(opts.strings);
	container.classList.add(CONTAINER_CLASS);

	// The full-container message slot, shared by every non-paint state: the empty
	// seed / drop-to-zero, a compile that cannot paint (`supportsCanvas` false),
	// and a paint that threw. One element, restamped; these states are mutually
	// exclusive, and the zero-page case keeps its `qm-preview-empty` hook.
	let message: HTMLElement | undefined;
	function showMessage(text: string, state: string): void {
		if (!message) {
			message = document.createElement('div');
			container.appendChild(message);
		}
		message.className = `${MESSAGE_CLASS} ${state}`;
		message.textContent = text;
	}
	function hideMessage(): void {
		message?.remove();
		message = undefined;
	}

	// The paint loop is safe at any page count: zero pages reconciles to zero
	// slots and never calls the `paint`/`pageSize` verbs the boundary refuses
	// there. A paint that unexpectedly throws is caught per-slot and surfaced
	// through the shared message rather than aborting the observer callback
	// mid-sweep (runtime.d.ts: even a `supportsCanvas` compile can hit a paint
	// the boundary refuses; brittle to leave uncaught).
	const paintLoop: PaintLoop = createPaintLoop(session, container, margin, (page, err) => {
		reportError(opts.onError, {
			code: 'paint-failed',
			severity: 'error',
			message: `painting page ${page} failed: ${errorMessage(err)}`,
			cause: err,
			page
		});
		showMessage(t.renderFailed, ERROR_CLASS);
	});
	// overlay/bridge query geometry at build (`session.regions()`), so they are
	// held until slots exist; (re)built by `render` when a compile is paintable.
	let overlay: OverlayController | undefined;
	let bridge: BridgeController | undefined;

	// overlay/bridge live and die with the slot set. Rebuilt (not patched) whenever
	// the count changes: the slots array is a stable identity but its members are
	// swapped on reconcile, and both attach DOM/listeners per slot.
	function attach(): void {
		overlay = overlaysEnabled ? createOverlay(session, paintLoop.slots) : undefined;
		bridge = createBridge(session, container, paintLoop.slots, opts.onPick);
	}
	function detach(): void {
		overlay?.destroy();
		bridge?.destroy();
		overlay = undefined;
		bridge = undefined;
	}

	// Reflect one compile's paintability into the DOM: page slots + overlay/bridge
	// when there is something to paint, the shared message otherwise. Called at
	// construction and after every `apply`, so `supportsCanvas` is re-read per
	// compile (runtime.d.ts: re-check after `open`) and a 0-page or non-canvas
	// compile that later gains paintable pages recovers; the check spans the
	// paint capability generally, not just the page count.
	function render(pageCount: number, dirtyPages: readonly number[]): void {
		if (!session.supportsCanvas || pageCount === 0) {
			// Nothing paintable: collapse slots, drop geometry attachments, say why.
			// A 0-page compile is a recoverable empty; a compile with pages the
			// boundary cannot raster is a genuine unsupported.
			paintLoop.refresh([], 0);
			detach();
			showMessage(
				pageCount === 0 ? t.noPages : t.unsupported,
				pageCount === 0 ? EMPTY_CLASS : UNSUPPORTED_CLASS
			);
			return;
		}
		// Read the count against the current slots BEFORE reconcile moves it, and
		// clear any prior message BEFORE painting so a paint that throws mid-refresh
		// leaves its error surfaced rather than have `hideMessage` clobber it.
		const countChanged = pageCount !== paintLoop.slots.length;
		hideMessage();
		paintLoop.refresh(dirtyPages, pageCount);
		if (countChanged || !bridge) {
			// The slot set moved under overlay/bridge's feet (pages added/removed,
			// or we are leaving a message state): rebuild both against the
			// reconciled slots rather than patch a stale snapshot in place.
			detach();
			attach();
		} else {
			// Box positions can still shift within the same page set (text reflow),
			// so geometry is always re-read, not just dirty pages.
			overlay?.refresh();
		}
	}

	render(session.pageCount, []);

	// The last place the editor put the caret, re-located after every recompile.
	// `session.locate` answers against the LAST COMPILED layout and a consumer
	// debounces `update`, so a caret typed past that layout's content is off-content
	// for the whole burst: `focusPosition` no-ops and the pane sits still, and a
	// caret event is otherwise the only thing that asks again. The re-locate is the
	// preview's, not the consumer's: the staleness sits between two session queries
	// this module owns both ends of.
	let followed: Place | undefined;

	return {
		refresh(change) {
			render(change.pageCount, change.dirtyPages);
			// Guarded like any other caret hop, so a caret already clear of the fold
			// leaves a pane the user scrolled where they left it.
			if (followed) bridge?.focusPosition(followed.field, followed.pos);
		},
		scrollToField(field) {
			const found = bridge?.scrollToField(field) ?? false;
			// Marked either way: a compile that gains the address later blooms it on the
			// rebuild, since the flash carries its own start time (`core/bloom.ts`).
			overlay?.flashField(field);
			return found;
		},
		focusPosition(at) {
			followed = at;
			bridge?.focusPosition(at.field, at.pos);
			overlay?.flashField(at.field);
		},
		setZoom(scale) {
			paintLoop.setDensityZoom(scale);
		},
		destroy() {
			detach();
			paintLoop.destroy();
			hideMessage();
			container.classList.remove(CONTAINER_CLASS);
		}
	};
}
