<!--
  The federated WYSIWYG surface (VISUAL_EDITOR). A THIN composition over many
  small editors — NOT one PM document spanning the page. It owns:
    • structure — the schema × payload join, re-derived from the live `Document`;
    • stable card identity — a session-id array reordered in lockstep with the
      content, resolved to an index ONLY at the mutation boundary;
    • commit routing — prose leaves lower to `applyChange` (in the codec); scalars/
      arrays/objects go through the typed `writer`; structure through the mutators;
    • focus + the bridge outputs (`onActiveAddrChange`, `onCaretMove`) and the
      `setCaret(hit)` entry Phase 5 wires to the preview;
    • the ONE formatting popover (`FormatPopover`, mounted once, observing the
      active leaf via `getActiveLeaf`) and diagnostics routing (`diagnostics.ts`:
      quill.validate + local commit errors + the external `diagnostics` prop,
      merged into `diagByKey` and threaded to each `<Field>`/card body).

  REACTIVITY ACROSS THE WASM HANDLE. The `Document` is opaque to Svelte, so a
  `revision` counter is bumped after every scalar/structure mutation and the card
  tree is `$derived` by RE-READING `doc.main`/`doc.cards`/`quill.schema`. Prose
  leaves are mounted ONCE per stable leaf key (keyed `<Card>`/`<ProseField>`);
  they commit to the doc directly and do NOT bump `revision`, so a re-derive never
  remounts them or drops a caret. `doc.main`/`doc.cards` allocate per read — read
  once per derive.
