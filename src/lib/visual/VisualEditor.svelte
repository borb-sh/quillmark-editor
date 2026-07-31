<!--
 The federated WYSIWYG surface (VISUAL_EDITOR). A THIN composition over many
 small editors; NOT one PM document spanning the page. It owns:
 • structure: the schema × payload join, re-derived from the live `Document`;
 • stable card identity: a session-id array reordered in lockstep with the
 content, resolved to an index ONLY at the mutation boundary;
 • commit routing: prose leaves lower to `applyChange` (in the codec); scalars/
 arrays/objects go through the typed `writer`; structure through the mutators;
 • focus + the bridge outputs (`onActiveAddrChange`, `onCaretMove`) and the
 `setCaret(hit)` entry wired to the preview;
 • the ONE formatting popover (`FormatPopover`, mounted once, observing the
 active leaf via `getActiveLeaf`) and diagnostics routing (`diagnostics.ts`:
 quill.validate + local commit errors + the external `diagnostics` prop,
 merged into `diagByKey` and threaded to each `<Field>`/card body).

 REACTIVITY ACROSS THE WASM HANDLE. The `Document` is opaque to Svelte, so a
 `revision` counter is bumped after every scalar/structure mutation and the card
 tree is `$derived` by RE-READING `doc.main`/`doc.cards`/`quill.schema`. Prose
 leaves are mounted ONCE per stable leaf key (keyed `<Card>`/`<ProseField>`);
 they commit to the doc directly and do NOT bump `revision`, so a re-derive never
 remounts them or drops a caret. `doc.main`/`doc.cards` allocate per read: read
 once per derive.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import { DropdownMenu } from 'bits-ui';
	import Plus from '@lucide/svelte/icons/plus';
	import { isQuillmarkError, MAIN_CARD_ADDR } from '../core/index.js';
	import { bloomInside } from '../core/bloom.js';
	import type {
		Document,
		Quill,
		Addr,
		CardAddr,
		CardInput,
		Diagnostic,
		ContentHit,
		Resolved,
		ResolvedField
	} from '../core/index.js';
	import type { FieldController } from '../core/codec/index.js';
	import {
		IdSeq,
		fieldModels,
		groupOrder,
		groupSections,
		groupLabel,
		cardTitle,
		bodyEnabled,
		humanize,
		provenanceMap,
		resolvedByCardIndex,
		ghostDefault,
		stringifyGhost,
		resolveBodyGhost,
		NO_RESOLVED_ROWS,
		type CardModel,
		type ResolvedCardRows
	} from './structure.js';
	import {
		fieldKeyToString,
		parsePath,
		resolveCardKey,
		routeAndResolve,
		mergeDiagnostics,
		type FieldKey,
		type RoutedDiagnostic
	} from './diagnostics.js';
	import { fieldDomIds, groupPanelId } from './domid.js';
	import { reorder } from './motion.js';
	import { fieldPathForAddr } from './caret.js';
	import type { CaretMove, ActiveField, EditorChange, CardContext } from './signals.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { tipsChannel } from './tips.js';
	import { patchEditorExt } from './ext.js';
	import { rebindGuard } from '../core/rebind.js';
	import { checkDials } from '../core/dials.js';
	import { resolveStrings, type EditorStrings } from './strings.js';
	import { provideStrings } from './context.js';
	import { reportError, type EditorErrorHandler } from '../core/errors.js';
	import Card from './Card.svelte';
	import TipsCard from './TipsCard.svelte';
	import FormatPopover from './FormatPopover.svelte';
	// The add trigger and the kind menu draw shared recipes; a component carrying a
	// shared class without also pulling its rule ships unstyled (controls.css).
	import './controls.css';

	/**
	 * REMOUNT CONTRACT. `cardIds`, the id `seq`, and the leaf registry seed ONCE
	 * from the initial `doc` (see the reactivity note above); swapping `doc`/`quill`
	 * in place is NOT observed and silently desyncs the card tree. Swap by
	 * REMOUNTING (`{#key doc}`, as the playground does): edits flow the other way,
	 * mutating the passed-in `doc` handle directly.
	 */
	interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'class' | 'style'> {
		doc: Document;
		quill: Quill;
		/** The active leaf, in both addressings. */
		onActiveAddrChange?: (at: ActiveField) => void;
		/**
		 * A caret move in the active leaf, carrying the preview's own address
		 * grammar: `onCaretMove={preview.focusPosition}` is the whole bridge. A
		 * SELECTION signal, not a change signal: an arrow key fires it and commits
		 * nothing (`onChange` is the change signal). One keystroke fires `onChange`
		 * first and this second: the edit has landed by the time the caret is
		 * reported.
		 */
		onCaretMove?: (at: CaretMove) => void;
		/**
		 * EVERY edit that lands on the document: a prose commit, a scalar/array
		 * write, a card operation. `source` is what moved, for a host that wants a
		 * structure op to recompile at once and a keystroke to wait for the burst to
		 * settle; a host that recompiles the same way for all three ignores it.
		 */
		onChange?: (change: EditorChange) => void;
		/**
		 * Failures the editor RECOVERED from: a commit the boundary refused (also
		 * pinned as a diagnostic on its field), a card operation that threw, a
		 * `validate`/`resolve` that threw, a prose commit that fell back. None of them
		 * stop editing; without this hook each is a `console.error` an app cannot
		 * route. Reaches the leaves too, so one handler covers the surface.
		 */
		onError?: EditorErrorHandler;
		/**
		 * External diagnostics, routed by `.path` and merged with `quill.validate`
		 * and local commit errors (VISUAL_EDITOR §Diagnostics).
		 */
		diagnostics?: Diagnostic[];
		/**
		 * Consumer policy hook: given a field `addr` and an enum option,
		 * return `false` to mark that option unavailable. A disallowed option renders
		 * DISABLED (never stripped), so an already-authored value stays visible and its
		 * stored payload is untouched: the schema is unchanged, this is runtime policy.
		 * Absent → every schema option is offered (the default, zero behavior change).
		 */
		enumOptionAllowed?: (addr: Addr, value: string) => boolean;
		/**
		 * Every word the surface says, overridable key by key (`strings.ts`): the
		 * card controls' titles, the add trigger, the formatting popover, the tips
		 * card, and the empty body's ghost, which is the entry that takes a function.
		 * Unset keys take the package's English. Several are accessible NAMES, not
		 * decoration.
		 */
		strings?: Partial<EditorStrings>;
		/**
		 * Consumer controls in EVERY card's header, beside the package's own
		 * reorder/delete: the extension point a "duplicate card" or an app-side menu
		 * lands in. Told the card's identity (`{ addr, kind, isMain }`) and nothing
		 * about the editor's internals; it acts through the consumer's own `Document`
		 * verbs, exactly as the shell around the surface does.
		 */
		cardActions?: Snippet<[CardContext]>;
		/** Appended to the root's own class: the surface is a mounted element the
		 * consumer positions, so it needs a handle for layout it owns. */
		class?: string;
		/** Merged onto the root. Free because the derivation moved off this attribute
		 *  and onto `data-qm-root` (core/theme.css). */
		style?: string;
	}
	let {
		doc,
		quill,
		onActiveAddrChange,
		onCaretMove,
		onChange,
		onError,
		diagnostics,
		enumOptionAllowed,
		strings: stringOverrides,
		cardActions,
		class: className,
		style,
		...rest
	}: Props = $props();

	// ── Reactivity + session identity ───────────────────────────────────────────
	let revision = $state(0);
	// This editor's own id, prefixed onto every field's DOM ids (`domid.ts`). The
	// leaf-key space is unique per EDITOR, not per page: two editors mounted
	// side-by-side both hold `main:subject`, and a duplicate `id` makes `for` resolve
	// to whichever mounted first. `$props.id()` is stable across SSR and hydration,
	// which a module counter is not.
	const uid = $props.id();
	const seq = new IdSeq();
	// Session ids, one per composable card, reordered in lockstep with structure ops.
	// svelte-ignore state_referenced_locally
	let cardIds = $state<string[]>(seq.take(doc.cardCount));

	// Local commit-error diagnostics (VISUAL_EDITOR §Diagnostics, producer #2):
	// one slot per field key, replaced on each failed `commitScalar`, cleared on
	// the next successful one for that field. Id-keyed (not positional) so an
	// error stays pinned to its field across a card reorder.
	let commitErrors = $state(new Map<string, RoutedDiagnostic>());
	/** Edit the commit-error map copy-on-write: a `$state` Map is not deeply
	 * reactive, so a mutation in place re-derives nothing. */
	function editCommitErrors(edit: (m: Map<string, RoutedDiagnostic>) => void): void {
		const next = new Map(commitErrors);
		edit(next);
		commitErrors = next;
	}

	// The remount contract above, made loud in dev (`core/rebind.ts`): the failure
	// it catches is silent by construction, since a swapped handle is a valid
	// handle and every read against it succeeds against the wrong document.
	// svelte-ignore state_referenced_locally
	const guardDoc = rebindGuard('VisualEditor', 'doc', doc, () => onError);
	// svelte-ignore state_referenced_locally
	const guardQuill = rebindGuard('VisualEditor', 'quill', quill, () => onError);
	$effect(() => {
		guardDoc(doc);
		guardQuill(quill);
	});
	// Dev-only, once the root exists: a length dial with no unit renders as the
	// default and says nothing on its own (`core/dials.ts`).
	$effect(() => {
		checkDials(rootEl, 'VisualEditor', () => onError);
	});

	// The resolved words, provided to the subtree as a GETTER so a consumer swapping
	// `strings` after mount reaches every component that says one (`context.ts`).
	const words = $derived(resolveStrings(stringOverrides));
	provideStrings(() => words);

	const kinds = $derived(Object.keys(quill.schema.card_kinds ?? {}));

	/** Control-glyph size: the shared rule (AESTHETIC §Icons), as CardControls. */
	const GLYPH = 14;

	/**
	 * A mutation the DERIVED TREE has to see: bump the revision, then report it.
	 * Prose is the other half and goes through `proseChanged` below: a prose leaf
	 * commits its own edit and must NOT re-derive (the re-derive would remount the
	 * leaf and drop the caret), so the two paths differ in exactly that, and in
	 * nothing a host observes.
	 */
	function mutate(source: 'field' | 'structure', addr?: Addr): void {
		revision++;
		onChange?.({ source, addr: addr && normalize(addr) });
	}
	/** A prose commit: the change signal WITHOUT the re-derive. */
	function proseChanged(addr: Addr): void {
		onChange?.({ source: 'prose', addr: normalize(addr) });
	}
	/** Resolve a stable card id to its current content index, or -1 if gone: read
	 * at the mutation boundary, never cached (VISUAL_EDITOR §"The address is the spine"). */
	function cardIndexOf(id: string): number {
		return cardIds.indexOf(id);
	}

	// ── Leaf registry (setCaret target lookup + the active-leaf seam) ───────────
	const leaves = new Map<string, FieldController>();
	// Card handles, for `setCaret`'s reveal hop: the one thing a leaf's own controller
	// cannot do, since which group is open is the card's state (Card §revealLeaf).
	type CardHandle = {
		revealLeaf(key: string): void;
		scrollIntoViewCard(block: ScrollLogicalPosition): void;
	};
	let mainCard = $state<CardHandle | undefined>(undefined);
	let cardRefs = $state<(CardHandle | undefined)[]>([]);
	/** The stack's own element: it carries `data-qm-root`, so it is what the kind
	 * menu portals INTO, the way each leaf's surface resolves its nearest root. */
	let rootEl = $state<HTMLElement | undefined>(undefined);
	function register(key: string, controller: FieldController): void {
		leaves.set(key, controller);
	}
	function unregister(key: string): void {
		leaves.delete(key);
	}

	// ── Focus + bridge outputs ──────────────────────────────────────────────────
	// `activeCardId` is the id-keyed half of `activeAddr` (whose `card` is positional),
	// and it feeds lookups only: the `activeController` seam below, and the clear on
	// delete. Nothing draws it: a card's active treatment is its controls' reveal,
	// which the card reads off `:focus-within` (SURFACES §"Focus and active state").
	let activeAddr = $state<Addr | undefined>(undefined);
	let activeCardId = $state<string | undefined>(undefined);

	/** Snapshot a (possibly getter-backed) addr to a plain, index-resolved value. */
	function normalize(addr: Addr): Addr {
		const card = addr.card;
		return card != null ? { card, field: addr.field } : { field: addr.field };
	}
	function handleFocus(addr: Addr): void {
		const plain = normalize(addr);
		activeAddr = plain;
		activeCardId = plain.card != null ? cardIds[plain.card] : 'main';
		const field = pathFor(plain);
		if (field != null) onActiveAddrChange?.({ addr: plain, field });
	}
	function handleCaret(addr: Addr, pos: number): void {
		const plain = normalize(addr);
		const field = pathFor(plain);
		if (field != null) onCaretMove?.({ addr: plain, field, pos });
	}
	/**
	 * This leaf's canonical `DocPath`. Free on the keystroke path: the kinds come
	 * off the DERIVED tree, which is re-read once per mutation, where
	 * `doc.cards.map(c => c.kind)` at the call site allocates per event. An address
	 * that cannot be formed (a card index outside the live tree, which a mounted
	 * leaf cannot hold) emits NOTHING rather than half an event: every hook here
	 * carries both addressings or does not fire.
	 */
	function pathFor(addr: Addr): string | undefined {
		return fieldPathForAddr(addr, kindsByIndex);
	}

	// ── Commit routing ──────────────────────────────────────────────────────────
	// Scalars / arrays / objects → the typed writer (schema-checked). Prose leaves
	// commit themselves via the codec (applyChange) and do NOT pass through here.
	// A scalar control commits `undefined` for a cleared entry: the unset lane
	// below (`doc.removeField`), not a write.
	//
	// A bad value makes `writer.set` THROW a `QuillmarkError`, whose
	// `diagnostics[0]` carries a `code` and a canonical `path` (e.g.
	// `edit::field_conform` at `main.font_size`, or `edit::unknown_field`). The
	// editor already KNOWS the field/card being committed, so it KEYS the entry
	// from THAT address: id-keyed so it survives a later card reorder, never
	// parsed from the positional path; while surfacing the thrown diagnostic
	// verbatim (its `code`/`message`) as the payload (VISUAL_EDITOR §Diagnostics,
	// producer #2). It is stashed in `commitErrors`; a subsequent SUCCESSFUL commit
	// for the same field clears it. Nothing here gates: the value is not written
	// (the document is unchanged on throw, per the boundary's own transactional
	// contract) and editing continues.
	function commitScalar(id: string, isMain: boolean, name: string, value: unknown): void {
		const key: FieldKey = { card: isMain ? undefined : id, field: name };
		const keyStr = fieldKeyToString(key);
		try {
			if (value === undefined) {
				// The UNSET rung of the commitment ladder (a cleared scalar control,
				// VISUAL_EDITOR §"the commitment ladder"): REMOVE the field so the
				// engine's authored › `default:` › zero-fill resolve renders the
				// default, rather than baking a snapshot the schema can't track
				// (canon SCHEMAS.md: the engine never persists a default; nor do we).
				// Removal writes no value, so there is nothing for a schema to conform:
				// it goes through the quill-free `doc.removeField` (bare string = main
				// `{ field }`; `{ card, field }` for a card), NOT the typed writer.
				if (isMain) {
					doc.removeField(name);
				} else {
					const i = cardIndexOf(id);
					if (i < 0) return;
					doc.removeField({ card: i, field: name });
				}
			} else {
				const w = quill.writer(doc);
				if (isMain) {
					w.set(name, value);
				} else {
					const i = cardIndexOf(id);
					if (i < 0) return;
					w.card(i).set(name, value);
				}
			}
			if (commitErrors.has(keyStr)) editCommitErrors((m) => m.delete(keyStr));
			mutate('field', makeAddr(id, isMain, name));
		} catch (e) {
			const diagnostic: Diagnostic = (isQuillmarkError(e) ? e.diagnostics[0] : undefined) ?? {
				severity: 'error',
				message: e instanceof Error ? e.message : String(e)
			};
			editCommitErrors((m) => m.set(keyStr, { key, diagnostic }));
			reportError(onError, {
				code: 'commit',
				message: `commit refused for \`${name}\`: ${diagnostic.message}`,
				cause: e,
				addr: normalize(makeAddr(id, isMain, name)),
				field: pathFor(normalize(makeAddr(id, isMain, name)))
			});
		}
	}

	// ── Structure mutators (resolve id→index here, then reorder ids in lockstep) ──
	/**
	 * Scroll the card `id` into view once the mutation that placed it has rendered:
	 * on a document of any length an insert lands off-screen, and a
	 * viewport that does not follow reads as nothing happening.
	 *
	 * Coalesced on a single pending id: two quick adds resolve their `tick()` in
	 * order, the earlier one sees a newer pending id and drops out, so one smooth
	 * scroll runs to the last card rather than two fighting over the same scroller.
	 */
	let pendingScrollId: string | null = null;
	async function scrollCardIntoView(id: string, block: ScrollLogicalPosition): Promise<void> {
		pendingScrollId = id;
		await tick();
		if (pendingScrollId !== id) return;
		pendingScrollId = null;
		const i = cardIndexOf(id);
		if (i >= 0) cardRefs[i]?.scrollIntoViewCard(block);
	}
	function addCard(atIndex: number, kind: string): void {
		try {
			const overlay = doc.seedOverlay(kind);
			const card = quill.seedCard(kind, overlay);
			if (!card) return;
			doc.insertCard(card, atIndex);
			const id = seq.next();
			cardIds = [...cardIds.slice(0, atIndex), id, ...cardIds.slice(atIndex)];
			mutate('structure', cardAddr(id));
			// `center` for an insert: the new card is the subject, and centring it shows
			// the neighbours it landed between.
			void scrollCardIntoView(id, 'center');
		} catch (e) {
			reportError(onError, { code: 'structure', message: `addCard(${kind}) failed`, cause: e });
		}
	}
	// The reorder gesture's arming window (SURFACES §Motion): the reconcile that moves a
	// slot is the trip, and every other reconcile that happens to move one is not. Read
	// through a getter rather than passed as a value, so the flag stays out of the
	// template and needs no reactivity for it: `animate:` asks at apply time, which is a
	// microtask after the mutation and well inside the frame that disarms it.
	let reordering = false;
	function armReorder(): void {
		reordering = true;
		requestAnimationFrame(() => (reordering = false));
	}
	const isReordering = (): boolean => reordering;

	function moveCardById(id: string, dir: -1 | 1): void {
		const from = cardIndexOf(id);
		if (from < 0) return;
		const to = from + dir;
		if (to < 0 || to >= doc.cardCount) return;
		armReorder();
		doc.moveCard(from, to);
		const w = cardIds.slice();
		const [x] = w.splice(from, 1);
		w.splice(to, 0, x);
		cardIds = w;
		mutate('structure', cardAddr(id));
		// `nearest` for a reorder: the card was already in view and only needs to stay
		// there, so a card that never left the viewport does not move it at all.
		void scrollCardIntoView(id, 'nearest');
	}
	/**
	 * Insert `card` immediately after the card `id` (at the front, for `main`).
	 * The seam a consumer extension needs: the editor owns card IDENTITY, so a
	 * consumer calling `doc.insertCard` behind its back leaves the id array a
	 * position short and every later address off by one, silently. Routing the
	 * insert through here is what keeps the two in lockstep, and it is why the
	 * card-header extension point is handed verbs rather than only an address.
	 *
	 * A `Card` read off `doc.cards` IS a valid `CardInput` (runtime.d.ts), so
	 * "duplicate this card" is a consumer one-liner over this verb.
	 */
	function insertCardAfter(id: string, card: CardInput): void {
		const at = cardIndexOf(id) + 1; // `main` resolves to -1: insert at the front
		try {
			doc.insertCard(card, at);
			const newId = seq.next();
			cardIds = [...cardIds.slice(0, at), newId, ...cardIds.slice(at)];
			mutate('structure', { card: at });
			void scrollCardIntoView(newId, 'center');
		} catch (e) {
			reportError(onError, { code: 'structure', message: 'insertCard failed', cause: e });
		}
	}
	function removeCardById(id: string): void {
		const i = cardIndexOf(id);
		if (i < 0) return;
		doc.removeCard(i);
		cardIds = cardIds.filter((_, k) => k !== i);
		if (activeCardId === id) {
			activeCardId = undefined;
			activeAddr = undefined;
		}
		// Drop any commit-error diagnostics id-keyed to the now-gone card: id-keying
		// (VISUAL_EDITOR §"The address is the spine") avoids mis-attributing them to
		// whichever card next takes this position, but an orphaned entry would
		// otherwise sit in the map forever (ids are never reused).
		if ([...commitErrors.keys()].some((k) => k.startsWith(`${id}:`)))
			editCommitErrors((m) => {
				for (const k of [...m.keys()]) if (k.startsWith(`${id}:`)) m.delete(k);
			});
		mutate('structure');
	}
	function retypeCardById(id: string, kind: string): void {
		const i = cardIndexOf(id);
		if (i < 0) return;
		try {
			doc.setCardKind(i, kind);
			mutate('structure', cardAddr(id));
		} catch (e) {
			reportError(onError, {
				code: 'structure',
				message: `retype to \`${kind}\` failed`,
				cause: e,
				addr: { card: i }
			});
		}
	}
	function renameCardById(id: string, title: string): void {
		const i = cardIndexOf(id);
		if (i < 0) return;
		patchEditorExt(doc, { card: i }, { title });
		mutate('structure', cardAddr(id));
	}
	/**
	 * Clear the tips channel: the dismissal write, and the ONLY write
	 * tips make. `undefined` drops the key while `title` and any later sibling ride
	 * through; `ext.ts` holds why that matters.
	 */
	function dismissTips(): void {
		patchEditorExt(doc, MAIN_CARD_ADDR, { tips: undefined });
		mutate('structure');
	}

	// ── Addressing + per-card op bundle ─────────────────────────────────────────
	/** A LIVE card address: `card` is a getter, so a reorder re-targets in place. */
	function cardAddr(id: string, field?: string): Addr {
		return field != null
			? ({
					get card() {
						return cardIndexOf(id);
					},
					field
				} as Addr)
			: ({
					get card() {
						return cardIndexOf(id);
					}
				} as Addr);
	}
	function makeAddr(id: string, isMain: boolean, field?: string): Addr {
		if (isMain) return field != null ? { field } : {};
		return cardAddr(id, field);
	}

	// ── Diagnostics routing (VISUAL_EDITOR §Diagnostics) ────────────────────────
	// Producer #1: quill.validate(doc), re-run every revision (empirically always
	// `[]` for usaf_memo (no field in the fixture carries a `!must_fill` marker)
	// but the routing exists for the general contract, not just this fixture).
	const validation = $derived.by(() => {
		revision; // re-run on every mutation, per VISUAL_EDITOR §Diagnostics
		try {
			return quill.validate(doc);
		} catch (e) {
			reportError(onError, {
				code: 'validate',
				message: 'quill.validate failed; no validation this pass',
				cause: e
			});
			return [] as Diagnostic[];
		}
	});

	// Merge all three producers: validate() + external (both positional `.path`,
	// resolved to the live stable-id keying) + local commit errors (already
	// id-keyed). Precedence is errors-before-warnings within a field's list
	// (mergeDiagnostics sorts; nothing is dropped: diagnostics never gate, so
	// nothing here hides one either).
	const diagByKey = $derived.by(() => {
		const fromValidate = routeAndResolve(validation, cardIds);
		const fromExternal = routeAndResolve(diagnostics, cardIds);
		return mergeDiagnostics(fromValidate, fromExternal, [...commitErrors.values()]);
	});
	function opsFor(id: string, isMain: boolean) {
		// ONE identity per field: the leaf registry, the DOM's three names, and the
		// diagnostics map all key off this string, so a leaf, its label and its
		// diagnostics can only ever resolve together.
		const leafKey = (field?: string) => fieldKeyToString({ card: isMain ? undefined : id, field });
		return {
			makeAddr: (field?: string) => makeAddr(id, isMain, field),
			leafKey,
			domIds: (field?: string) => fieldDomIds(uid, leafKey(field)),
			panelId: (group: string) => groupPanelId(uid, isMain ? undefined : id, group),
			commit: (name: string, value: unknown) => commitScalar(id, isMain, name, value),
			move: (dir: -1 | 1) => moveCardById(id, dir),
			remove: () => removeCardById(id),
			insertAfter: (card: CardInput) => insertCardAfter(id, card),
			retype: (kind: string) => retypeCardById(id, kind),
			rename: (title: string) => renameCardById(id, title),
			diagFor: (field?: string) => diagByKey.get(leafKey(field)),
			// Bind the consumer policy hook to this field's resolved addr;
			// no hook → every option allowed.
			enumAllowed: (field: string, value: string) =>
				enumOptionAllowed?.(makeAddr(id, isMain, field), value) ?? true
		};
	}

	// ── The empty-body ghost's consumer wording ─────────────────────────────────
	// The hook is consulted once per KIND and its answer kept for the session, which
	// is the whole determinism guarantee: a hook that samples a witty set at random
	// is impure by design, and this cache is what makes its answer look chosen:
	// same string for every card of a kind, and the same one after a remount or any
	// re-derive. Keyed by kind rather than by card id deliberately: two empty cards
	// that are the same kind ARE the same invitation, and disagreeing ghosts read as
	// a glitch. Retyping a card crosses to another key and re-asks, which is right:
	// it is a different card now. Plain (non-`$state`) on purpose: memoization, so
	// filling it during a derive must not feed back into one.
	let ghostHook: EditorStrings['bodyPlaceholder'] | undefined;
	const ghostByKind = new Map<string, string | undefined>();
	function customBodyGhost(kind: string, isMain: boolean): string | undefined {
		// A swapped hook invalidates every answer the old one gave.
		const hook = words.bodyPlaceholder;
		if (hook !== ghostHook) {
			ghostByKind.clear();
			ghostHook = hook;
		}
		// `main` is not a `card_kinds` key, so a kind that spells it collides without
		// the flag in the key.
		const key = `${isMain ? '1' : '0'}\0${kind}`;
		if (!ghostByKind.has(key)) ghostByKind.set(key, hook({ kind, isMain }));
		return ghostByKind.get(key);
	}

	// ── The derived card tree (schema × payload join) ───────────────────────────
	function buildCard(
		id: string,
		isMain: boolean,
		kind: string,
		card: {
			payloadItems: { type: string; key?: string; value?: unknown }[];
			ext?: Record<string, unknown>;
		},
		cardSchema: Parameters<typeof fieldModels>[0] | undefined,
		rows: ResolvedCardRows
	): CardModel {
		const values: Record<string, unknown> = {};
		for (const p of card.payloadItems)
			if (p.type === 'field' && p.key != null) values[p.key] = p.value;
		const fields = cardSchema ? fieldModels(cardSchema) : [];
		const sections = cardSchema
			? groupSections(fields, groupOrder(cardSchema), (g) => groupLabel(cardSchema, g))
			: [];
		const extEditor = card.ext?.editor as { title?: string } | undefined;
		const hasBody = bodyEnabled(cardSchema);
		return {
			id,
			isMain,
			kind,
			// No schema for this kind → a recovery shell, not a field list.
			// `main` always resolves `schema.main`, so it is never unschemable.
			unschemable: !isMain && !cardSchema,
			titleOverride: extEditor?.title ?? '',
			titlePlaceholder: cardTitle(cardSchema, kind, values, undefined),
			values,
			provenance: provenanceMap(rows.fields),
			sections,
			hasBody,
			// The body ghosts its resolved `default:` exactly as a scalar does: the
			// same text-ghost projection `<Field>` applies to a field's row; and falls
			// back to an invitation where a scalar shows nothing, because an empty body
			// is a surface to write on and an empty control is a value not yet given.
			// Asked only for a card that HAS a body, so the hook is never consulted
			// about one that renders none.
			bodyGhost: hasBody
				? resolveBodyGhost(
						stringifyGhost(ghostDefault(rows.body ?? undefined)),
						customBodyGhost(kind, isMain)
					)
				: undefined
		};
	}

	const model = $derived.by(() => {
		revision; // re-derive on every mutation
		const schema = quill.schema;
		const main = doc.main; // allocate once
		const cards = doc.cards; // allocate once
		// The provenance channel (FIELD_PROVENANCE): one whole-doc resolve per
		// derive, feeding the ghosted `default:` only. Guarded: provenance is
		// chrome, so a resolve failure degrades to no ghosts, never a blank form.
		let resolved: Resolved | undefined;
		try {
			resolved = quill.resolve(doc);
		} catch (e) {
			reportError(onError, {
				code: 'resolve',
				message: 'quill.resolve failed; ghosts fall back to none',
				cause: e
			});
		}
		const byCard = resolvedByCardIndex(resolved);
		return {
			// Tips are DOCUMENT-level, not a property of the main card: they
			// hang off `main`'s `$ext` because that is where a document-scoped `$ext`
			// lives, and the model says so at the root rather than making every card
			// carry a field one card renders.
			tips: tipsChannel((main.ext?.editor as { tips?: unknown } | undefined)?.tips),
			main: buildCard('main', true, 'main', main, schema.main, {
				fields: resolved?.main.fields ?? [],
				body: resolved?.main.body ?? null
			}),
			cards: cards.map((c, i) =>
				buildCard(
					cardIds[i] ?? `orphan${i}`,
					false,
					c.kind,
					c,
					schema.card_kinds?.[c.kind],
					byCard.get(i) ?? NO_RESOLVED_ROWS
				)
			)
		};
	});

	/**
	 * Every card's kind by content index, off the DERIVED tree rather than a fresh
	 * `doc.cards` read: the bridge's address mapping (`pathFor`) needs it on every
	 * caret move, and the tree already holds it. Re-derived once per mutation,
	 * which is the only thing that can move a kind.
	 */
	const kindsByIndex = $derived(model.cards.map((c) => c.kind));

	// ── Public entry points ─────────────────────────────────────────────────────
	/**
	 * Resolve a preview `ContentHit` to a mounted leaf and place its caret.
	 *
	 * Async because the reveal has to RENDER before the landing: a collapsed group
	 * is `inert`, which swallows a focus silently, so a caret placed in the same
	 * tick as the reveal would go nowhere and report nothing. The consumer's
	 * `onCaretPick` ignores the promise: awaiting it is for a caller that wants to
	 * observe where the caret went.
	 */
	export async function setCaret(hit: ContentHit): Promise<void> {
		const key = leafKeyForHit(hit.field);
		if (!key) return;
		const leaf = leaves.get(key);
		if (!leaf) return;
		// Reveal first: a leaf in a collapsed group is clipped to zero height and sits
		// inside an `inert` panel, so both the caret and the cue below would land on
		// nothing. Exactly one card holds the key.
		mainCard?.revealLeaf(key);
		for (const card of cardRefs) card?.revealLeaf(key);
		await tick();
		// A `'segment'` hit landed on origin-less ink (list markers, a code fence's
		// interior): `pos` is the segment START, not a cluster-exact caret
		// (HitGranularity), so just focus the leaf rather than snap the caret to a
		// spot the click did not resolve. `'cluster'` (and an absent granularity:
		// the backend did not report it, treat as exact) places the caret.
		if (hit.granularity === 'segment') leaf.focus();
		else leaf.setCaret(hit.pos);
		// The arrival cue. Unconditional, unlike the preview side's change-guarded
		// bloom: a preview click is one discrete act, and its commonest target is the
		// leaf ALREADY focused (where landing a caret changes nothing on screen) or
		// one off-screen, where the browser's focus-scroll moves the page and leaves
		// the caret to be hunted for in a long form.
		bloomInside(leaf.el);
	}
	/** The active leaf's controller: the formatting popover's observation seam. */
	export function getActiveLeaf(): FieldController | undefined {
		if (!activeAddr) return undefined;
		const card = activeAddr.card != null ? activeCardId : undefined;
		return leaves.get(fieldKeyToString({ card, field: activeAddr.field }));
	}

	/** Map a `ContentHit.field` (a canonical `DocPath`) to a mounted leaf key: the
	 * same `parseDocPath` route the diagnostics take, the absolute card index
	 * resolved to its live stable id, then the shared `fieldKeyToString` form. */
	function leafKeyForHit(field: string): string | undefined {
		const key = parsePath(field);
		if (!key) return undefined;
		const resolved = resolveCardKey(key, cardIds);
		return resolved ? fieldKeyToString(resolved) : undefined;
	}
