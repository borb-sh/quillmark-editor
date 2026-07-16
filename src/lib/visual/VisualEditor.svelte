<!--
  The federated WYSIWYG surface (VISUAL_EDITOR). A THIN composition over many
  small editors — NOT one PM document spanning the page. It owns:
    • structure — the schema × payload join, re-derived from the live `Document`;
    • stable card identity — a session-id array reordered in lockstep with the
      corpus, resolved to an index ONLY at the mutation boundary;
    • commit routing — prose leaves lower to `applyChange` (in the codec); scalars/
      arrays/objects go through the typed `writer`; structure through the mutators;
    • focus + the bridge outputs (`onActiveAddrChange`, `onCaretMove`) and the
      `setCaret(hit)` entry Phase 5 wires to the preview.

  REACTIVITY ACROSS THE WASM HANDLE. The `Document` is opaque to Svelte, so a
  `revision` counter is bumped after every scalar/structure mutation and the card
  tree is `$derived` by RE-READING `doc.main`/`doc.cards`/`quill.schema`. Prose
  leaves are mounted ONCE per stable leaf key (keyed `<Card>`/`<ProseField>`);
  they commit to the doc directly and do NOT bump `revision`, so a re-derive never
  remounts them or drops a caret. `doc.main`/`doc.cards` allocate per read — read
  once per derive.
