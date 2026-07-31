// `createPreview` wires paint.ts + overlay.ts + bridge.ts over one `LiveSession`
// and `opts.container`, and is the only thing that composes them: the paint
// loop owns the page slots; overlay and bridge attach their own DOM/listeners
// to those same slots. A pure view: never calls `session.apply`, never
// mutates the session; the consumer drives edits and hands the resulting
// `ChangeSet` to `refresh`.
import type { LiveSession, ChangeSet, ContentHit } from '../core/index.js';
import { reportError, type EditorErrorHandler } from '../core/errors.js';
import { createPaintLoop, type PaintLoop } from './paint.js';
import { createOverlay, type OverlayController } from './overlay.js';
import { createBridge, type BridgeController } from './bridge.js';

/**
 * A place in the content: the canonical `DocPath` field address and a USV
 * position. Declared STRUCTURALLY rather than imported, which is what keeps the
 * two surfaces mutually unaware (`/preview` reaches `/core` and nothing else):
 * the preview's own `ContentHit` and the editor's `onCaretMove` payload both fit
 * it, so the caret bridge is a pass-through in both directions.
 */
export interface CaretTarget {
	/** `main.subject` / `main.body` / `cards.<kind>[i].<field>`. */
	field: string;
	/** The caret in USV. */
	pos: number;
}

/**
 * The preview's own words: its three message states, which are the only text it
 * renders. Same shape as the editor's `strings` (a `Partial`, merged over the
 * package's English), so a consumer wires one wording contract per surface rather
 * than one per string.
 */
/** A state the preview is IN instead of painting. `null` is painting. */
export type PreviewState = 'empty' | 'unsupported' | 'error';

export interface PreviewStrings {
	/** A compile with zero pages: recoverable, and the state a seeded document opens in. */
	empty: string;
	/** A compile whose pages the backend cannot raster at all. */
	unsupported: string;
	/** A page that threw mid-paint. */
	error: string;
}

/** The package's own words, to compose against rather than restate. */
export const DEFAULT_PREVIEW_STRINGS: PreviewStrings = {
	empty: 'No pages to preview.',
	unsupported: 'Preview is not available for this document.',
	error: 'Preview failed to render.'
};

export interface PreviewOptions {
	/** The element the preview mounts into; becomes the scroll viewport. */
	container: HTMLElement;
	/** Pages kept painted beyond the visible band. Default 1. */
	margin?: number;
	/** Draw field-box overlays. Default true. */
	overlays?: boolean;
	/** A click resolved to a content position; the hook does not fire off-ink. */
	onCaretPick?(hit: ContentHit): void;
	/** Paint failures, which the preview recovers from by showing its message
	 *  state; absent → the console (`core/errors.ts`). */
	onError?: EditorErrorHandler;
	/** The message states' wording; unset keys take the package's English. */
	strings?: Partial<PreviewStrings>;
	/**
	 * Told whenever the preview enters or leaves a message state (`null` while it
	 * paints). The seam a host draws its own empty state through: a vanilla core
	 * cannot take a Svelte snippet, so it reports the state and lets the layer that
	 * can render it do so ({@link PreviewOptions.messages}).
	 */
	onState?(state: PreviewState | null): void;
	/**
	 * Draw the built-in message element. Default true; `false` reports the state
	 * through {@link PreviewOptions.onState} and draws nothing, which is what
	 * `<Preview>` passes when the consumer gave it a `message` snippet.
	 */
	messages?: boolean;
}

export interface PreviewController {
	/** Repaint `dirtyPages ∩ visible` and re-read geometry; the only apply-driven hop. */
	refresh(change: ChangeSet): void;
	/** Scroll `field`'s first box into view and bloom it. */
	scrollToField(field: string): void;
	/** Scroll the caret at `at.field`/`at.pos` into view and bloom its field on
	 *  arrival. `onCaretMove={preview.focusPosition}` is the editor→preview half of
	 *  the bridge; a `ContentHit` fits too. */
	focusPosition(at: CaretTarget): void;
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
	const words: PreviewStrings = { ...DEFAULT_PREVIEW_STRINGS, ...opts.strings };
	container.classList.add(CONTAINER_CLASS);

	// The full-container message slot, shared by every non-paint state: the empty
	// seed / drop-to-zero, a compile that cannot paint (`supportsCanvas` false),
	// and a paint that threw. One element, restamped; these states are mutually
	// exclusive, and the zero-page case keeps its `qm-preview-empty` hook.
	let message: HTMLElement | undefined;
	// The state is reported whether or not it is drawn: a host that draws its own
	// still needs to know, and a host that draws none still gets the class hook.
	let state: PreviewState | null = null;
	function showMessage(text: string, cls: string, next: PreviewState): void {
		if (opts.messages !== false) {
			if (!message) {
				message = document.createElement('div');
				container.appendChild(message);
			}
			message.className = `${MESSAGE_CLASS} ${cls}`;
			message.textContent = text;
		}
		if (state !== next) {
			state = next;
			opts.onState?.(next);
		}
	}
	function hideMessage(): void {
		message?.remove();
		message = undefined;
		if (state !== null) {
			state = null;
			opts.onState?.(null);
		}
	}

	// The paint loop is safe at any page count: zero pages reconciles to zero
	// slots and never calls the `paint`/`pageSize` verbs the boundary refuses
	// there. A paint that unexpectedly throws is caught per-slot and surfaced
	// through the shared message rather than aborting the observer callback
	// mid-sweep (runtime.d.ts: even a `supportsCanvas` compile can hit a paint
	// the boundary refuses; brittle to leave uncaught).
	const paintLoop: PaintLoop = createPaintLoop(session, container, margin, (page, err) => {
		reportError(opts.onError, {
			code: 'paint',
			message: `preview paint failed for page ${page}`,
			cause: err,
			page
		});
		showMessage(words.error, ERROR_CLASS, 'error');
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
		bridge = createBridge(session, paintLoop.slots, opts.onCaretPick);
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
				pageCount === 0 ? words.empty : words.unsupported,
				pageCount === 0 ? EMPTY_CLASS : UNSUPPORTED_CLASS,
				pageCount === 0 ? 'empty' : 'unsupported'
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

	return {
		refresh(change) {
			render(change.pageCount, change.dirtyPages);
		},
		scrollToField(field) {
			bridge?.scrollToField(field);
			overlay?.flashField(field);
		},
		focusPosition(at) {
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
