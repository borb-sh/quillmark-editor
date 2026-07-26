// The prose leaf — `createField` (VISUAL_EDITOR §Surface). One content field, one
// PM `EditorState`/`EditorView`, wired to the WASM edit surface. It reads the
// leaf's `Content`, decodes to a PM state, mounts a view + plugin stack (history,
// keymap, input rules, the anchor-position plugin), and `dispatchTransaction`:
//   (a) apply optimistically to the view,
//   (b) lower the tr to a `ChangeBundle` (or `install` for island creation, the
//       one structural edit the op vocabulary cannot represent),
//   (c) commit via `doc.applyChange(addr, bundle)`,
//   (d) fire `onCaretMove` with the new USV caret.
// On an `applyChange` throw the optimistic PM state stays and the error is logged
// — never a crash. Caret continuity across own-edits is the PM `StepMap`; an
// EXTERNAL content change re-hydrates through `applyExternal`, gated by `reconcile`.
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import type { Node as PMNode, Schema } from 'prosemirror-model';
import { EditorState, Plugin, PluginKey, Selection, type Command } from 'prosemirror-state';
import { Decoration, DecorationSet, EditorView } from 'prosemirror-view';
import type { Document, Content, Addr } from '../index.js';
import { decode } from './decode.js';
import { usvToPM, pmToUsv, buildLineIndex, type LineIndex } from './positions.js';
import { lower, pmToContent, insertReintroducesIslandSlot } from './encode.js';
import { anchorsFromContent, type AnchorPos } from './marks.js';
import { createReconciler, type Reconciler } from './reconcile.js';
import { inputRulesPlugin } from './inputrules.js';
import { listKeymap } from './lists.js';
import { blockSchema, inlineSchema } from './schema.js';

/** Options for {@link createField}. */
export interface CreateFieldOpts {
	doc: Document;
	addr: Addr;
	container: HTMLElement;
	/** Constrained single-textblock schema (a `richtext(inline)` field). */
	inline?: boolean;
	/** Inline + marks/islands stripped (a `plaintext` field). Implies `inline`. */
	plaintext?: boolean;
	/** Suppress the markdown-shorthand input rules (Phase 4 opt-out). */
	noInputRules?: boolean;
	/** Accessible name → `aria-label` on the `contenteditable` (the visual label is a sibling it can't reference). */
	label?: string;
	/** Ghost text shown on the empty leaf — the resolved `default:` a body ghosts
	 * (VISUAL_EDITOR_UIUX §Fields). Captured at mount (a schema default is stable);
	 * an empty/absent string adds no placeholder. */
	placeholder?: string;
	onFocus?(addr: Addr): void;
	/** Fired with the new USV caret after an edit or a selection move. */
	onCaretMove?(addr: Addr, pos: number): void;
}

/** The prose-leaf handle (VISUAL_EDITOR §Surface). */
export interface FieldController {
	/** Place the caret at USV `pos` (preview onCaretPick → usvToPM → here). */
	setCaret(pos: number): void;
	/** External content change → re-hydrate this leaf (gated by reconcile). */
	applyExternal(): void;
	focus(): void;
	/** The current stored content for this addr (for tests / reconcile). */
	getContent(): Content;
	/**
	 * Insert an identity anchor `id` at USV `pos` (issue #43) — the seam that gives
	 * `anchor` the toggle the six formatting marks have. Zero-width; it folds into the
	 * plugin's position set and commits through the mark-diff `anchor` op, so it
	 * survives later edits like any anchor. The id is caller-supplied and must be
	 * unique + invariant (the 0.97 anchor-id policy); a duplicate id is a no-op.
	 */
	insertAnchor(id: string, pos: number): void;
	/** Remove the identity anchor `id` (the inverse of {@link insertAnchor}); a no-op if absent. */
	removeAnchor(id: string): void;
	/** Ids of the anchors within USV range `[from, to]` — a selection's anchor state. */
	anchorsInRange(from: number, to: number): string[];
	/** The current PM selection as a USV `{ from, to }` range (the boundary currency). */
	selectionRange(): { from: number; to: number };
	destroy(): void;
}

const anchorKey = new PluginKey<AnchorPos[]>('quill-anchors');

/** An anchor mutation carried on a transaction's `anchorKey` meta — the seam that
 * folds a new identity anchor (or a removal) into the plugin's position set, so
 * the next commit lowers it through the mark diff exactly as a toggled formatting
 * mark does (issue #43). Ids are caller-supplied, unique, invariant (the 0.97
 * anchor-id policy); `pos` is a PM position. */
