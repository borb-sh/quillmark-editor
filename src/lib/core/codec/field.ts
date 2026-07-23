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
import { splitListItem } from 'prosemirror-schema-list';
import { EditorView } from 'prosemirror-view';
import type { Document, Content, Addr } from '../index.js';
import { decode } from './decode.js';
import { usvToPM, pmToUsv, buildLineIndex, type LineIndex } from './positions.js';
import { lower, pmToContent, insertReintroducesIslandSlot } from './encode.js';
import { anchorsFromContent, type AnchorPos } from './marks.js';
import { createReconciler, type Reconciler } from './reconcile.js';
import { inputRulesPlugin } from './inputrules.js';
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
	destroy(): void;
}

const anchorKey = new PluginKey<AnchorPos[]>('quill-anchors');

/** Plugin-held anchor positions (PM coords), mapped through every edit's `StepMap`. */
function anchorPlugin(seed: AnchorPos[]): Plugin<AnchorPos[]> {
	return new Plugin<AnchorPos[]>({
		key: anchorKey,
		state: {
			init: () => seed,
			apply: (tr, anchors) =>
				tr.docChanged ? anchors.map((a) => ({ id: a.id, pos: tr.mapping.map(a.pos) })) : anchors
		}
	});
}

/** Read the leaf's raw stored `Content` for `addr`. */
function readLeaf(doc: Document, addr: Addr): Content {
	if (addr.field != null) {
		if (addr.card != null) {
			const card = doc.cards[addr.card];
			const item = card?.payloadItems.find((p) => p.type === 'field' && p.key === addr.field);
			return item && item.type === 'field' ? (item.value as Content) : emptyContent();
		}
		// An absent field reads `undefined` — a default-only richtext field
		// (e.g. `tag_line`) has no stored value until first edited. Decode an
		// empty content rather than crash; the first edit installs/commits it.
		return (doc.get(addr.field) as Content | undefined) ?? emptyContent();
	}
	if (addr.card != null) return doc.cards[addr.card].body;
	return doc.main.body;
}

/** The canonical empty `Content` — one empty `para` line. The zero value a prose
 * leaf (or an array's prose element) seeds from. */
export function emptyContent(): Content {
	return { text: '', lines: [{ containers: [], kind: 'para' }], marks: [], islands: [] };
}

/** Whether the leaf's field currently holds a stored value (a body is always present). */
function leafPresent(doc: Document, addr: Addr): boolean {
	if (addr.field == null) return true;
	if (addr.card != null) {
		const card = doc.cards[addr.card];
		return !!card?.payloadItems.find((p) => p.type === 'field' && p.key === addr.field);
	}
	return doc.get(addr.field) !== undefined;
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

	const state = buildState(reconciler.last as Content);
	index = buildLineIndex(state.doc);

	view = new EditorView(container, {
		state,
		attributes: opts.label ? { 'aria-label': opts.label } : undefined,
		dispatchTransaction: (tr) => {
			const oldRt = reconciler.last as Content;
			const next = view.state.apply(tr);
			view.updateState(next); // (a) optimistic
			index = buildLineIndex(next.doc);

			if (tr.docChanged) {
				commitEdit(oldRt, next.doc);
			}
			// (d) caret — for both structural and selection-only changes.
			opts.onCaretMove?.(addr, pmToUsv(next.doc, index, next.selection.head));
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
			pos: usvToPM(pmDoc, seedIndex, a.pos)
		}));
		return EditorState.create({
			doc: pmDoc,
			plugins: proseLeafPlugins(schema, {
				inline,
				plaintext,
				noInputRules: opts.noInputRules,
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
				const bundle = lower(oldRt, newDoc, { oldAnchors, newAnchors });
				doc.applyChange(addr, bundle);
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

	/** Anchor positions in the CURRENT (new) doc, as USV. */
	function readAnchorsUsv(newDoc: PMNode): AnchorPos[] {
		const anchors = anchorKey.getState(view.state) ?? [];
		return anchors.map((a) => ({ id: a.id, pos: pmToUsv(newDoc, index, a.pos) }));
	}

	const controller: FieldController = {
		setCaret(pos: number): void {
			const pm = usvToPM(view.state.doc, index, pos);
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
			const caretUsv = pmToUsv(view.state.doc, index, view.state.selection.head);
			const fresh = buildState(current);
			view.updateState(fresh);
			index = buildLineIndex(fresh.doc);
			// Best-effort caret continuity across an external change: keep the USV.
			const pm = usvToPM(fresh.doc, index, caretUsv);
			view.dispatch(view.state.tr.setSelection(Selection.near(fresh.doc.resolve(pm))));
			reconciler.commit(current);
		},
		focus(): void {
			view.focus();
		},
		getContent(): Content {
			return readLeaf(doc, addr);
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
	opts: { inline: boolean; plaintext: boolean; noInputRules?: boolean; afterHistory?: Plugin[] }
): Plugin[] {
	const list: Plugin[] = [history(), ...(opts.afterHistory ?? [])];
	if (!opts.noInputRules && !opts.plaintext) list.push(inputRulesPlugin(schema));
	list.push(keymap(editorKeymap(schema, opts.inline, opts.plaintext)));
	list.push(keymap(baseKeymap));
	return list;
}

/** The field's keymap: history, mark toggles, list Enter; Enter suppressed inline. */
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
	} else if (schema.nodes.list_item) {
		// Prefer splitting the list item; fall through to baseKeymap otherwise.
		map['Enter'] = splitListItem(schema.nodes.list_item);
	}
	return map;
}
