// The wiring every consumer writes, written once. Three surfaces over one session
// need the same four hops — an edit lands, the session recompiles, the preview
// repaints what moved and the mirror re-serializes, and each caret crosses to the
// other surface — and every consumer that skips one of them gets a preview that
// lags, a mirror that goes stale, or a recompile on every arrow key.
//
// It does NOT couple the surfaces. Everything here is structural: the handles are
// the smallest interfaces that name the verbs used (`EditorHandle`,
// `PreviewHandle`, `SourceHandle`), so nothing imports `/visual` or `/preview`,
// the two surfaces stay mutually unaware, and a consumer with only a preview
// passes only a preview. What it owns is the SHELL's job, which is the layer the
// bridge always lived at; it is bundled rather than described because a
// hand-copied debounce is a hand-copied bug.
import type { ChangeSet, Document, LiveSession } from '../core/index.js';
import { reportError, type EditorErrorHandler } from '../core/errors.js';

/** A place in the content, as both surfaces speak it. */
interface Place {
	field: string;
	pos: number;
}

/** The VisualEditor, as the bridge uses it. */
export interface EditorHandle {
	setCaret(hit: Place): unknown;
}
/** The preview, as the bridge uses it. */
export interface PreviewHandle {
	refresh(change: ChangeSet): void;
	focusPosition(at: Place): void;
}
/** The source mirror, as the bridge uses it. */
export interface SourceHandle {
	refresh(): void;
}

/** An edit that landed, as the editor reports it. */
interface Change {
	source: 'prose' | 'field' | 'structure';
}

export interface ConnectOptions {
	session: LiveSession;
	doc: Document;
	/**
	 * The surfaces, as GETTERS over the consumer's own handles. Getters rather than
	 * values because the handles do not exist yet when this is called — the surfaces
	 * mount after — and rather than properties on the returned object because a
	 * consumer holding that object in framework state hands its own code a PROXY,
	 * and a `bind:this` through one writes where this closure cannot read. Bind to
	 * your own variable and point a getter at it: one arrow, and no reactivity
	 * system in the middle of the wiring.
	 */
	editor?: () => EditorHandle | undefined;
	preview?: () => PreviewHandle | undefined;
	source?: () => SourceHandle | undefined;
	/**
	 * How long a burst settles before the recompile, in ms. Default 120. A
	 * `structure` change never waits: it is one gesture, not a burst, and the card
	 * that moved should be on the page by the time the pointer leaves it.
	 */
	debounce?: number;
	/** Every recompile's `ChangeSet`, for a host reading dirty pages or driving its
	 *  own state off the compile. */
	onApply?: (change: ChangeSet) => void;
	/** A recompile that threw. The session is transactional, so the last good
	 *  preview stays; absent → the console. */
	onError?: EditorErrorHandler;
}

/**
 * The wiring: the props to spread, and the two verbs a host drives it with.
 *
 * ```svelte
 * let editorRef = $state<VisualEditor>();
 * let previewRef = $state<Preview>();
 * const bridge = connect({ session, doc, editor: () => editorRef, preview: () => previewRef });
 *
 * <VisualEditor bind:this={editorRef} {doc} {quill} {...bridge.editorProps} />
 * <Preview bind:this={previewRef} {session} {...bridge.previewProps} />
 * ```
 *
 * The getters are read at call time, so a surface that mounts late is wired the
 * moment it does, and one that never mounts is skipped.
 */
export interface Connection {
	/** Spread onto the VisualEditor. */
	readonly editorProps: {
		onChange(change: Change): void;
		onCaretMove(at: Place): void;
	};
	/** Spread onto the Preview. */
	readonly previewProps: {
		onCaretPick(hit: Place): void;
	};
	/** Recompile NOW, and drop any pending one: what a consumer calls after
	 *  mutating the document itself (an import, an undo, its own card verb). */
	flush(): void;
	/** Drop a pending recompile. Call on teardown, so a timer never fires against a
	 *  freed session. */
	destroy(): void;
}

export function connect(opts: ConnectOptions): Connection {
	const wait = opts.debounce ?? 120;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let destroyed = false;

	function apply(): void {
		if (timer != null) clearTimeout(timer);
		timer = undefined;
		if (destroyed) return;
		try {
			const change = opts.session.apply(opts.doc);
			// The preview repaints `dirtyPages ∩ visible`; an apply over an unchanged
			// document is a cheap no-op with an empty dirty set, so a caret-only pass
			// costs a geometry re-read and no paint.
			opts.preview?.()?.refresh(change);
			opts.source?.()?.refresh();
			opts.onApply?.(change);
		} catch (e) {
			reportError(opts.onError, {
				code: 'apply',
				message: 'recompile failed; the last good preview stands',
				cause: e
			});
		}
	}

	function schedule(): void {
		if (timer != null) clearTimeout(timer);
		timer = setTimeout(apply, wait);
	}

	const bridge: Connection = {
		editorProps: {
			onChange(change) {
				if (change.source === 'structure') apply();
				else schedule();
			},
			// The editor emits the preview's own argument, so this is the hop and not
			// a translation of it.
			onCaretMove(at) {
				opts.preview?.()?.focusPosition(at);
			}
		},
		previewProps: {
			onCaretPick(hit) {
				opts.editor?.()?.setCaret(hit);
			}
		},
		flush: apply,
		destroy() {
			destroyed = true;
			if (timer != null) clearTimeout(timer);
			timer = undefined;
		}
	};
	return bridge;
}