type AnchorEdit = { op: 'add'; id: string; pos: number } | { op: 'remove'; id: string };

/** Plugin-held anchor positions (PM coords), mapped through every edit's `StepMap`
 * and mutated by an {@link AnchorEdit} meta (an insert/remove at a selection). */
function anchorPlugin(seed: AnchorPos[]): Plugin<AnchorPos[]> {
	return new Plugin<AnchorPos[]>({
		key: anchorKey,
		state: {
			init: () => seed,
			apply: (tr, anchors) => {
				let next = tr.docChanged
					? anchors.map((a) => ({ id: a.id, pos: tr.mapping.map(a.pos) }))
					: anchors;
				const edit = tr.getMeta(anchorKey) as AnchorEdit | undefined;
				if (edit?.op === 'add') next = [...next, { id: edit.id, pos: edit.pos }];
				else if (edit?.op === 'remove') next = next.filter((a) => a.id !== edit.id);
				return next;
			}
		}
	});
}

/** Read the leaf's raw stored `Content` for `addr` — the unified `doc.getStored(addr)`
 * read (DOCUMENT_MODEL): a field value, or the body `Content` when `addr.field` is
 * absent, without materializing the whole card. Reads are total over the field
 * axis, so an absent field — a default-only richtext field (e.g. `tag_line`, no
 * stored value until first edited) — reads `undefined`; decode an empty content
 * rather than crash, and the first edit installs it. Only an out-of-range
 * `addr.card` throws, unreachable here: a removed card unmounts its keyed leaf
 * before a stale index is read. */
function readLeaf(doc: Document, addr: Addr): Content {
	return (doc.getStored(addr) as Content | undefined) ?? emptyContent();
}

/** The canonical empty `Content` — one empty `para` line. The zero value a prose
 * leaf (or an array's prose element) seeds from. */
export function emptyContent(): Content {
	return { text: '', lines: [{ containers: [], kind: 'para' }], marks: [], islands: [] };
}

/** Whether the leaf's field currently holds a stored value — `doc.getStored` is total, so
 * an unset field reads `undefined`; a body always reads its `Content` (present). */
function leafPresent(doc: Document, addr: Addr): boolean {
	return doc.getStored(addr) !== undefined;
}

