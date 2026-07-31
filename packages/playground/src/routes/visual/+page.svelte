<!--
  Mount <VisualEditor> over a seeded reference-quill document. The panel's live
  `doc-json` dump reads curated doc state (field values, card order, card
  titles/bodies, `subject`'s marks), so a commit that changed the DOM without
  landing in the Document reads as the two disagreeing rather than as a success.
  Client-only (WASM + PM need the browser); handles are freed on unmount.

  The panel's buttons stand in for consumer-supplied channels the reference quill
  has no way to declare: `inject-diagnostics` for the consumer `diagnostics` prop
  (VISUAL_EDITOR §Diagnostics; a real consumer derives it from
  `LiveSession.warnings` and render errors), plus the enum policy and the body
  wording below.

  The fixture variants are SCHEMA or SEED changes read once at mount, so their
  links reload the page rather than navigating within it.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { page } from '$app/state';
	import type { Quill, Document, Addr, CardAddr, Content, Diagnostic } from '@quillmark/ui/core';
	import { loadUsafMemoTree, withMainDateDefault, withSecondCardKind } from '../fixture';

	type Status = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };
	type VisualEditorComponent = typeof import('@quillmark/ui/visual').VisualEditor;

	// What each flag changes about the document under the editor. Named for the
	// branch it reaches; the reference quill on disk reaches none of them.
	const VARIANTS = [
		{ flag: 'tips', label: 'tips', hint: 'seed the guidance channel on main' },
		{ flag: 'kinds2', label: 'kinds2', hint: 'a second card kind, so add takes its menu branch' },
		{ flag: 'foreign', label: 'foreign', hint: 'a card whose kind the schema cannot project' }
	];

	let status = $state<Status>({ phase: 'loading' });
	let VisualEditor = $state<VisualEditorComponent | undefined>();
	let quillHandle: Quill | undefined = $state();
	let docHandle: Document | undefined = $state();
	// `@quillmark/ui/core` is imported dynamically (WASM top-level await, see onMount), so the
	// main-card selector is captured there for the reads outside that scope.
	let mainAddr: CardAddr | undefined = $state();
	let lastAddr = $state('none');
	let dumpTick = $state(0);
	let externalDiagnostics = $state<Diagnostic[]>([]);
	// A consumer enum-policy stand-in: once armed, forbid `CUI` on the main
	// `classification` field, so the option renders disabled without the stored
	// value or the schema changing.
	let restrictEnums = $state(false);
	const enumOptionAllowed = $derived(
		restrictEnums
			? (addr: Addr, value: string) => !(addr.field === 'classification' && value === 'CUI')
			: undefined
	);

	// A consumer empty-body wording stand-in, deliberately the WORST case for
	// determinism: it samples at random and is a fresh closure on every re-derive.
	// The editor consults it once per kind and keeps the answer, so the ghosts hold
	// still anyway: the reason a consumer may write a hook this careless without
	// it showing.
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

	// A variant link flips its own flag and leaves the rest of the query alone, so
	// the three compose.
	const variants = $derived(
		VARIANTS.map((variant) => {
			const params = new URLSearchParams(page.url.search);
			const on = params.has(variant.flag);
			if (on) params.delete(variant.flag);
			else params.set(variant.flag, '');
			const query = params.toString().replace(/=(?=&|$)/g, '');
			return { ...variant, on, href: `${base}/visual${query ? `?${query}` : ''}` };
		})
	);

	let toFree: Array<{ free(): void }> = [];

	function refresh(): void {
		dumpTick++;
	}

	// A consumer-supplied diagnostic feed stand-in (the split-pane shell derives
	// this from LiveSession.warnings / render errors): one main-field path, one
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

	// Curated read of the live doc for assertions; re-derives on any commit
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
			// The tips channel read off the Document: a dismissal that only unmounted
			// the card shows here as an unchanged slot, and the `title` sibling in the
			// same namespace shows whether the write replaced the namespace.
			// `getExtNamespace` reads the one slot rather than serializing the whole
			// main card for it.
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
				// The fixture fetch is independent of both, so it runs alongside them.
				const treeP = loadUsafMemoTree();
				const [{ Quill, Document, init, MAIN_CARD_ADDR }, visual] = await Promise.all([
					import('@quillmark/ui/core'),
					import('@quillmark/ui/visual')
				]);
				init();
				const tree = await treeP;
				// The reference quill's `date` declares a blank `default:`, which ghosts
				// nothing; `?dateDefault=YYYY-MM-DD` rewrites it so the date control's
				// ghosted default is reachable at all. A SCHEMA variant, so it patches the
				// tree before the quill is built, unlike the document seeds below.
				const params = new URLSearchParams(window.location.search);
				const dateDefault = params.get('dateDefault');
				if (dateDefault) withMainDateDefault(tree, dateDefault);
				// The other schema variant: `?kinds2` declares a second card kind, so the
				// add affordance takes its MENU branch: the one the reference quill's
				// single kind means nothing on disk reaches.
				if (params.has('kinds2')) withSecondCardKind(tree);
				const quill = Quill.fromTree(tree);
				const doc = quill.seedDocument();
				// `?foreign` seeds a card whose `kind` the schema can't project.
				// `Document.insertCard` is schema-agnostic, so it can hold a foreign kind
				// the Quill-bound writer would reject: the exact un-schemable case the
				// recovery shell handles.
				if (params.has('foreign')) {
					doc.insertCard(Document.makeCard('legacy_kind', {}, 'Trapped legacy body.'));
				}
				// `?tips` seeds the channel a quill or consumer supplies. The reference
				// quill declares none (tips are `$ext`, not schema), so the
				// playground stands in for the seeding consumer, off by default so the
				// default view stays the plain card stack.
				if (params.has('tips')) {
					// Through `patchEditorExt`, not a bare `storeExtNamespace`: a consumer
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

<main class="pg-width">
	<header class="pg-head">
		<h1 class="pg-title">Visual</h1>
		{#if status.phase === 'loading'}
			<p data-testid="status" class="pg-status loading">Opening…</p>
		{:else if status.phase === 'error'}
			<p data-testid="status" class="pg-status error">Error: {status.message}</p>
		{/if}
	</header>

	{#if status.phase === 'ready'}
		<div class="pg-layout">
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

			<aside class="pg-panel pg-instruments">
				<p class="pg-label">Consumer channels</p>
				<div class="buttons">
					<button
						class="pg-btn"
						type="button"
						data-testid="inject-diagnostics"
						onclick={injectDiagnostics}>Inject diagnostics</button
					>
					<button
						class="pg-btn"
						type="button"
						data-testid="toggle-enum-policy"
						aria-pressed={restrictEnums}
						onclick={() => (restrictEnums = !restrictEnums)}>Forbid CUI</button
					>
					<button
						class="pg-btn"
						type="button"
						data-testid="toggle-body-placeholder"
						aria-pressed={wittyGhosts}
						onclick={() => (wittyGhosts = !wittyGhosts)}>Custom body placeholder</button
					>
				</div>

				<p class="pg-label">Fixture variants</p>
				<div class="buttons">
					{#each variants as variant (variant.flag)}
						<a
							class="pg-btn"
							href={variant.href}
							data-sveltekit-reload
							aria-current={variant.on ? 'true' : undefined}
							title={variant.hint}>{variant.label}</a
						>
					{/each}
				</div>

				<p class="pg-label">Active address</p>
				<p class="pg-readout" data-testid="active-addr">{lastAddr}</p>

				<p class="pg-label">Document</p>
				<pre class="pg-readout" data-testid="doc-json">{dump}</pre>
			</aside>
		</div>
	{/if}
</main>

<style>
	.editor-shell {
		min-width: 0;
	}

	.buttons {
		display: flex;
		flex-wrap: wrap;
		gap: var(--pg-space);
	}

	/* The variant links are controls by role, so they take the button recipe and
	   lose the anchor's underline with it. */
	a.pg-btn {
		text-decoration: none;
	}
</style>