</script>

<!-- `rest` first: an `id`, a `data-testid`, an `aria-*` the consumer needs on the
     mounted element, and never the class or the theming marker the surface reads. -->
<div {...rest} class="qm-editor {className ?? ''}" {style} data-qm-root bind:this={rootEl}>
	<!-- `main` and the tips card are ONE block in the stack: the tips card tucks under
	 `main`'s bottom corners, so the two share a seam rather than a gutter and the
	 wrapper is what holds them to it. -->
	<div class="qm-primary">
		<Card
			bind:this={mainCard}
			card={model.main}
			{doc}
			index={-1}
			isFirst={true}
			isLast={true}
			{kinds}
			ops={opsFor('main', true)}
			onFocus={handleFocus}
			onCaretMove={handleCaret}
			onProseChange={proseChanged}
			{onError}
			{cardActions}
			{register}
			{unregister}
		/>

		<!-- The tips card: a fixed slot after `main`, ahead of the cards, so
		 document-level guidance reads as document-level and never displaces a field.
		 Absent when the channel is empty; which is what dismissal makes it, so the
		 card leaves for good (VISUAL_EDITOR §"Card operations"). -->
		{#if model.tips.length}
			<TipsCard tips={model.tips} onDismiss={dismissTips} {onError} />
		{/if}
	</div>

	{@render addAffordance(0)}
	<!-- A card and the gap under it are one SLOT, which is what a reorder moves: the
	 strip below a card is the same strip wherever the card lands, so it rides along
	 rather than being slid across. It is also the shape `animate:` asks for, being the
	 keyed block's only child. -->
	{#each model.cards as c, i (c.id)}
		<div class="qm-card-slot" animate:reorder={isReordering}>
			<Card
				bind:this={cardRefs[i]}
				card={c}
				{doc}
				index={i}
				isFirst={i === 0}
				isLast={i === model.cards.length - 1}
				{kinds}
				ops={opsFor(c.id, false)}
				onFocus={handleFocus}
				onCaretMove={handleCaret}
				onProseChange={proseChanged}
				{onError}
				{cardActions}
				{register}
				{unregister}
			/>
			{@render addAffordance(i + 1)}
		</div>
	{/each}
</div>

<FormatPopover {getActiveLeaf} />

<!-- Cards always render; the ADD affordance is gated on the schema declaring
 `card_kinds`, since there is nothing to seed otherwise. A card already in the
 document shows regardless of its kind: a kind with no schema (foreign, or a
 schema with no `card_kinds` at all) degrades to a recovery shell inside <Card>
 (retype + delete), never gated away, so its content is neither dropped nor
 trapped. The gate lives HERE rather than at each call site: the strip is one
 decision, and two copies of it drift into a stack with a gap at one end. -->
{#snippet addAffordance(atIndex: number)}
	{#if kinds.length}
		<div class="qm-add-card">
			<!-- A glyph and no word: the strip IS the gap, so the pill it fills on hover
			 shows what a label would state: the space the new card takes. The kind is
			 the accessible name, the one reading with no geometry to carry it. -->
			{#if kinds.length === 1}
				<button
					type="button"
					class="qm-add-btn qm-add-affordance"
					aria-label={words.addCardOfKind(kinds[0], humanize(kinds[0]))}
					onclick={() => addCard(atIndex, kinds[0])}><Plus size={GLYPH} /></button
				>
			{:else}
				<!-- Multi-kind add: pick the kind, then seed + insert. A MENU rather than a
			 disclosure: it floats out of the stack, so raising it moves no card, and
			 it dismisses on pick, on Escape and on a click outside, none of which a
			 `<details>` does. The trigger is bits-ui's `<button>`, which is why the
			 recede ladder below reaches it through `:global`. -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger class="qm-add-btn qm-add-affordance" aria-label={words.addCard}
						><Plus size={GLYPH} /></DropdownMenu.Trigger
					>
					<DropdownMenu.Portal to={rootEl}>
						<DropdownMenu.Content sideOffset={4}>
							<!-- Portalled out of the row but INTO the stack's root, and carrying the
						     marker itself: floating is still a detached subtree to the
						     derivation, like FormatPopover and the enum listbox. -->
							<div class="qm-menu-surface" data-qm-root>
								{#each kinds as k (k)}
									<DropdownMenu.Item class="qm-menu-item" onSelect={() => addCard(atIndex, k)}
										>{humanize(k)}</DropdownMenu.Item
									>
								{/each}
							</div>
						</DropdownMenu.Content>
					</DropdownMenu.Portal>
				</DropdownMenu.Root>
			{/if}
		</div>
	{/if}
{/snippet}

<style>
	/* The private scale lands via `data-qm-root` on the root element above: this is
	 a DETACHED root, one of those core/theme.css applies the derivation to. The
	 root rule also carries the baseline font and colour, so nothing here restates
	 them. Nothing here mints; `check:style` enforces that. */
	.qm-editor {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
		color: var(--_qm-ink);
	}
	/* The stack's one gapless seam, which `TipsCard` draws and this holds the two
	 blocks to. `main` has to paint OVER the tip: a later sibling paints over an earlier
	 one otherwise, and the tip's background would cover the corners it is there to
	 fill. `isolation` keeps that z-index local, so one wrapper owns the ordering and no
	 card below inherits an argument about it. The wrapper is a single flex item, so the
	 pair takes the editor's gap once, together, exactly as one card does. */
	.qm-primary {
		isolation: isolate;
	}
	.qm-primary > :global(.qm-card) {
		position: relative;
		z-index: 1;
	}
	/* A slot restates the stack's own column and rhythm, so grouping a card with the
	 strip under it changes no geometry: the strip takes the same gap back on both
	 sides whether the gap above it is the slot's or the stack's, and a slot's own
	 height is short by exactly the gap the strip absorbed at its foot. */
	.qm-card-slot {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
	}
	/* The strip between two blocks, and the whole of it is the target: a gap is found
	 by POSITION, so reveal and hit region are the full-bleed row rather than a word
	 to aim at in the middle of it. It takes the editor's gap back on BOTH sides, so
	 it is not a control sitting in the gutter; it IS the gutter: what separates two
	 cards is the trigger's own height at the tap floor and nothing else, and the
	 pill it fills on hover is edge to edge the space the new card opens into. No
	 band is held back as miss-tolerance: gutter that reads as the trigger and
	 inserts nothing unsays what the fill claims, so a press anywhere between two
	 cards inserts. Absorbed rather than removed, because `gap` is also what separates
	 the one seam no strip sits in: every card from the next under a quill declaring no
	 kinds, where the affordance does not render at all. */
	.qm-add-card {
		display: flex;
		margin-top: calc(var(--_qm-space-2) * -1);
		margin-bottom: calc(var(--_qm-space-2) * -1);
	}
	/* Unboxed, like every button (SURFACES §"The shared recipe"), and not dashed: a
	 dashed edge is the PLACEHOLDER idiom ("nothing is here yet") which on a button
	 reads as disabled or as a drop target. It stays honest in one place, the
	 un-schemable card (`Card.svelte`), which is a state rather than a control. Hover
	 fills a pill: the trigger rests dim and unfilled, so a hover that only shifted its
	 ink would have little to shift. The pill fills the strip because the strip is what
	 was pressed, and the strip is the gap: the fill is the card-to-be, drawn where it
	 will land.

	 `:global`, because the multi-kind trigger is bits-ui's own element and a `class`
	 passed to a primitive is a plain string that never picks up the scoping hash:
	 the same seam the enum trigger is styled through. */
	/* The recede ladder, in source order: every rung after the first ties on
	   specificity with the one before it, so the later rule wins and no state needs
	   restating per gap. Rest, then engaged. */
	.qm-add-card :global(.qm-add-btn) {
		/* No inset of its own: the pill and the gap are the same rectangle, and the tap
		   floor is what gives the glyph the height it centres in. */
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		/* Recede until engaged (AESTHETIC §"minimal UI"): the glyph rests on the idle
		 rung and comes to full ink on hover or keyboard focus, so the stack reads as
		 content rather than a toolbar per gap. Dim, not absent: an insert point that
		 surfaces under the pointer is reachable only by a reader who already knows it
		 is there, and every gap is an equal entry point: a card goes anywhere in the
		 stack, not just after the last one. This rung is also what a touch pointer
		 gets, which never hovers. */
		opacity: var(--_qm-opacity-idle);
	}
	.qm-add-card:hover :global(.qm-add-btn),
	.qm-add-card :global(.qm-add-btn:focus-visible) {
		opacity: 1;
	}
	/* An open menu keeps its trigger lit, and this rule comes last so it outranks the
	   two above it: the menu portals out of the strip, so a pointer moving onto an item
	   has left the row that was revealing the trigger the menu hangs from. */
	.qm-add-card :global(.qm-add-btn[data-state='open']) {
		opacity: 1;
	}
</style>
