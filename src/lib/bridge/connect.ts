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
 * The wiring, and the handles it drives. Bind each surface to the property of the
 * same name and spread the props onto it:
 *
 * ```svelte
 * const bridge = connect({ session, doc });
 * <VisualEditor bind:this={bridge.editor} {doc} {quill} {...bridge.editorProps} />
 * <Preview bind:this={bridge.preview} {session} {...bridge.previewProps} />
 * <SourceView bind:this={bridge.source} {doc} />
 * ```
 *
 * The handles are plain properties because that is what `bind:this` assigns to,
 * and they are read at call time, so a surface that mounts later is wired the
 * moment it does.
 */
export interface Connection {
	editor?: EditorHandle;
	preview?: PreviewHandle;
	source?: SourceHandle;
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
			bridge.preview?.refresh(change);
			bridge.source?.refresh();
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
		editor: undefined,
		preview: undefined,
		source: undefined,
		editorProps: {
			onChange(change) {
				if (change.source === 'structure') apply();
				else schedule();
			},
			// The editor emits the preview's own argument, so this is the hop and not
			// a translation of it.
			onCaretMove(at) {
				bridge.preview?.focusPosition(at);
			}
		},
		previewProps: {
			onCaretPick(hit) {
				bridge.editor?.setCaret(hit);
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