-->
<script lang="ts">
	import { isQuillmarkError, MAIN_CARD_ADDR } from '../core/index.js';
	import type {
		Document,
		Quill,
		Addr,
		CardAddr,
		Diagnostic,
		ContentHit,
		Resolved,
		ResolvedField
	} from '../core/index.js';
	import type { FieldController } from '../core/codec/index.js';
	import {
		IdSeq,
		initIds,
		idIndex,
		fieldModels,
		groupOrder,
		groupSections,
		groupLabel,
		cardTitle,
		bodyEnabled,
		humanize,
		provenanceMap,
		provenanceByCardIndex,
		bodyByCardIndex,
		bodyGhostText,
		type CardModel
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
	import { tipsChannel } from './tips.js';
	import { patchEditorExt } from './ext.js';
	import Card from './Card.svelte';
	import TipsCard from './TipsCard.svelte';
	import FormatPopover from './FormatPopover.svelte';

	/**
	 * REMOUNT CONTRACT. `cardIds`, the id `seq`, and the leaf registry seed ONCE
	 * from the initial `doc` (see the reactivity note above); swapping `doc`/`quill`
	 * in place is NOT observed and silently desyncs the card tree. Swap by
	 * REMOUNTING (`{#key doc}`, as the playground does) — edits flow the other way,
	 * mutating the passed-in `doc` handle directly.
	 */
	interface Props {
		doc: Document;
		quill: Quill;
		/** The active leaf's address (normalized to a plain `{card?, field?}`). */
		onActiveAddrChange?: (addr: Addr) => void;
		/** A caret move in the active leaf → the preview bridge (Phase 5). */
		onCaretMove?: (addr: Addr, pos: number) => void;
		/** Fired after every scalar/structure mutation — a change signal for a host. */
		onChange?: () => void;
		/**
		 * External diagnostics (Phase 5: `LiveSession.warnings` + render errors via
		 * `FieldRegion.field`), routed by `.path` and merged with `quill.validate`
		 * and local commit errors (VISUAL_EDITOR §Diagnostics).
		 */
		diagnostics?: Diagnostic[];
		/**
		 * Consumer policy hook (issue #73): given a field `addr` and an enum option,
		 * return `false` to mark that option unavailable. A disallowed option renders
		 * DISABLED (never stripped), so an already-authored value stays visible and its
		 * stored payload is untouched — the schema is unchanged, this is runtime policy.
		 * Absent → every schema option is offered (the default, zero behavior change).
		 */
		enumOptionAllowed?: (addr: Addr, value: string) => boolean;
		/** Appended to the root's own class — the surface is a mounted element the
		 *  consumer positions, so it needs a handle for layout it owns. */
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
		diagnostics,
		enumOptionAllowed,
		class: className,
		style
	}: Props = $props();

	// ── Reactivity + session identity ───────────────────────────────────────────
	let revision = $state(0);
	const seq = new IdSeq();
	// Session ids, one per composable card, reordered in lockstep with structure ops.
	// svelte-ignore state_referenced_locally
	let cardIds = $state<string[]>(initIds(doc.cardCount, seq));

	// Local commit-error diagnostics (VISUAL_EDITOR §Diagnostics, producer #2):
	// one slot per field key, replaced on each failed `commitScalar`, cleared on
	// the next successful one for that field. Id-keyed (not positional) so an
	// error stays pinned to its field across a card reorder.
	let commitErrors = $state(new Map<string, RoutedDiagnostic>());

	const kinds = $derived(Object.keys(quill.schema.card_kinds ?? {}));

	function bump(): void {
		revision++;
		onChange?.();
	}
	/** Resolve a stable card id to its current content index (the mutation boundary). */
	function cardIndexOf(id: string): number {
		return idIndex(cardIds, id);
	}

	// ── Leaf registry (setCaret target lookup + the 4b active-leaf seam) ────────
	const leaves = new Map<string, FieldController>();
	function register(key: string, controller: FieldController): void {
		leaves.set(key, controller);
	}
	function unregister(key: string): void {
		leaves.delete(key);
	}

	// ── Focus + bridge outputs ──────────────────────────────────────────────────
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
		onActiveAddrChange?.(plain);
	}
	function handleCaret(addr: Addr, pos: number): void {
		onCaretMove?.(normalize(addr), pos);
	}

	// ── Commit routing ──────────────────────────────────────────────────────────
	// Scalars / arrays / objects → the typed writer (schema-checked). Prose leaves
	// commit themselves via the codec (applyChange) and do NOT pass through here.
	// A scalar control commits `undefined` for a cleared entry — the unset lane
	// below (`doc.removeField`), not a write.
	//
	// A bad value makes `writer.set` THROW a `QuillmarkError`; as of 0.96.0 its
	// `diagnostics[0]` carries a `code` and a canonical `path` (e.g.
	// `edit::field_conform` at `main.font_size`, or `edit::unknown_field`). The
	// editor already KNOWS the field/card being committed, so it KEYS the entry
	// from THAT address — id-keyed so it survives a later card reorder, never
	// parsed from the positional path — while surfacing the thrown diagnostic
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
				// (canon SCHEMAS.md — the engine never persists a default; nor do we).
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
			if (commitErrors.has(keyStr)) {
				const next = new Map(commitErrors);
				next.delete(keyStr);
				commitErrors = next;
			}
			bump();
		} catch (e) {
			const diagnostic: Diagnostic = (isQuillmarkError(e) ? e.diagnostics[0] : undefined) ?? {
				severity: 'error',
				message: e instanceof Error ? e.message : String(e)
			};
			const next = new Map(commitErrors);
			next.set(keyStr, { key, diagnostic });
			commitErrors = next;
			console.error('[quillmark/editor] scalar commit failed', e);
		}
	}

	// ── Structure mutators (resolve id→index here, then reorder ids in lockstep) ──
	function addCard(atIndex: number, kind: string): void {
		try {
			const overlay = doc.seedOverlay(kind);
			const card = quill.seedCard(kind, overlay);
			if (!card) return;
			doc.insertCard(card, atIndex);
			cardIds = [...cardIds.slice(0, atIndex), seq.next(), ...cardIds.slice(atIndex)];
			bump();
		} catch (e) {
			console.error('[quillmark/editor] addCard failed', e);
		}
	}
	function moveCardById(id: string, dir: -1 | 1): void {
		const from = cardIndexOf(id);
		if (from < 0) return;
		const to = from + dir;
		if (to < 0 || to >= doc.cardCount) return;
		doc.moveCard(from, to);
		const w = cardIds.slice();
		const [x] = w.splice(from, 1);
		w.splice(to, 0, x);
		cardIds = w;
		bump();
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
		// Drop any commit-error diagnostics id-keyed to the now-gone card — id-keying
		// (VISUAL_EDITOR §"The address is the spine") avoids mis-attributing them to
		// whichever card next takes this position, but an orphaned entry would
		// otherwise sit in the map forever (ids are never reused).
		if ([...commitErrors.keys()].some((k) => k.startsWith(`${id}:`))) {
			const next = new Map(commitErrors);
			for (const k of [...next.keys()]) if (k.startsWith(`${id}:`)) next.delete(k);
			commitErrors = next;
		}
		bump();
	}
	function retypeCardById(id: string, kind: string): void {
		const i = cardIndexOf(id);
		if (i < 0) return;
		try {
			doc.setCardKind(i, kind);
			bump();
		} catch (e) {
			console.error('[quillmark/editor] retype failed', e);
		}
	}
	function renameCardById(id: string, title: string): void {
		const i = cardIndexOf(id);
		if (i < 0) return;
		patchEditorExt(doc, { card: i }, { title });
		bump();
	}
	/**
	 * Clear the tips channel (issue #71) — the dismissal write, and the ONLY write
	 * tips make. `undefined` drops the key while `title` and any later sibling ride
	 * through; `ext.ts` holds why that matters.
	 */
	function dismissTips(): void {
		patchEditorExt(doc, MAIN_CARD_ADDR, { tips: undefined });
		bump();
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
	// `[]` for usaf_memo — no field in the fixture carries a `!must_fill` marker —
	// but the routing exists for the general contract, not just this fixture).
	const validation = $derived.by(() => {
		revision; // re-run on every mutation, per VISUAL_EDITOR §Diagnostics
		try {
			return quill.validate(doc);
		} catch (e) {
			console.error('[quillmark/editor] validate failed', e);
			return [] as Diagnostic[];
		}
	});

	// Merge all three producers: validate() + external (both positional `.path`,
	// resolved to the live stable-id keying) + local commit errors (already
	// id-keyed). Precedence is errors-before-warnings within a field's list
	// (mergeDiagnostics sorts; nothing is dropped — diagnostics never gate, so
	// nothing here hides one either).
	const diagByKey = $derived.by(() => {
		const fromValidate = routeAndResolve(validation, cardIds);
		const fromExternal = routeAndResolve(diagnostics, cardIds);
		return mergeDiagnostics(fromValidate, fromExternal, [...commitErrors.values()]);
	});
	function diagFor(id: string, isMain: boolean, field?: string): Diagnostic[] | undefined {
		return diagByKey.get(fieldKeyToString({ card: isMain ? undefined : id, field }));
	}

	function opsFor(id: string, isMain: boolean) {
		return {
			makeAddr: (field?: string) => makeAddr(id, isMain, field),
			// The leaf-registry key space IS the diagnostics FieldKey space — one
			// `fieldKeyToString`, so a leaf and its diagnostics resolve to one string.
			leafKey: (field?: string) => fieldKeyToString({ card: isMain ? undefined : id, field }),
			commit: (name: string, value: unknown) => commitScalar(id, isMain, name, value),
			move: (dir: -1 | 1) => moveCardById(id, dir),
			remove: () => removeCardById(id),
			retype: (kind: string) => retypeCardById(id, kind),
			rename: (title: string) => renameCardById(id, title),
			diagFor: (field?: string) => diagFor(id, isMain, field),
			// Bind the consumer policy hook to this field's resolved addr (issue #73);
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
		resolvedFields: ResolvedField[],
		resolvedBody: ResolvedField | null
	): CardModel {
		const values: Record<string, unknown> = {};
		for (const p of card.payloadItems)
			if (p.type === 'field' && p.key != null) values[p.key] = p.value;
		const fields = cardSchema ? fieldModels(cardSchema) : [];
		const sections = cardSchema
			? groupSections(fields, groupOrder(cardSchema), (g) => groupLabel(cardSchema, g))
			: [];
		const extEditor = card.ext?.editor as { title?: string } | undefined;
		return {
			id,
			isMain,
			kind,
			// No schema for this kind → a recovery shell, not a field list (issue #72).
			// `main` always resolves `schema.main`, so it is never unschemable.
			unschemable: !isMain && !cardSchema,
			titleOverride: extEditor?.title ?? '',
			titlePlaceholder: cardTitle(cardSchema, kind, values, undefined),
			values,
			provenance: provenanceMap(resolvedFields),
			sections,
			hasBody: bodyEnabled(cardSchema),
			bodyGhost: bodyGhostText(resolvedBody)
		};
	}

	const model = $derived.by(() => {
		revision; // re-derive on every mutation
		const schema = quill.schema;
		const main = doc.main; // allocate once
		const cards = doc.cards; // allocate once
		// The provenance channel (FIELD_PROVENANCE → #64): one whole-doc resolve per
		// derive, feeding the ghosted `default:` only. Guarded — provenance is
		// chrome, so a resolve failure degrades to no ghosts, never a blank form.
		let resolved: Resolved | undefined;
		try {
			resolved = quill.resolve(doc);
		} catch (e) {
			console.error('[quillmark/editor] quill.resolve failed; ghosts fall back to none', e);
		}
		const byCard = provenanceByCardIndex(resolved);
		const bodyByCard = bodyByCardIndex(resolved);
		return {
			// Tips are DOCUMENT-level, not a property of the main card (issue #71): they
			// hang off `main`'s `$ext` because that is where a document-scoped `$ext`
			// lives, and the model says so at the root rather than making every card
			// carry a field one card renders.
			tips: tipsChannel((main.ext?.editor as { tips?: unknown } | undefined)?.tips),
			main: buildCard(
				'main',
				true,
				'main',
				main,
				schema.main,
				resolved?.main.fields ?? [],
				resolved?.main.body ?? null
			),
			cards: cards.map((c, i) =>
				buildCard(
					cardIds[i] ?? `orphan${i}`,
					false,
					c.kind,
					c,
					schema.card_kinds?.[c.kind],
					byCard.get(i) ?? [],
					bodyByCard.get(i) ?? null
				)
			)
		};
	});

	// ── Public entry points ─────────────────────────────────────────────────────
	/** Resolve a preview `ContentHit` to a mounted leaf and place its caret (Phase 5). */
	export function setCaret(hit: ContentHit): void {
		const key = leafKeyForHit(hit.field);
		if (!key) return;
		const leaf = leaves.get(key);
		if (!leaf) return;
		// A `'segment'` hit landed on origin-less ink (list markers, a code fence's
		// interior): `pos` is the segment START, not a cluster-exact caret
		// (HitGranularity), so just focus the leaf rather than snap the caret to a
		// spot the click did not resolve. `'cluster'` (and an absent granularity —
		// the backend did not report it, treat as exact) places the caret.
		if (hit.granularity === 'segment') leaf.focus();
		else leaf.setCaret(hit.pos);
	}
	/** The active leaf's controller — the 4b formatting-popover observation seam. */
	export function getActiveLeaf(): FieldController | undefined {
		if (!activeAddr) return undefined;
		const card = activeAddr.card != null ? activeCardId : undefined;
		return leaves.get(fieldKeyToString({ card, field: activeAddr.field }));
	}

	/** Map a `ContentHit.field` (a canonical `DocPath`) to a mounted leaf key — the
	 * same `parseDocPath` route the diagnostics take, the absolute card index
	 * resolved to its live stable id, then the shared `fieldKeyToString` form. */
	function leafKeyForHit(field: string): string | undefined {
		const key = parsePath(field);
		if (!key) return undefined;
		const resolved = resolveCardKey(key, cardIds);
		return resolved ? fieldKeyToString(resolved) : undefined;
	}
</script>

<div class="qm-editor {className ?? ''}" {style} data-qm-root>
	<Card
		card={model.main}
		{doc}
		index={-1}
		isFirst={true}
		isLast={true}
		active={activeCardId === 'main'}
		{kinds}
		ops={opsFor('main', true)}
		onFocus={handleFocus}
		onCaretMove={handleCaret}
		{register}
		{unregister}
	/>

	<!-- The tips card (issue #71): a fixed slot after `main`, ahead of the cards, so
	     document-level guidance reads as document-level and never displaces a field.
	     Absent when the channel is empty — which is what dismissal makes it, so the
	     card leaves for good (VISUAL_EDITOR §"Card operations"). -->
	{#if model.tips.length}
		<TipsCard tips={model.tips} onDismiss={dismissTips} />
	{/if}

	<!-- Cards always render (issue #72). The ADD affordance is gated on the schema
	     declaring `card_kinds` — nothing to seed otherwise — but a card already in the
	     document shows regardless of its kind: a kind with no schema (foreign, or a
	     schema with no `card_kinds` at all, the case issue #21 tracks) degrades to a
	     recovery shell inside <Card> (retype + delete), never gated away, so its content
	     is neither dropped nor trapped. -->
	{#if kinds.length}
		{@render addAffordance(0, model.cards.length === 0)}
	{/if}
	{#each model.cards as c, i (c.id)}
		<Card
			card={c}
			{doc}
			index={i}
			isFirst={i === 0}
			isLast={i === model.cards.length - 1}
			active={activeCardId === c.id}
			{kinds}
			ops={opsFor(c.id, false)}
			onFocus={handleFocus}
			onCaretMove={handleCaret}
			{register}
			{unregister}
		/>
		{#if kinds.length}
			{@render addAffordance(i + 1, i === model.cards.length - 1)}
		{/if}
	{/each}
</div>

<FormatPopover {getActiveLeaf} />

{#snippet addAffordance(atIndex: number, isLast: boolean)}
	<div class="qm-add-card" class:is-last={isLast}>
		{#if kinds.length === 1}
			<button
				type="button"
				class="qm-add-btn"
				data-testid={`add-card-${atIndex}`}
				onclick={() => addCard(atIndex, kinds[0])}>+ Add {humanize(kinds[0])}</button
			>
		{:else}
			<!-- Multi-kind add: pick the kind, then seed + insert (fixture has one kind). -->
			<details class="qm-add-menu">
				<summary class="qm-add-btn" data-testid={`add-card-${atIndex}`}>+ Add card</summary>
				<div class="qm-add-kinds">
					{#each kinds as k (k)}
						<button
							type="button"
							data-testid={`add-card-${atIndex}-${k}`}
							onclick={(e) => {
								addCard(atIndex, k);
								// <details> has no auto-close on selection.
								(e.currentTarget as HTMLElement).closest('details')?.removeAttribute('open');
							}}>{humanize(k)}</button
						>
					{/each}
				</div>
			</details>
		{/if}
	</div>
{/snippet}

<style>
	/* The private scale lands via `data-qm-root` on the root element above — this is
	   a DETACHED root, one of those core/theme.css applies the derivation to. The
	   root rule also carries the baseline font and colour, so nothing here restates
	   them. Nothing here mints; `check:style` enforces that. */
	.qm-editor {
		display: flex;
		flex-direction: column;
		gap: var(--_qm-space-2);
		color: var(--_qm-ink);
	}
	.qm-add-card {
		display: flex;
		justify-content: center;
	}
	.qm-add-btn {
		border: 1px dashed var(--_qm-border);
		background: transparent;
		border-radius: var(--_qm-radius-inner);
		cursor: pointer;
		padding: var(--_qm-space-half) var(--_qm-space-4);
		font-size: var(--_qm-text-body);
		color: var(--_qm-ink-label);
		list-style: none;
		/* Recede until engaged (issue #58 §6; AESTHETIC §"minimal UI"): each gap's
		   trigger is invisible at rest and surfaces on hover or keyboard focus, so the
		   stack reads as content, not a toolbar per gap. The LAST gap keeps a dim
		   label — exactly one entry point stays visible. Opacity (not display) so the
		   pill reserves its height and the row does not jump on reveal. */
		opacity: 0;
		transition: opacity 120ms ease;
	}
	.qm-add-card:hover .qm-add-btn,
	.qm-add-btn:focus-visible {
		opacity: 1;
	}
	.qm-add-card.is-last .qm-add-btn {
		opacity: var(--_qm-opacity-idle);
	}
	.qm-add-card.is-last:hover .qm-add-btn,
	.qm-add-card.is-last .qm-add-btn:focus-visible {
		opacity: 1;
	}
	/* Touch has no hover — keep a faint always-on affordance so add stays reachable. */
	@media (hover: none) {
		.qm-add-btn {
			opacity: var(--_qm-opacity-idle);
		}
	}
	.qm-add-btn:hover {
		border-color: var(--_qm-border-strong);
		color: var(--_qm-ink);
	}
	.qm-add-menu {
		position: relative;
	}
	.qm-add-kinds {
		display: flex;
		gap: var(--_qm-space);
		margin-top: var(--_qm-space);
	}
</style>
