<!--
  Phase 4 playground: mount <VisualEditor> over a seeded reference-quill document
  and prove the exit criteria in a real browser (e2e/visual.spec.ts,
  e2e/visual-chrome.spec.ts). A live `data-testid="doc-json"` dump reads curated
  doc state (field values, card order, card titles/bodies, `subject`'s marks) so
  the spec asserts commits actually LANDED in the Document, not just that the
  DOM changed. Client-only (WASM + PM need the browser); handles are freed on
  unmount.

  `inject-diagnostics`: a test-only affordance for Phase 4b's diagnostics
  producer #3 (the consumer-supplied `diagnostics` prop, VISUAL_EDITOR
  §Diagnostics) — a real consumer (Phase 5) would derive these from
  `LiveSession.warnings` / render errors; here a button stands in so
  e2e/visual-chrome.spec.ts can prove the routing without a live render.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Quill, Document, Addr, CardAddr, Content, Diagnostic } from '$lib/core';
	import { loadUsafMemoTree, withMainDateDefault, withSecondCardKind } from '../fixture';

	type Status = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };
	type VisualEditorComponent = typeof import('$lib/visual').VisualEditor;

	let status = $state<Status>({ phase: 'loading' });
	let VisualEditor = $state<VisualEditorComponent | undefined>();
	let quillHandle: Quill | undefined = $state();
	let docHandle: Document | undefined = $state();
	// `$lib/core` is imported dynamically (WASM top-level await, see onMount), so the
	// main-card selector is captured there for the reads outside that scope.
	let mainAddr: CardAddr | undefined = $state();
	let lastAddr = $state('none');
	let dumpTick = $state(0);
	let externalDiagnostics = $state<Diagnostic[]>([]);
	// A consumer enum-policy stand-in: once armed, forbid `CUI` on the
	// main `classification` field so e2e can prove the option renders disabled
	// without the stored value or the schema changing.
	let restrictEnums = $state(false);
	const enumOptionAllowed = $derived(
		restrictEnums
			? (addr: Addr, value: string) => !(addr.field === 'classification' && value === 'CUI')
			: undefined
	);

	// A consumer empty-body wording stand-in, deliberately the WORST case for
	// determinism: it samples at random and is a fresh closure on every re-derive.
	// The editor consults it once per kind and keeps the answer, so the ghosts still
	// hold still — which is the property e2e pins, and the reason a consumer may
	// write a hook this careless without it showing.
	let wittyGhosts = $state(false);
	const WITTY = [
		'Say something unforgettable…',
		'Begin anywhere…',
		'The blank page is bluffing…',
		'Draft badly, revise later…'
	];
	const bodyPlaceholder = $derived(
		wittyGhosts ? () => WITTY[Math.floor(Math.random() * WITTY.length)] : undefined
	);

	let toFree: Array<{ free(): void }> = [];

	function refresh(): void {
		dumpTick++;
	}

	// A consumer-supplied diagnostic feed stand-in (Phase 5 would derive this
	// from LiveSession.warnings / render errors) — one main-field path, one
	// card-field DocPath, proving the external producer routes to both.
	function injectDiagnostics(): void {
		externalDiagnostics = [
			{ severity: 'warning', message: 'External test warning on subject', path: 'main.subject' },
			{
				severity: 'error',
				message: 'External test error on indorsement 0 from',
				path: 'cards.indorsement[0].from'
			}
		];
	}

	// Curated read of the live doc for assertions — re-derives on any commit
	// (onChange) or caret move (a prose edit).
	const dump = $derived.by(() => {
		dumpTick; // dependency
		const doc = docHandle;
		if (!doc) return '{}';
		const obj = {
			subject: (doc.getStored('subject') as Content | undefined)?.text ?? '',
			subjectMarks: (doc.getStored('subject') as Content | undefined)?.marks ?? [],
			tag_line: (doc.getStored('tag_line') as Content | undefined)?.text ?? '',
			body: (doc.getStored({}) as Content).text,
			font_size: doc.getStored('font_size') ?? null,
			classification: doc.getStored('classification') ?? null,
			letterhead_seal: doc.getStored('letterhead_seal') ?? null,
			date: doc.getStored('date') ?? null,
			memo_for: doc.getStored('memo_for') ?? [],
			references: ((doc.getStored('references') as Content[] | undefined) ?? []).map((r) => r.text),
			// The tips channel read off the Document, so e2e proves the
			// DISMISSAL landed as a write and not just as an unmount — and that the
			// `title` sibling in the same namespace survived it. `getExtNamespace` reads
			// the one slot rather than serializing the whole main card for it.
			mainExtEditor: (mainAddr && (doc.getExtNamespace(mainAddr, 'editor') as unknown)) ?? null,
			cardCount: doc.cardCount,
			cards: doc.cards.map((c, i) => ({
				kind: c.kind,
				title: (c.ext?.editor as { title?: string } | undefined)?.title ?? null,
				from: doc.getStored({ card: i, field: 'from' }) ?? null,
				body: c.body.text
			}))
		};
		return JSON.stringify(obj);
	});

	function handleActiveAddr(addr: Addr): void {
		lastAddr = JSON.stringify(addr);
		refresh();
	}

	onMount(() => {
		let cancelled = false;
		(async () => {
			try {
				// Dynamic: keep WASM's top-level await out of the route module so
				// Safari/dev doesn't TDZ on Kit's `component` export.
				// VisualEditor pulls the codec → `mapPos`, so it rides the same import.
				const [{ Quill, Document, init, MAIN_CARD_ADDR }, visual] = await Promise.all([
					import('$lib/core'),
					import('$lib/visual')
				]);
				init();
				const tree = await loadUsafMemoTree();
				// e2e variant: the reference quill's `date` declares a blank
				// `default:`, which ghosts nothing — `?dateDefault=YYYY-MM-DD` rewrites it
				// so the date control's ghosted default is reachable in the browser. A
				// SCHEMA variant, so it patches the tree before the quill is built, unlike
				// the document seeds below.
				const params = new URLSearchParams(window.location.search);
				const dateDefault = params.get('dateDefault');
				if (dateDefault) withMainDateDefault(tree, dateDefault);
				// The other schema variant: `?kinds2` declares a second card kind, so the
				// add affordance takes its MENU branch — the one the reference quill's
				// single kind means nothing on disk reaches.
				if (params.has('kinds2')) withSecondCardKind(tree);
				const quill = Quill.fromTree(tree);
				const doc = quill.seedDocument();
				// e2e seed: a card whose `kind` the schema can't project (as a
				// document predating a schema change would carry). `Document.insertCard`
				// is schema-agnostic, so it can hold a foreign kind the Quill-bound writer
				// would reject — the exact un-schemable case the recovery shell handles.
				if (params.has('foreign')) {
					doc.insertCard(Document.makeCard('legacy_kind', {}, 'Trapped legacy body.'));
				}
				// e2e seed: the tips channel a quill or consumer supplies. The
				// reference quill declares none — tips are `$ext`, not schema — so the
				// playground stands in for the seeding consumer, off by default so the
				// default view stays the plain card stack.
				if (params.has('tips')) {
					// Through `patchEditorExt`, not a bare `storeExtNamespace` — a consumer
					// seeding one key must not replace the namespace either.
					visual.patchEditorExt(doc, MAIN_CARD_ADDR, {
						tips: [
							'Press **Tab** to move on.',
							'Run `npm run dev` for the playground.',
							'Last one — dismissing clears the channel.'
						]
					});
				}
				if (cancelled) {
					doc.free();
					quill.free();
					return;
				}
				mainAddr = MAIN_CARD_ADDR;
				VisualEditor = visual.VisualEditor;
				quillHandle = quill;
				docHandle = doc;
				toFree = [doc, quill];
				status = { phase: 'ready' };
			} catch (e) {
				if (!cancelled)
					status = { phase: 'error', message: e instanceof Error ? e.message : String(e) };
			}
		})();
		return () => {
			cancelled = true;
			for (const h of toFree) h.free();
			toFree = [];
			VisualEditor = undefined;
			quillHandle = undefined;
			docHandle = undefined;
		};
	});
