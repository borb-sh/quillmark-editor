<!--
  Phase 4 playground: mount <VisualEditor> over a seeded reference-quill document
  and prove the exit criteria in a real browser (e2e/visual.spec.ts). A live
  `data-testid="doc-json"` dump reads curated doc state (field values, card order,
  card titles/bodies) so the spec asserts commits actually LANDED in the
  Document, not just that the DOM changed. Client-only (WASM + PM need the
  browser); handles are freed on unmount.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { Quill, Document, init } from '$lib/core';
	import type { Addr, Card as CardType, RichText } from '$lib/core';
	import { VisualEditor } from '$lib/visual';
	import { loadUsafMemoTree } from '../fixture';

	type Status = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };

	let status = $state<Status>({ phase: 'loading' });
	let quillHandle: Quill | undefined = $state();
	let docHandle: Document | undefined = $state();
	let lastAddr = $state('none');
	let dumpTick = $state(0);

	let toFree: Array<{ free(): void }> = [];

	function refresh(): void {
		dumpTick++;
	}

	function cardField(c: CardType, name: string): unknown {
		const p = c.payloadItems.find((it) => it.type === 'field' && it.key === name);
		return p && p.type === 'field' ? p.value : undefined;
	}

	// Curated read of the live doc for assertions — re-derives on any commit
	// (onChange) or caret move (a prose edit).
	const dump = $derived.by(() => {
		dumpTick; // dependency
		const doc = docHandle;
		if (!doc) return '{}';
		const obj = {
			subject: (doc.get('subject') as RichText | undefined)?.text ?? '',
			tag_line: (doc.get('tag_line') as RichText | undefined)?.text ?? '',
			body: doc.main.body.text,
			font_size: doc.get('font_size') ?? null,
			classification: doc.get('classification') ?? null,
			letterhead_seal: doc.get('letterhead_seal') ?? null,
			date: doc.get('date') ?? null,
			memo_for: doc.get('memo_for') ?? [],
			references: ((doc.get('references') as RichText[] | undefined) ?? []).map((r) => r.text),
			cardCount: doc.cardCount,
			cards: doc.cards.map((c) => ({
				kind: c.kind,
				title: (c.ext?.editor as { title?: string } | undefined)?.title ?? null,
				from: cardField(c, 'from') ?? null,
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
				init();
				const tree = await loadUsafMemoTree();
				const quill = Quill.fromTree(tree);
				const doc = quill.seedDocument();
				if (cancelled) {
					doc.free();
					quill.free();
					return;
				}
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
				{#if docHandle && quillHandle}
					<VisualEditor
						doc={docHandle}
						quill={quillHandle}
						onActiveAddrChange={handleActiveAddr}
						onCaretMove={() => refresh()}
						onChange={refresh}
					/>
				{/if}
			</div>
			<aside class="state-panel">
				<div class="state-label">active addr</div>
				<pre data-testid="active-addr">{lastAddr}</pre>
				<div class="state-label">doc state</div>
				<pre data-testid="doc-json">{dump}</pre>
			</aside>
		</div>
	{/if}
</main>

<style>
	main {
		font-family: ui-sans-serif, system-ui, sans-serif;
		max-width: 78rem;
		margin: 1.5rem auto;
		padding: 0 1.5rem;
		color: #1a1a1a;
	}
	h1 {
		font-size: 1.5rem;
		margin-bottom: 0.2rem;
	}
	.sub {
		color: #666;
		margin-top: 0;
	}
	.ready {
		color: #137333;
		font-weight: 600;
	}
	.error {
		color: #c5221f;
		font-weight: 600;
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
		border: 1px solid #e2e2e2;
		border-radius: 8px;
		padding: 0.75rem;
		background: #fbfbfb;
	}
	.state-label {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #8a8a8a;
		margin: 0.4rem 0 0.2rem;
	}
	.state-panel pre {
		white-space: pre-wrap;
		word-break: break-all;
		font-size: 0.7rem;
		background: #fff;
		border: 1px solid #eee;
		border-radius: 4px;
		padding: 0.4rem;
		margin: 0;
		max-height: 20rem;
		overflow: auto;
	}
</style>
