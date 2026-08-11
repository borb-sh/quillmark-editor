<!--
 The federated WYSIWYG surface (VISUAL_EDITOR). A thin composition over many
 small editors; not one PM document spanning the page.

 Mounted once per document. `VisualEditor` keys this component on `doc`, so
 everything below seeds from a handle that cannot change under it: `cardIds`, the
 id `seq`, the leaf registry, the commit-error map, the active address and the
 card refs are all mount-scoped, and the prose leaves close over the `doc` they
 mounted against. That is what makes them plain state rather than something
 threaded through a generation token.

 It owns:
 • structure: the schema × payload join, re-derived from the live `Document`;
 • stable card identity: a session-id array reordered in lockstep with the
 content, resolved to an index only at the mutation boundary;
 • commit routing: prose leaves lower to `applyChange` (in the codec); scalars/
 arrays/objects go through the typed `writer`; structure through the mutators;
 • focus + the bridge outputs (`onActiveLeafChange`, `onCaretMove`) and the
 `setCaret(at)` entry wired to the preview;
 • the one formatting popover (`FormatPopover`, mounted once, observing the
 active leaf via `getActiveLeaf`) and diagnostics routing (`diagnostics.ts`:
 quill.validate + local commit errors + the external `diagnostics` prop,
 merged into `diagByKey` and threaded to each `<Field>`/card body).

 Reactivity across the WASM handle. The `Document` is opaque to Svelte, so a
 `revision` counter is bumped after every scalar/structure mutation and the card
 tree is `$derived` by re-reading `doc.main`/`doc.cards`/`quill.schema`. Prose
 leaves are mounted once per stable leaf key (keyed `<Card>`/`<ProseField>`);
 they commit to the doc directly and do not bump `revision`, so a re-derive never
 remounts them or drops a caret. `doc.main`/`doc.cards` allocate per read: read
 once per derive.