</script>

<main>
	<h1>@quillmark/editor — Visual</h1>
	<p class="sub">Phase 4 — the federated WYSIWYG surface over a seeded document.</p>

	{#if status.phase === 'loading'}
		<p data-testid="status" class="loading">Loading reference quill…</p>
	{:else if status.phase === 'error'}
		<p data-testid="status" class="error">Error: {status.message}</p>
	{:else}
		<p data-testid="status" class="ready">Ready.</p>
		<div class="layout">
			<div class="editor-shell">
				{#if VisualEditor && docHandle && quillHandle}
					<VisualEditor
						doc={docHandle}
						quill={quillHandle}
						onActiveAddrChange={handleActiveAddr}
						onCaretMove={() => refresh()}
						onChange={refresh}
						diagnostics={externalDiagnostics}
						{enumOptionAllowed}
						{bodyPlaceholder}
					/>
				{/if}
			</div>
			<aside class="state-panel">
				<div class="state-label">active addr</div>
				<pre data-testid="active-addr">{lastAddr}</pre>
				<button type="button" data-testid="inject-diagnostics" onclick={injectDiagnostics}
					>Inject test diagnostics</button
				>
				<button
					type="button"
					data-testid="toggle-enum-policy"
					onclick={() => (restrictEnums = !restrictEnums)}>Toggle enum policy (forbid CUI)</button
				>
				<button
					type="button"
					data-testid="toggle-body-placeholder"
					onclick={() => (wittyGhosts = !wittyGhosts)}>Toggle custom body placeholder</button
				>
				<div class="state-label">doc state</div>
				<pre data-testid="doc-json">{dump}</pre>
			</aside>
		</div>
	{/if}
</main>

<style>
	main {
		max-width: 78rem;
		margin: 1.5rem auto;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 22rem;
		gap: 1.25rem;
		align-items: start;
	}
	.editor-shell {
		min-width: 0;
	}
	.state-panel {
		position: sticky;
		top: 1rem;
		border: 1px solid var(--pg-border);
		border-radius: 8px;
		padding: 0.75rem;
		background: var(--pg-card-bg);
	}
	.state-label {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--pg-ghost);
		margin: 0.4rem 0 0.2rem;
	}
	.state-panel pre {
		white-space: pre-wrap;
		word-break: break-all;
		font-size: 0.7rem;
		background: var(--pg-page);
		border: 1px solid var(--pg-border);
		border-radius: 4px;
		padding: 0.4rem;
		margin: 0;
		max-height: 20rem;
		overflow: auto;
	}
</style>