export function createField(opts: CreateFieldOpts): FieldController {
	const { doc, addr, container } = opts;
	const inline = !!opts.inline || !!opts.plaintext;
	const plaintext = !!opts.plaintext;
	const schema: Schema = inline ? inlineSchema : blockSchema;

	// `known` is the codec's view of the stored content — kept in sync after every
	// own-edit so `reconcile` can tell an external change from the field's own.
	const reconciler: Reconciler = createReconciler(readLeaf(doc, addr));

	let index: LineIndex; // rebuilt on every structural change
	let view: EditorView;

	const state = buildState(reconciler.last);
	index = buildLineIndex(state.doc);

	view = new EditorView(container, {
		state,
		attributes: opts.label ? { 'aria-label': opts.label } : undefined,
		dispatchTransaction: (tr) => {
			const oldRt = reconciler.last;
			const next = view.state.apply(tr);
			view.updateState(next); // (a) optimistic
			index = buildLineIndex(next.doc);

			// Commit a content edit OR an anchor mutation. An anchor insert/remove is
			// zero-width, so `docChanged` is false — the `anchorKey` meta is what
			// routes it through the same commit path (the diff emits the anchor op).
			if (tr.docChanged || tr.getMeta(anchorKey)) {
				commitEdit(oldRt, next.doc);
			}
			// (d) caret — for both structural and selection-only changes.
			opts.onCaretMove?.(addr, pmToUsv(index, next.selection.head));
		},
		handleDOMEvents: {
			focus: () => {
				opts.onFocus?.(addr);
				return false;
			}
		}
	});

	function buildState(rt: Content): EditorState {
		const pmDoc: PMNode = decode(rt, schema, { plaintext });
		const anchors = plaintext ? [] : anchorsFromContent(rt);
		// Seed anchor plugin positions in PM coords via a fresh index over pmDoc.
		const seedIndex = buildLineIndex(pmDoc);
		const seededAnchors = anchors.map((a) => ({
			id: a.id,
			pos: usvToPM(seedIndex, a.pos)
		}));
		return EditorState.create({
			doc: pmDoc,
			plugins: proseLeafPlugins(schema, {
				inline,
				plaintext,
				noInputRules: opts.noInputRules,
				placeholder: opts.placeholder,
				afterHistory: [anchorPlugin(seededAnchors)]
			})
		});
	}

	// (b)+(c): lower the edit to ops and commit — or `install` for a structural
	// edit the op vocabulary cannot express. Keep the optimistic PM on throw.
	function commitEdit(oldRt: Content, newDoc: PMNode): void {
		const newRt = pmToContent(newDoc);
		try {
			// `applyChange` throws on an absent declared field (verified), so the FIRST
			// edit to one installs the value (creating it — no prior anchors to lose);
			// island creation is the other install case (`insertReintroducesIslandSlot`).
			if (!leafPresent(doc, addr) || insertReintroducesIslandSlot(oldRt, newRt)) {
				doc.install(addr, newRt); // create-or-structural fallback; pays this field's anchors
			} else {
				// Pre-edit anchors are the stored content's anchors (USV); post-edit
				// anchors are the plugin's positions (mapped through the tr) as USV.
				const oldAnchors = plaintext ? [] : anchorsFromContent(oldRt);
				const newAnchors = plaintext ? [] : readAnchorsUsv(newDoc);
				// `newRt` above is the projection `lower` diffs against — projecting the
				// doc a second time here would double the per-keystroke tree walk.
				doc.applyChange(addr, lower(oldRt, newRt, { oldAnchors, newAnchors }));
			}
			reconciler.commit(readLeaf(doc, addr));
		} catch (e) {
			// Bound the damage: an op path the gates missed leaves the store STALE
			// while PM keeps the edit — and because the reconciler then re-diffs
			// from that stale content, every later edit re-throws and the field
			// silently stops persisting. Install the full projection instead
			// (correct store, pays this field's anchors).
			console.error('[quillmark/editor] applyChange failed; falling back to install', e);
			try {
				doc.install(addr, newRt);
				reconciler.commit(readLeaf(doc, addr));
			} catch (e2) {
				// Optimistic PM stays; surface the boundary error without crashing.
				console.error('[quillmark/editor] install fallback failed; keeping optimistic state', e2);
			}
		}
	}

	/** The anchors the plugin currently holds (PM coords); `[]` before the first apply. */
	const heldAnchors = (): AnchorPos[] => anchorKey.getState(view.state) ?? [];

	/** Anchor positions in the CURRENT (new) doc, as USV. */
	function readAnchorsUsv(newDoc: PMNode): AnchorPos[] {
		return heldAnchors().map((a) => ({ id: a.id, pos: pmToUsv(index, a.pos) }));
	}

	const controller: FieldController = {
		setCaret(pos: number): void {
			const pm = usvToPM(index, pos);
			// `Selection.near`, not `TextSelection.create`: the mapped position can
			// be non-inline (before an island/rule block, or doc-level in an empty
			// nested textblock), where a raw TextSelection is invalid.
			const sel = Selection.near(view.state.doc.resolve(pm));
			view.dispatch(view.state.tr.setSelection(sel));
			view.focus();
		},
		applyExternal(): void {
			const current = readLeaf(doc, addr);
			if (!reconciler.shouldRehydrate(current)) return; // own edit / no change
			const caretUsv = pmToUsv(index, view.state.selection.head);
			const fresh = buildState(current);
			view.updateState(fresh);
			index = buildLineIndex(fresh.doc);
			// Best-effort caret continuity across an external change: keep the USV.
			const pm = usvToPM(index, caretUsv);
			view.dispatch(view.state.tr.setSelection(Selection.near(fresh.doc.resolve(pm))));
			reconciler.commit(current);
		},
		focus(): void {
			view.focus();
		},
		getContent(): Content {
			return readLeaf(doc, addr);
		},
		insertAnchor(id: string, pos: number): void {
			if (plaintext) return; // a plaintext field carries no marks (§Inline mode)
			if (heldAnchors().some((a) => a.id === id)) return; // ids are unique + invariant (0.97 policy)
			// An anchor commits through `applyChange` (present field); a still-unset
			// default-only field is materialized first, else the commit's create-branch
			// `install` — value semantics — would drop the just-added anchor.
			if (!leafPresent(doc, addr)) doc.install(addr, reconciler.last);
			const pm = usvToPM(index, pos);
			view.dispatch(view.state.tr.setMeta(anchorKey, { op: 'add', id, pos: pm } as AnchorEdit));
		},
		removeAnchor(id: string): void {
			if (plaintext) return;
			if (!heldAnchors().some((a) => a.id === id)) return; // absent — nothing to commit
			view.dispatch(view.state.tr.setMeta(anchorKey, { op: 'remove', id } as AnchorEdit));
		},
		anchorsInRange(from: number, to: number): string[] {
			return heldAnchors()
				.filter((a) => {
					const u = pmToUsv(index, a.pos);
					return u >= from && u <= to;
				})
				.map((a) => a.id);
		},
		selectionRange(): { from: number; to: number } {
			const { from, to } = view.state.selection;
			return {
				from: pmToUsv(index, from),
				to: pmToUsv(index, to)
			};
		},
		destroy(): void {
			view.destroy();
		}
	};
	// The underlying view is an available (undocumented) handle: Phase 4 composes
	// views into the VisualEditor, and tests drive edits through it.
	(controller as FieldController & { view: EditorView }).view = view;
	return controller;
}