-->
<script lang="ts">
	import type { Document, Quill, Addr, Diagnostic, CorpusHit } from '../core/index.js';
	import type { FieldController } from '../core/codec/index.js';
	import {
		IdSeq,
		initIds,
		fieldModels,
		groupOrder,
		groupSections,
		cardTitle,
		bodyEnabled,
		humanize,
		type CardModel
	} from './structure.js';
	import Card from './Card.svelte';

	interface Props {
		doc: Document;
		quill: Quill;
		/** The active leaf's address (normalized to a plain `{card?, field?}`). */
		onActiveAddrChange?: (addr: Addr) => void;
		/** A caret move in the active leaf → the preview bridge (Phase 5). */
		onCaretMove?: (addr: Addr, pos: number) => void;
		/** Fired after every scalar/structure mutation — a change signal for a host. */
		onChange?: () => void;
		/** Phase-4b seam: routed diagnostics (rendered minimally inline for now). */
		diagnostics?: Diagnostic[];
	}
	let { doc, quill, onActiveAddrChange, onCaretMove, onChange, diagnostics }: Props = $props();

	// ── Reactivity + session identity ───────────────────────────────────────────
	let revision = $state(0);
	const seq = new IdSeq();
	// Session ids, one per composable card, reordered in lockstep with structure ops.
	// svelte-ignore state_referenced_locally
	let cardIds = $state<string[]>(initIds(doc.cardCount, seq));

	const kinds = $derived(Object.keys(quill.schema.card_kinds ?? {}));

	function bump(): void {
		revision++;
		onChange?.();
	}
	/** Resolve a stable card id to its current corpus index (the mutation boundary). */
	function cardIndexOf(id: string): number {
		return cardIds.indexOf(id);
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
	// Scalars / arrays / objects → the typed writer (schema-checked; a bad value
	// throws and is logged, never crashes). Prose leaves commit themselves via the
	// codec (applyChange) and do NOT pass through here.
	function commitScalar(id: string, isMain: boolean, name: string, value: unknown): void {
		try {
			const w = quill.writer(doc);
			if (isMain) {
				w.set(name, value);
			} else {
				const i = cardIndexOf(id);
				if (i < 0) return;
				w.card(i).set(name, value);
			}
			bump();
		} catch (e) {
			console.error('[quillmark/editor] scalar commit failed', e);
		}
	}

	// ── Structure mutators (resolve id→index here, then reorder ids in lockstep) ──
	function addCard(atIndex: number, kind: string): void {
		try {
			const overlay = doc.main.seed?.[kind] as Record<string, unknown> | undefined;
			const card = quill.seedCard(kind, overlay);
			if (!card) return;
			doc.insertCard(atIndex, card);
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
		// The `editor` namespace is the write unit and it REPLACES on write, so
		// merge over any existing keys (id-less in V1, but future-proof).
		const existing = (doc.cards[i]?.ext?.editor ?? {}) as Record<string, unknown>;
		doc.setCardExtNamespace(i, 'editor', { ...existing, title });
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

	// ── Diagnostics routing (4b seam) ───────────────────────────────────────────
	const diagByPath = $derived.by(() => {
		const m = new Map<string, Diagnostic[]>();
		for (const d of diagnostics ?? []) {
			if (!d.path) continue;
			const arr = m.get(d.path);
			if (arr) arr.push(d);
			else m.set(d.path, [d]);
		}
		return m;
	});
	function diagFor(isMain: boolean, field?: string): Diagnostic[] | undefined {
		// Minimal routing: main fields by bare path. Card-field paths and the
		// render/warnings producers are wired in Phase 4b.
		if (!field || !isMain) return undefined;
		return diagByPath.get(field);
	}

	function opsFor(id: string, isMain: boolean) {
		return {
			makeAddr: (field?: string) => makeAddr(id, isMain, field),
			leafKey: (field?: string) => `${id}:${field ?? '$body'}`,
			commit: (name: string, value: unknown) => commitScalar(id, isMain, name, value),
			move: (dir: -1 | 1) => moveCardById(id, dir),
			remove: () => removeCardById(id),
			retype: (kind: string) => retypeCardById(id, kind),
			rename: (title: string) => renameCardById(id, title),
			diagFor: (field?: string) => diagFor(isMain, field)
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
		cardSchema: Parameters<typeof fieldModels>[0] | undefined
	): CardModel {
		const values: Record<string, unknown> = {};
		for (const p of card.payloadItems)
			if (p.type === 'field' && p.key != null) values[p.key] = p.value;
		const fields = cardSchema ? fieldModels(cardSchema) : [];
		const sections = groupSections(fields, cardSchema ? groupOrder(cardSchema) : []);
		const extEditor = card.ext?.editor as { title?: string } | undefined;
		return {
			id,
			isMain,
			kind,
			titleOverride: extEditor?.title ?? '',
			titlePlaceholder: cardTitle(cardSchema, kind, values, undefined),
			values,
			sections,
			hasBody: bodyEnabled(cardSchema)
		};
	}

	const model = $derived.by(() => {
		revision; // re-derive on every mutation
		const schema = quill.schema;
		const main = doc.main; // allocate once
		const cards = doc.cards; // allocate once
		return {
			main: buildCard('main', true, 'main', main, schema.main),
			cards: cards.map((c, i) =>
				buildCard(cardIds[i] ?? `orphan${i}`, false, c.kind, c, schema.card_kinds?.[c.kind])
			)
		};
	});

	// ── Public entry points ─────────────────────────────────────────────────────
	/** Resolve a preview `CorpusHit` to a mounted leaf and place its caret (Phase 5). */
	export function setCaret(hit: CorpusHit): void {
		const key = leafKeyForHit(hit.field);
		if (!key) return;
		leaves.get(key)?.setCaret(hit.pos);
	}
	/** The active leaf's controller — the 4b formatting-popover observation seam. */
	export function getActiveLeaf(): FieldController | undefined {
		if (!activeAddr) return undefined;
		const cardPart = activeAddr.card != null ? activeCardId : 'main';
		return leaves.get(`${cardPart}:${activeAddr.field ?? '$body'}`);
	}

	/** Map a `CorpusHit.field` grammar string to a mounted leaf key (BOUNDARY_NOTES). */
	function leafKeyForHit(field: string): string | undefined {
		if (field === '$body') return 'main:$body';
		if (field.startsWith('$cards.')) {
			const parts = field.split('.'); // $cards.<kind>.<i>[.<field>]
			const i = Number(parts[2]);
			if (!Number.isInteger(i) || i < 0 || i >= cardIds.length) return undefined;
			return `${cardIds[i]}:${parts[3] ?? '$body'}`;
		}
		// A bare "<field>" is a main leaf; "<field>.<n>" is an array element (no leaf).
		if (!field.includes('.')) return `main:${field}`;
		return undefined;
	}
</script>

<div class="qm-editor">
	<Card
		card={model.main}
		{doc}
		{quill}
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

	{#if kinds.length}
		{@render addAffordance(0)}
		{#each model.cards as c, i (c.id)}
			<Card
				card={c}
				{doc}
				{quill}
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
			{@render addAffordance(i + 1)}
		{/each}
	{/if}
</div>

{#snippet addAffordance(atIndex: number)}
	<div class="qm-add-card">
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
							onclick={() => addCard(atIndex, k)}>{humanize(k)}</button
						>
					{/each}
				</div>
			</details>
		{/if}
	</div>
{/snippet}

<style>
	.qm-editor {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		font-family: var(--qm-font, ui-sans-serif, system-ui, sans-serif);
		color: var(--qm-text, #1a1a1a);
	}
	.qm-add-card {
		display: flex;
		justify-content: center;
	}
	.qm-add-btn {
		border: 1px dashed var(--qm-border, #c4c4c4);
		background: transparent;
		border-radius: 6px;
		cursor: pointer;
		padding: 0.25rem 0.9rem;
		font-size: 0.82rem;
		color: #555;
		list-style: none;
	}
	.qm-add-btn:hover {
		border-color: #9a9a9a;
		color: #222;
	}
	.qm-add-menu {
		position: relative;
	}
	.qm-add-kinds {
		display: flex;
		gap: 0.3rem;
		margin-top: 0.3rem;
	}
</style>