-->
<script lang="ts">
	import { onDestroy, tick } from 'svelte';
	import { DropdownMenu } from 'bits-ui';
	import { isQuillmarkError, MAIN_CARD_ADDR } from '@quillmark/wasm';
	import {
		addrForFieldPath,
		cardPath,
		elementAddrForFieldPath,
		fieldPathForAddr,
		type DocPath,
		type Landing
	} from '../core/address.js';
	import { errorMessage, reportError } from '../core/errors.js';
	import { bloomInside } from '../core/bloom.js';
	import { createLifespan } from '../core/teardown.js';
	import type { Addr, CardAddr, Diagnostic, Resolved, ResolvedField } from '@quillmark/wasm';
	import type { VisualEditorProps } from './props.js';
	import { mergeStrings, setWording } from './strings.js';
	import type { CardId, ChangeSource } from './signals.js';
	import type { FieldController } from '../core/codec/index.js';
	import {
		IdSeq,
		controlKind,
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
		resolveCardKey,
		routeAndResolve,
		mergeDiagnostics,
		type FieldKey,
		type RoutedDiagnostic
	} from './diagnostics.js';
	import { fieldDomIds, groupPanelId } from './domid.js';
	import { createLeafRegistry, type FieldControl } from './leaves.js';
	import { reorder } from './motion.js';
	import { tipsChannel } from './tips.js';
	import { patchEditorExt } from './ext.js';
	import Card from './Card.svelte';
	import TipsCard from './TipsCard.svelte';
	import FormatPopover from './FormatPopover.svelte';
	// The add trigger and the kind menu draw shared recipes; a component carrying a
	// shared class without also pulling its rule ships unstyled (controls.css).
	import './controls.css';

	let {
		doc,
		quill,
		onActiveLeafChange,
		onCaretMove,
		onChange,
		onError,
		diagnostics,
		enumOptionAllowed,
		enumDisallowed = 'disable',
		strings,
		formatDiagnostic,
		class: className,
		style
	}: VisualEditorProps = $props();

	// The wording, merged once and published to the tree. A getter pair rather than a
	// snapshot: a consumer swapping locale mid-session re-renders every label,
	// including the ones eight components down that never see a prop.
	const merged = $derived(mergeStrings(strings));
	setWording({
		get strings() {
			return merged;
		},
		get formatDiagnostic() {
			return formatDiagnostic;
		}
	});

	// ── Reactivity + session identity ───────────────────────────────────────────
	let revision = $state(0);
	// This editor's own id, prefixed onto every field's DOM ids (`domid.ts`). The
	// leaf-key space is unique per editor, not per page: two editors mounted
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

	const kinds = $derived(Object.keys(quill.schema.card_kinds ?? {}));

	/**
	 * Re-derive the card tree and report the edit. Called for the two lanes that go
	 * through this component; a prose leaf commits itself and reports through
	 * `proseChanged`, which does not bump the revision (bumping it would re-derive
	 * and remount every leaf, costing the caret on every keystroke).
	 *
	 * `cardId` is passed rather than derived from `at`: the sites below hold the id
	 * already, and the removal has no address to derive one from. `at` is an `Addr` for
	 * a leaf and a card index for a structure op, whose subject is the card rather than
	 * anything inside it; either way the path is minted here, after the bump, because
	 * an op's own index is only addressable against the tree the bump re-derived (an
	 * insert's card does not exist in the previous one, and a retype's kind is the
	 * previous kind).
	 */
	function bump(source: ChangeSource, cardId?: CardId, at?: Addr | number): void {
		revision++;
		const path =
			at == null ? undefined : typeof at === 'number' ? cardPath(at, liveKinds()) : pathFor(at);
		onChange?.({ source, cardId, path });
	}
	/** Resolve a stable card id to its current content index, or -1 if gone: read
	 * at the mutation boundary, never cached (VISUAL_EDITOR §"The address is the spine"). */
	function cardIndexOf(id: string): number {
		return cardIds.indexOf(id);
	}
	/** The inverse, for the two signals that arrive as an address and nothing else
	 * (a focus, a prose commit): `'main'` for a main address, else the live id at
	 * that index. Resolved at the emit site off the same array the mutation boundary
	 * reads, never cached. */
	function cardIdOf(addr: Addr): CardId {
		return addr.card == null ? 'main' : cardIds[addr.card];
	}

	// ── Teardown (core/teardown.ts: unregister, cancel, then free) ──────────────
	// A document swap is a remount (see the remount contract above), so a destroy is
	// the only way this surface ends and one span covers both. Cancellers register
	// below in the order they run: the registry that resolves new work first, then
	// the work already scheduled. The document handle is the consumer's to free, so
	// the span holds nothing to release.
	const span = createLifespan();
	onDestroy(() => span.end());

	// ── Leaf registry (landing target lookup + the active-leaf seam) ────────────
	// Every mounted field is in it, prose leaf and form control alike (`leaves.ts`):
	// a landing needs a focus and a box to bloom, which every control has, and the
	// codec lane is asked for only where there is an offset to place.
	const leaves = createLeafRegistry();
	// Each leaf unregisters itself on its own teardown; this covers the surface
	// going away as a whole, where a leaf's cleanup order relative to the parent's
	// is Svelte's business and not something to depend on.
	span.onEnd(() => leaves.clear());
	// Card handles, for `setCaret`'s reveal hop: the one thing a leaf's own controller
	// cannot do, since which group is open is the card's state (Card §revealLeaf).
	type CardHandle = {
		revealLeaf(key: string): void;
		scrollIntoViewCard(block: ScrollLogicalPosition): void;
	};
	let mainCard = $state<CardHandle | undefined>(undefined);
	let cardRefs = $state<(CardHandle | undefined)[]>([]);
	/** The stack's own element: it carries `data-qm-root`, so it is what the kind
	 * menu portals into, the way each leaf's surface resolves its nearest root. */
	let rootEl = $state<HTMLElement | undefined>(undefined);

	// ── Focus + bridge outputs ──────────────────────────────────────────────────
	// `activeCardId` is the id-keyed half of `activeAddr` (whose `card` is positional),
	// and it feeds lookups only: the `activeController` seam below, and the clear on
	// delete. Nothing draws it: a card's active treatment is its controls' reveal,
	// which the card reads off `:focus-within`.
	let activeAddr = $state<Addr | undefined>(undefined);
	let activeCardId = $state<CardId | undefined>(undefined);

	/** Snapshot a (possibly getter-backed) addr to a plain, index-resolved value. */
	function normalize(addr: Addr): Addr {
		const card = addr.card;
		return card != null ? { card, field: addr.field } : { field: addr.field };
	}
	function handleFocus(addr: Addr): void {
		const plain = normalize(addr);
		activeAddr = plain;
		activeCardId = cardIdOf(plain);
		const field = pathFor(plain);
		if (field != null) onActiveLeafChange?.({ field, cardId: activeCardId });
	}
	/** No card kinds are read for a main address; the shared empty stands in so the
	 *  common case allocates nothing. */
	const NO_KINDS: readonly string[] = [];
	/**
	 * The live kinds by content index, off the derived card tree rather than
	 * `doc.cards`: they are already in hand, and `doc.cards` serializes every card on
	 * each read, which is not a thing to do per keystroke.
	 */
	function liveKinds(): string[] {
		return model.cards.map((c) => c.kind);
	}
	/**
	 * A leaf's canonical `DocPath`. `undefined` for an address outside the live card
	 * array (a stale addr: drop rather than mis-target).
	 */
	function pathFor(addr: Addr): DocPath | undefined {
		return fieldPathForAddr(addr, addr.card == null ? NO_KINDS : liveKinds());
	}
	// The last place reported, so a caret that did not move is not news. A leaf fires
	// one caret signal per transaction, and a transaction need not have moved the
	// caret to exist: a mark toggle over the same range, an anchor op, a plugin's own
	// bookkeeping. The memo is the editor's rather than each leaf's, because a place
	// spans leaves: a caret that leaves `main.body` at 5 for a card leaf and comes
	// back to 5 made two moves, and a per-leaf memo would swallow the second. An edit
	// that reflows the page under a caret holding its offset is the case this drops,
	// and a preview does not need the signal to answer it: the place is unchanged, so
	// the one it already followed is the one its recompile re-locates.
	let lastCaretField: DocPath | undefined;
	let lastCaretPos: number | undefined;
	function handleCaret(addr: Addr, pos: number): void {
		const field = pathFor(normalize(addr));
		if (field == null) return;
		if (field === lastCaretField && pos === lastCaretPos) return;
		lastCaretField = field;
		lastCaretPos = pos;
		onCaretMove?.({ field, pos });
	}
	/** A prose leaf's own commit: the third change lane, and the one that must not
	 *  bump `revision` (see {@link bump}). */
	function proseChanged(addr: Addr): void {
		const plain = normalize(addr);
		onChange?.({ source: 'prose', cardId: cardIdOf(plain), path: pathFor(plain) });
	}

	// ── Commit routing ──────────────────────────────────────────────────────────
	// Scalars / arrays / objects → the typed writer (schema-checked). Prose leaves
	// commit themselves via the codec (applyChange) and do not pass through here.
	// A scalar control commits `undefined` for a cleared entry: the unset lane
	// below (`doc.removeField`), not a write.
	//
	// A bad value makes `writer.set` throw a `QuillmarkError`, whose
	// `diagnostics[0]` carries a `code` and a canonical `path` (e.g.
	// `edit::field_coercion_failed` at `main.font_size`, or `edit::unknown_field`). The
	// editor already knows the field/card being committed, so it keys the entry
	// from that address: id-keyed so it survives a later card reorder, never
	// parsed from the positional path; while surfacing the thrown diagnostic
	// verbatim (its `code`/`message`) as the payload (VISUAL_EDITOR §Diagnostics,
	// producer #2). It is stashed in `commitErrors`; a subsequent successful commit
	// for the same field clears it. Nothing here gates: the value is not written
	// (the document is unchanged on throw, per the boundary's own transactional
	// contract) and editing continues.
	function commitScalar(id: string, isMain: boolean, name: string, value: unknown): void {
		const key: FieldKey = { card: isMain ? undefined : id, field: name };
		const keyStr = fieldKeyToString(key);
		try {
			if (value === undefined) {
				// The unset rung of the commitment ladder (a cleared scalar control,
				// VISUAL_EDITOR §"Structure mirrors the schema"): remove the field so the
				// engine's authored › `default:` › zero-fill resolve renders the
				// default, rather than baking a snapshot the schema can't track
				// (canon SCHEMAS.md: the engine never persists a default; nor do we).
				// Removal writes no value, so there is nothing for a schema to conform:
				// it goes through the quill-free `doc.removeField` (bare string = main
				// `{ field }`; `{ card, field }` for a card), not the typed writer.
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
			bump('field', id, makeAddr(id, isMain, name));
		} catch (e) {
			const diagnostic: Diagnostic = (isQuillmarkError(e) ? e.diagnostics[0] : undefined) ?? {
				severity: 'error',
				message: errorMessage(e)
			};
			editCommitErrors((m) => m.set(keyStr, { key, diagnostic }));
			// Both channels, deliberately: the diagnostic pins to the field on
			// screen, the error reaches the app's sink (core/errors.ts).
			reportError(onError, {
				code: 'commit-refused',
				severity: 'error',
				message: `write to ${name} refused: ${errorMessage(e)}`,
				cause: e,
				path: pathFor(makeAddr(id, isMain, name))
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
	 * The two guards below answer different questions: the span, whether this surface
	 * is still there; the pending id, whether this continuation is still the current one.
	 */
	let pendingScrollId: string | null = null;
	async function scrollCardIntoView(id: string, block: ScrollLogicalPosition): Promise<void> {
		pendingScrollId = id;
		if (!(await span.resumes(tick()))) return;
		if (pendingScrollId !== id) return;
		pendingScrollId = null;
		const i = cardIndexOf(id);
		if (i >= 0) cardRefs[i]?.scrollIntoViewCard(block);
	}
	/** Returns the new card's session key, or `undefined` when the kind seeds nothing
	 *  or the insert threw: what `insertCard` hands a host that wants to track it. */
	function addCard(atIndex: number, kind: string): CardId | undefined {
		try {
			const overlay = doc.seedOverlay(kind);
			const card = quill.seedCard(kind, overlay);
			if (!card) return undefined;
			doc.insertCard(card, atIndex);
			const id = seq.next();
			cardIds = [...cardIds.slice(0, atIndex), id, ...cardIds.slice(atIndex)];
			bump('structure', id, atIndex);
			// `center` for an insert: the new card is the subject, and centring it shows
			// the neighbours it landed between.
			void scrollCardIntoView(id, 'center');
			return id;
		} catch (e) {
			reportError(onError, {
				code: 'card-op-failed',
				severity: 'error',
				message: `adding a ${kind} card failed: ${errorMessage(e)}`,
				cause: e
			});
			return undefined;
		}
	}
	// The reorder gesture's arming window: the reconcile that moves a
	// slot is the trip, and every other reconcile that happens to move one is not. Read
	// through a getter rather than passed as a value, so the flag stays out of the
	// template and needs no reactivity for it: `animate:` asks at apply time, which is a
	// microtask after the mutation and well inside the frame that disarms it.
	let reordering = false;
	let reorderFrame = 0;
	function armReorder(): void {
		reordering = true;
		reorderFrame = requestAnimationFrame(() => (reordering = false));
	}
	span.onEnd(() => cancelAnimationFrame(reorderFrame));
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
		bump('structure', id, to);
		// `nearest` for a reorder: the card was already in view and only needs to stay
		// there, so a card that never left the viewport does not move it at all.
		void scrollCardIntoView(id, 'nearest');
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
		// No addr: the removed card has no address left, and the surviving cards'
		// addresses all shifted. The stack changed, not a leaf. The id still names
		// which card went, which is the one thing a host keying on it needs, and the
		// only handle the removal leaves it.
		bump('structure', id);
	}
	function retypeCardById(id: string, kind: string): void {
		const i = cardIndexOf(id);
		if (i < 0) return;
		try {
			doc.setCardKind(i, kind);
			bump('structure', id, i);
		} catch (e) {
			reportError(onError, {
				code: 'card-op-failed',
				severity: 'error',
				message: `retyping the card to ${kind} failed: ${errorMessage(e)}`,
				cause: e
			});
		}
	}
	function renameCardById(id: string, title: string): void {
		const i = cardIndexOf(id);
		if (i < 0) return;
		patchEditorExt(doc, { card: i }, { title });
		bump('structure', id, i);
	}
	/**
	 * Clear the tips channel: the dismissal write, and the only write
	 * tips make. `undefined` drops the key while `title` and any later sibling ride
	 * through; `ext.ts` holds why that matters.
	 */
	function dismissTips(): void {
		patchEditorExt(doc, MAIN_CARD_ADDR, { tips: undefined });
		// Document-level chrome, not a leaf's: no addr, as for a card removal, and no
		// card either. Tips ride `main`'s `$ext` because that is where a document-scoped
		// `$ext` lives, which is not a claim that the main card changed.
		bump('structure');
	}

	// ── Addressing + per-card op bundle ─────────────────────────────────────────
	/** A live card address: `card` is a getter, so a reorder re-targets in place. */
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
	// Producer #1: quill.validate(doc), re-run every revision.
	const validation = $derived.by(() => {
		revision; // re-run on every mutation, per VISUAL_EDITOR §Diagnostics
		try {
			return quill.validate(doc);
		} catch (e) {
			reportError(onError, {
				code: 'validate-failed',
				severity: 'error',
				message: `quill.validate threw; this derive contributes no validation diagnostics: ${errorMessage(e)}`,
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
		// One identity per field: the leaf registry, the DOM's three names, and the
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
			retype: (kind: string) => retypeCardById(id, kind),
			rename: (title: string) => renameCardById(id, title),
			diagFor: (field?: string) => diagByKey.get(leafKey(field)),
			// Bind the consumer policy hook to this field's resolved addr;
			// no hook → every option allowed.
			enumAllowed: (field: string, value: string) =>
				enumOptionAllowed?.(makeAddr(id, isMain, field), value) ?? true
		};
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
			// Asked only for a card that has a body, so the hook is never consulted
			// about one that renders none. The hook is pure by contract, so it is called
			// straight from the derive and its answer kept nowhere: a ghost holds still
			// across a re-derive because the function does.
			bodyGhost: hasBody
				? resolveBodyGhost(
						stringifyGhost(ghostDefault(rows.body ?? undefined)),
						merged.bodyPlaceholder?.({ cardId: id, kind, isMain }),
						merged.bodyGhost
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
				code: 'resolve-failed',
				severity: 'error',
				message: `quill.resolve threw; ghosted defaults fall back to none: ${errorMessage(e)}`,
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

	// ── Public entry points ─────────────────────────────────────────────────────
	/**
	 * Resolve a preview {@link Landing} to a mounted leaf and land in it.
	 *
	 * Async because the reveal has to render before the landing: a collapsed group
	 * is `inert`, which swallows a focus silently, so a caret placed in the same
	 * tick as the reveal would go nowhere and report nothing. The consumer's
	 * `onPick` ignores the promise: awaiting it is for a caller that wants to
	 * observe where the caret went.
	 *
	 * A destroy lands inside this one: `leaf` is looked up before the flush and
	 * dispatched into after it, and a PM view destroyed in that window throws on the
	 * dispatch. A consumer's `onPick` outlives the surface it points at too, so the
	 * span is asked on the way in as well as after the await.
	 */
	export async function setCaret(at: Landing): Promise<void> {
		const found = await revealLeaf(at.field);
		if (!found) return missed(`no mounted field at ${at.field}`, at.field);
		// A `'segment'` hit landed on origin-less ink (list markers, a code fence's
		// interior): `pos` is the segment start, not a cluster-exact caret
		// (HitGranularity), so it is dropped rather than snapped to a spot the click
		// did not resolve. `'cluster'` (and an absent granularity: the backend did not
		// report it, treat as exact) places the caret. An absent `pos` is the placement
		// rung and reaches the same floor.
		land(found, at.granularity === 'segment' ? undefined : at.pos);
		// The arrival cue. Unconditional, unlike the preview side's change-guarded
		// bloom: a preview click is one discrete act, and its commonest target is the
		// leaf already focused (where landing a caret changes nothing on screen) or
		// one off-screen, where the browser's focus-scroll moves the page and leaves
		// the caret to be hunted for in a long form.
		bloomInside(found.control.el);
	}
	/** The active leaf's controller: the formatting popover's observation seam.
	 *  `undefined` for a focused form control, which holds no marks to toggle. */
	export function getActiveLeaf(): FieldController | undefined {
		if (!activeAddr) return undefined;
		const card = activeAddr.card != null ? activeCardId : undefined;
		return leaves.prose(fieldKeyToString({ card, field: activeAddr.field }));
	}

	/**
	 * Reveal the field at `field` and hand back its landing handle plus the target it
	 * resolved to, once the reveal has rendered. The shared half of the two landing
	 * verbs: a collapsed group is clipped to zero height and sits inside an `inert`
	 * panel, which swallows a focus silently, so a caret placed in the same tick as the
	 * reveal goes nowhere and reports nothing. Exactly one card holds the key; the rest
	 * do nothing.
	 *
	 * The target comes back with the handle because the caller needs its key to ask for
	 * the codec lane (`leaves.prose`), and minting it twice would be two parses of one
	 * path. The reveal itself is the key's: a group holds the field, and an element
	 * address opens the same group its array sits in.
	 *
	 * A destroy lands inside this: the field is looked up before the flush and
	 * dispatched into after it, and a PM view destroyed in that window throws on the
	 * dispatch. A consumer's call outlives the surface it points at too, so the span is
	 * asked on the way in as well as after the await.
	 */
	async function revealLeaf(field: DocPath): Promise<Landed | undefined> {
		if (!span.alive) return undefined;
		const target = leafTargetFor(field);
		const control = target && leaves.control(target.key);
		if (!target || !control) return undefined;
		mainCard?.revealLeaf(target.key);
		for (const card of cardRefs) card?.revealLeaf(target.key);
		if (!(await span.resumes(tick()))) return undefined;
		return { ...target, control };
	}

	/**
	 * Put the caret in a revealed target, at the finest grain it can take.
	 *
	 * - An element address focuses that row, with no caret inside it: an array element
	 *   is no `createField` leaf and its handle is a bare focus.
	 * - A prose leaf with a `pos` takes the caret at that USV offset.
	 * - Everything else takes the focus alone: the offset is a position in rendered
	 *   content and a form control has no coordinate to spend it in (an
	 *   `<input type="number">` refuses a selection outright), which is also the whole
	 *   of what a click on plate-placed ink can mean.
	 */
	function land(found: Landed, pos: number | undefined): void {
		if (found.element != null && found.control.focusElement) {
			return found.control.focusElement(found.element);
		}
		if (pos != null) {
			const prose = leaves.prose(found.key);
			if (prose) return prose.setCaret(pos);
		}
		found.control.focus();
	}

	// ── The verbs, as instance exports ──────────────────────────────────────────
	// The same functions the card's own chrome calls, reached through `bind:this`: a
	// host toolbar, command palette or shortcut wants the door the card header gets,
	// and every one of them reports through `onChange` exactly as the click does.
	// They speak the public vocabulary — a `DocPath` for a place, a `CardId` for a
	// card — so a host drives them with what the hooks handed it.
	//
	// A target the surface does not hold is a no-op that reports `target-unknown` at
	// `dev`: a key from a previous session or a card already removed, or a path naming
	// no declared field — an element path (`main.references.0`) whose array is
	// undeclared or unmounted included, that being the only way one misses. `setCaret`
	// reports it too, being the verb a preview click drives: a landing that resolved
	// nothing is indistinguishable from one that landed, and a consumer wiring the
	// bridge reads the difference off nothing else.

	/**
	 * Reveal and focus the field at `field`, without placing a caret inside it. Any
	 * mounted field: a prose leaf takes its view's focus, a form control takes the same
	 * handoff a click on its label does (`Field`, `leaves.ts`), and an element address
	 * takes its own row.
	 */
	export async function focusField(field: DocPath): Promise<void> {
		const found = await revealLeaf(field);
		if (!found) return missed(`no mounted field at ${field}`, field);
		land(found, undefined);
		bloomInside(found.control.el);
	}
	/** Seed a card of `kind` and insert it at `at` (default: the end). Returns the new
	 *  card's session key, or `undefined` when the quill seeds no card of that kind. */
	export function insertCard(kind: string, at: number = cardIds.length): CardId | undefined {
		return addCard(Math.min(Math.max(at, 0), cardIds.length), kind);
	}
	export function removeCard(cardId: CardId): void {
		if (!holds(cardId)) return;
		removeCardById(cardId);
	}
	/** Move a card one slot. The step the reorder control takes, and the one the
	 *  surface animates; at either edge it is a no-op. */
	export function moveCard(cardId: CardId, dir: -1 | 1): void {
		if (!holds(cardId)) return;
		moveCardById(cardId, dir);
	}
	export function setKind(cardId: CardId, kind: string): void {
		if (!holds(cardId)) return;
		retypeCardById(cardId, kind);
	}

	function holds(cardId: CardId): boolean {
		if (cardIndexOf(cardId) >= 0) return true;
		missed(`no card ${cardId} in this session`);
		return false;
	}
	function missed(message: string, path?: DocPath): void {
		reportError(onError, { code: 'target-unknown', severity: 'dev', message, path });
	}

	/** What a `DocPath` resolves to in the mounted tree: a leaf key, and the array
	 *  element within it when the address names one. */
	interface LeafTarget {
		key: string;
		element?: number;
	}
	/** A resolved target with the handle the registry holds for it. */
	type Landed = LeafTarget & { control: FieldControl };

	/**
	 * Map a landing's `field` (a canonical `DocPath`) to a mounted target: the
	 * `addrForFieldPath` route the diagnostics take, the absolute card index resolved
	 * to its live stable id, then the shared `fieldKeyToString` form.
	 *
	 * Two rungs, because the boundary mints addresses at a finer granularity than
	 * `Addr` can name: a `richtext[]` element surfaces as `main.references.0`, which
	 * the grammar reads as a field literally named `"0"`. The second rung reads that
	 * trailing segment as an index, under a field the schema declares an array — which
	 * is why the ladder is the editor's (VISUAL_EDITOR.md §Surface): the preview
	 * carries no schema, and truncating the address there is worse than guessing, since
	 * `pos` is an offset into the element's own content.
	 */
	function leafTargetFor(field: DocPath): LeafTarget | undefined {
		const direct = addrForFieldPath(field);
		if (direct) {
			const resolved = resolveCardKey(direct, cardIds);
			return resolved ? { key: fieldKeyToString(resolved) } : undefined;
		}
		const element = elementAddrForFieldPath(field);
		if (!element || !isArrayField(element.field)) return undefined;
		const resolved = resolveCardKey(element.field, cardIds);
		return resolved ? { key: fieldKeyToString(resolved), element: element.index } : undefined;
	}

	/** Whether `addr` names a field this document renders as an array repeater: the
	 *  guard the element rung stands on. Asked of `controlKind`, so what the ladder
	 *  tests is the control the tree mounted — the one holding a `focusElement` — and
	 *  not a second reading of the schema beside it. */
	function isArrayField(addr: Addr): boolean {
		if (addr.field == null) return false;
		const kind = addr.card == null ? undefined : model.cards[addr.card]?.kind;
		const schema = quill.schema;
		const card = addr.card == null ? schema.main : kind ? schema.card_kinds?.[kind] : undefined;
		const declared = card?.fields?.[addr.field];
		return !!declared && controlKind(declared) === 'array';
	}
</script>

<div class="qm-editor {className ?? ''}" {style} data-qm-root bind:this={rootEl}>
	<!-- `main` and the tips card are one block in the stack: the tips card tucks under
	 `main`'s bottom corners, so the two share a seam rather than a gutter and the
	 wrapper is what holds them to it. -->
	<div class="qm-primary">
		<Card
			bind:this={mainCard}
			card={model.main}
			{doc}
			{quill}
			index={-1}
			isFirst={true}
			isLast={true}
			{kinds}
			ops={opsFor('main', true)}
			{enumDisallowed}
			onFocus={handleFocus}
			onCaretMove={handleCaret}
			onChange={proseChanged}
			{onError}
			{leaves}
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
	<!-- A card and the gap under it are one slot, which is what a reorder moves: the
	 strip below a card is the same strip wherever the card lands, so it rides along
	 rather than being slid across. It is also the shape `animate:` asks for, being the
	 keyed block's only child. -->
	{#each model.cards as c, i (c.id)}
		<div class="qm-card-slot" animate:reorder={isReordering}>
			<Card
				bind:this={cardRefs[i]}
				card={c}
				{doc}
				{quill}
				index={i}
				isFirst={i === 0}
				isLast={i === model.cards.length - 1}
				{kinds}
				ops={opsFor(c.id, false)}
				{enumDisallowed}
				onFocus={handleFocus}
				onCaretMove={handleCaret}
				onChange={proseChanged}
				{onError}
				{leaves}
			/>
			{@render addAffordance(i + 1)}
		</div>
	{/each}
</div>

<FormatPopover {getActiveLeaf} />

<!-- Cards always render; the add affordance is gated on the schema declaring
 `card_kinds`, since there is nothing to seed otherwise. A card already in the
 document shows regardless of its kind: a kind with no schema (foreign, or a
 schema with no `card_kinds` at all) degrades to a recovery shell inside <Card>
 (retype + delete), never gated away, so its content is neither dropped nor
 trapped. The gate lives here rather than at each call site: the strip is one
 decision, and two copies of it drift into a stack with a gap at one end. -->
{#snippet addAffordance(atIndex: number)}
	{#if kinds.length}
		<!-- The strip past the last card is the append point, the one a reader looks for
		 rather than finds by position, so it alone states itself in words at rest. The
		 gaps between cards stay bare: the strip is the gap, and the pill each fills on
		 hover draws what a label would state, the space the new card takes. -->
		{@const marked = atIndex === model.cards.length}
		<div class="qm-add-card" class:qm-add-card-marked={marked}>
			<!-- Marked, the words are the accessible name and no `aria-label` doubles
			 them; bare, the same words land as the label, the strip having no
			 geometry to carry them. -->
			{#if kinds.length === 1}
				<button
					type="button"
					class="qm-add-btn qm-add-affordance qm-tap-floor"
					aria-label={marked ? undefined : merged.addCard}
					onclick={() => addCard(atIndex, kinds[0])}>{marked ? merged.addCard : ''}</button
				>
			{:else}
				<!-- Multi-kind add: pick the kind, then seed + insert. A menu rather than a
			 disclosure: it floats out of the stack, so raising it moves no card, and
			 it dismisses on pick, on Escape and on a click outside, none of which a
			 `<details>` does. The trigger is bits-ui's `<button>`, which is why the
			 rules below reach it through `:global`. -->
				<DropdownMenu.Root>
					<DropdownMenu.Trigger
						class="qm-add-btn qm-add-affordance qm-tap-floor"
						aria-label={marked ? undefined : merged.addCard}
						>{marked ? merged.addCard : ''}</DropdownMenu.Trigger
					>
					<DropdownMenu.Portal to={rootEl}>
						<DropdownMenu.Content sideOffset={4}>
							<!-- Portalled out of the row but into the stack's root, and carrying the
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
	 a detached root, one of those core/theme.css applies the derivation to. The
	 root rule also carries the baseline font and colour, so nothing here restates
	 them. Nothing here mints; `check:style` enforces that. */
	/* The column, not only the cards in it: the gutter the stack sits in and the tone
	   behind it are the surface's own, so a bare `<div>` is a mounting site and
	   nothing is owed before the editor looks right. Consumer CSS is unlayered and
	   beats all of it, which is how a host that wants the column back takes it.
	   `border-box`, so a height from the caller is the height this draws.

	   The sunken rung, which is what makes a card an island: the cards are the base
	   plane and this is the one they float on, so the gutter reads as ground rather
	   than as more card (ARCHITECTURE §Styling). The inset is the widest rung on the
	   ramp, which is what gives the ground enough of itself to read as ground: at a
	   narrower one the stack meets whatever frames the surface and the islands are
	   back to being one block clipped at its edges. */
	.qm-editor {
		box-sizing: border-box;
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
		padding: var(--_qm-space-5);
		background: var(--_qm-surface-sunken);
		color: var(--_qm-ink);
	}
	/* A fixed-height pane, which the stack is not by default, and the four popovers
	   are the reason: each resolves its portal target with
	   `closest('[data-qm-root]')`, which is this element, so an `overflow` here
	   clips the menu a leaf raised. Mounted in a page that scrolls, nothing clips;
	   mounted in a pane that does, the host says so and takes the clipping it would
	   have had from its own scrolling frame either way. The tail rides with the
	   scroller because it is only meaningful under one: dead space below the last
	   card, so it can be read mid-pane rather than against the bottom edge.

	   The height is what makes the rest of the rule mean anything, and it is the
	   pane's rather than a number of ours: `overflow` on a box that grows to its
	   content never has anything to scroll, so the stack would run past the pane
	   and be clipped by whatever the host frames it with. Taking the pane's height
	   is the whole of what `.qm-pane` claims (THEMING §"Drop it in": the surface
	   becomes its own scroll container), and it resolves to `auto` — today's page
	   behaviour, so a class on a mounting site with no height of its own changes
	   nothing. The cards below do not shrink to fit it: a flex item's automatic
	   minimum floors each at its own height, so the stack overflows and scrolls
	   rather than squashing. `.qm-preview` states the same thing for the same
	   reason, unconditionally, having no page form to keep. */
	.qm-editor.qm-pane {
		height: 100%;
		overflow: auto;
		overscroll-behavior: contain;
		padding-block-end: var(--_qm-tail);
	}
	/* The stack's one gapless seam, which `TipsCard` draws and this holds the two
	 blocks to. `main` has to paint over the tip: a later sibling paints over an earlier
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
	 by position, so reveal and hit region are the full-bleed row rather than a word
	 to aim at in the middle of it. It takes the editor's gap back on both sides, so
	 it is not a control sitting in the gutter; it is the gutter: what separates two
	 cards is the trigger's own height and nothing else, and the pill it fills on hover
	 is edge to edge the space the new card opens into. No band is held back as
	 miss-tolerance: gutter that reads as the trigger and inserts nothing unsays what
	 the fill claims, so a press anywhere between two cards inserts. Absorbed rather
	 than removed, because `gap` is also what separates the one seam no strip sits in:
	 every card from the next under a quill declaring no kinds, where the affordance
	 does not render at all. */
	.qm-add-card {
		display: flex;
		margin-top: calc(var(--_qm-space-2) * -1);
		margin-bottom: calc(var(--_qm-space-2) * -1);
	}
	/* Unboxed, like every button, and not dashed: a
	 dashed edge is the placeholder idiom ("nothing is here yet") which on a button
	 reads as disabled or as a drop target. It stays honest in one place, the
	 un-schemable card (`Card.svelte`), which is a state rather than a control. A bare
	 trigger rests invisible, so the fill is the whole of what it shows: the pill fills
	 the strip because the strip is what was pressed, and the strip is the gap, so the
	 fill is the card-to-be drawn where it will land. Every gap is an equal entry point,
	 reached by the name rather than by a mark: a card goes anywhere in the stack, not
	 just after the last one.

	 No inset of its own: the pill and the gap are the same rectangle, and a bare strip is
	 a band of gutter, so its height is a rhythm rung. The press floor the box gives up is
	 `.qm-tap-floor`'s (controls.css); what it overhangs is the card's own inset above and
	 below, which holds no target, so the floor costs a neighbour nothing.

	 Ink is pinned to the label tone in every state, taking back the family's hover step:
	 the trigger arrives and leaves on opacity, and a tone moving under an opacity already
	 moving reads as two trips at different speeds.

	 `:global`, because the multi-kind trigger is bits-ui's own element and a `class`
	 passed to a primitive is a plain string that never picks up the scoping hash:
	 the same seam the enum trigger is styled through. */
	.qm-add-card :global(.qm-add-btn) {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: var(--_qm-space-4);
		color: var(--_qm-ink-label);
		opacity: 0;
		transition:
			opacity var(--_qm-reveal),
			background-color var(--_qm-reveal);
	}
	/* The strip that holds words at rest takes the height that centres them, and rests dim
	   rather than absent, having something to be seen. */
	.qm-add-card-marked :global(.qm-add-btn) {
		height: var(--_qm-tap-min);
		font-size: var(--_qm-text-label);
		font-weight: var(--_qm-weight-mid);
		opacity: var(--_qm-opacity-idle);
	}
	/* One arrival, three ways in. Keyboard focus, because the fill is the only thing that
	   reads as the trigger on a bare strip; and an open menu, because it portals out of
	   the strip, so a pointer moving onto an item has left the row whose hover was drawing
	   the pill the menu hangs from. */
	.qm-add-card :global(.qm-add-btn:hover),
	.qm-add-card :global(.qm-add-btn:focus-visible),
	.qm-add-card :global(.qm-add-btn[data-state='open']) {
		opacity: 1;
		background: var(--_qm-add-fill);
	}
</style>