/**
 * The prose-leaf plugin stack (VISUAL_EDITOR §Surface) — shared by
 * {@link createField} and the array-element inline editor (`ProseArrayElement`),
 * so the two never fork the keymap/plugin ordering. History first, then any
 * leaf-specific plugins (`afterHistory` — the addressed leaf passes its
 * anchor-position plugin; a by-value array element passes none), the
 * markdown-shorthand input rules, then the field keymap over the base keymap.
 *
 * A `plaintext` field carries no marks (decode strips them, the keymap suppresses
 * Mod-b/i/u), so it also skips the input rules: `inlineSchema` still declares the
 * mark types, so a `**bold**` rule would apply a strong mark AND eat the literal
 * delimiters. The inline schema has no block nodes, so those rules are the ONLY
 * ones it would add — skip all.
 */
export function proseLeafPlugins(
	schema: Schema,
	opts: {
		inline: boolean;
		plaintext: boolean;
		noInputRules?: boolean;
		placeholder?: string;
		afterHistory?: Plugin[];
	}
): Plugin[] {
	const list: Plugin[] = [history(), ...(opts.afterHistory ?? [])];
	if (!opts.noInputRules && !opts.plaintext) list.push(inputRulesPlugin(schema));
	list.push(keymap(editorKeymap(schema, opts.inline, opts.plaintext)));
	list.push(keymap(baseKeymap));
	if (opts.placeholder) list.push(placeholderPlugin(opts.placeholder));
	return list;
}

/**
 * The empty-leaf ghost placeholder (VISUAL_EDITOR_UIUX §Fields; issue #58 §9). A
 * node decoration stamps the sole empty textblock with a class + the ghost text,
 * which CSS renders via `::before { content: attr(data-placeholder) }` — so the
 * text never enters the document, the caret path, or a `pmToContent` export. It
 * vanishes the instant the leaf holds any content (the emptiness test fails).
 */
function placeholderPlugin(text: string): Plugin {
	return new Plugin({
		props: {
			decorations(state) {
				const { doc } = state;
				const first = doc.firstChild;
				const empty =
					doc.childCount === 1 && !!first && first.isTextblock && first.content.size === 0;
				if (!empty) return null;
				return DecorationSet.create(doc, [
					Decoration.node(0, first.nodeSize, {
						class: 'qm-prose-placeholder',
						'data-placeholder': text
					})
				]);
			}
		}
	});
}

/**
 * The field's keymap: history, mark toggles, and the list structure keys; Enter
 * suppressed inline.
 *
 * Tab forks on the leaf's ROLE, not on the caret's position. An inline/plaintext
 * leaf is a form field: Tab stays unbound, so the deferred structural keymap owns
 * field navigation outright. A block-schema body is a document: Tab is structural
 * (`lists.ts`). One key never means two things within one surface.
 */
function editorKeymap(
	schema: Schema,
	inline: boolean,
	plaintext: boolean
): Record<string, Command> {
	const map: Record<string, Command> = {
		'Mod-z': undo,
		'Mod-y': redo,
		'Shift-Mod-z': redo
	};
	if (!plaintext) {
		if (schema.marks.strong) map['Mod-b'] = toggleMark(schema.marks.strong);
		if (schema.marks.em) map['Mod-i'] = toggleMark(schema.marks.em);
		if (schema.marks.underline) map['Mod-u'] = toggleMark(schema.marks.underline);
	}
	if (inline) {
		// One textblock only: swallow Enter so no second block is attempted.
		map['Enter'] = () => true;
	} else {
		// Each binding falls through to `baseKeymap` when no list is in play.
		Object.assign(map, listKeymap(schema));
	}
	return map;
}
