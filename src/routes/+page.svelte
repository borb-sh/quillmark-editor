<!--
  Phase 1 playground: prove the substrate chain end-to-end in a real browser —
  load the reference quill, seed a Document, open a LiveSession, and report the
  three boundary quantities (pageCount / supportsCanvas / warnings). No paint, no
  editing yet; those surfaces mount here as their phases land.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Diagnostic } from '$lib/core';
	import { loadUsafMemoTree } from './fixture';

	type Status =
		| { phase: 'loading' }
		| { phase: 'error'; message: string }
		| {
				phase: 'ready';
				treeSize: number;
				quillName: string;
				quillVersion: string;
				backendId: string;
				fieldCount: number;
				cardKinds: string[];
				quillRef: string;
				pageCount: number;
				supportsCanvas: boolean;
				warnings: Diagnostic[];
		  };

	let status = $state<Status>({ phase: 'loading' });
	let toFree: Array<{ free(): void }> = [];

	onMount(() => {
		let cancelled = false;
		(async () => {
			// Handles created so far, newest first — freed in reverse creation
			// order on unmount-during-open AND on a mid-chain failure (e.g.
			// `engine.open` throwing after `quill`/`doc` already exist).
			const created: Array<{ free(): void }> = [];
			try {
				// Dynamic: keep WASM's top-level await out of the route module so
				// Safari/dev doesn't TDZ on Kit's `component` export (#7805).
				const { Engine, Quill, init } = await import('$lib/core');
				init();
				const tree = await loadUsafMemoTree();
				const quill = Quill.fromTree(tree);
				created.unshift(quill);
				const doc = quill.seedDocument();
				created.unshift(doc);
				const engine = new Engine();
				const openedSession = await engine.open(quill, doc);
				created.unshift(openedSession);
				if (cancelled) {
					for (const h of created) h.free();
					return;
				}
				toFree = created;
				status = {
					phase: 'ready',
					treeSize: tree.size,
					quillName: quill.metadata.name,
					quillVersion: quill.metadata.version,
					backendId: quill.backendId,
					fieldCount: Object.keys(quill.schema.main.fields).length,
					cardKinds: Object.keys(quill.schema.card_kinds ?? {}),
					quillRef: doc.quillRef,
					pageCount: openedSession.pageCount,
					supportsCanvas: openedSession.supportsCanvas,
					warnings: openedSession.warnings
				};
			} catch (e) {
				for (const h of created) h.free();
				if (!cancelled)
					status = { phase: 'error', message: e instanceof Error ? e.message : String(e) };
			}
		})();
		return () => {
			cancelled = true;
			for (const h of toFree) h.free();
			toFree = [];
		};
	});
</script>

<main>
	<h1>@quillmark/editor</h1>
	<p class="sub">Phase 1 substrate — the WASM boundary proven live.</p>

	<nav aria-label="Playground pages">
		<a href="/preview">Preview <span>Phase 2 — paint, overlay, click bridge</span></a>
		<a href="/visual">Visual <span>Phase 4 — the WYSIWYG surface</span></a>
	</nav>

	{#if status.phase === 'loading'}
		<p data-testid="status" class="loading">Loading reference quill…</p>
	{:else if status.phase === 'error'}
		<p data-testid="status" class="error">Error: {status.message}</p>
	{:else}
		<p data-testid="status" class="ready">Session open.</p>
		<dl>
			<dt>fixture entries</dt>
			<dd>{status.treeSize}</dd>
			<dt>quill</dt>
			<dd>{status.quillName}@{status.quillVersion} ({status.backendId})</dd>
			<dt>main fields</dt>
			<dd>{status.fieldCount}</dd>
			<dt>card kinds</dt>
			<dd>{status.cardKinds.join(', ') || '—'}</dd>
			<dt>document</dt>
			<dd>{status.quillRef}</dd>
			<dt>pageCount</dt>
			<dd data-testid="pageCount">{status.pageCount}</dd>
			<dt>supportsCanvas</dt>
			<dd data-testid="supportsCanvas">{status.supportsCanvas}</dd>
			<dt>warnings</dt>
			<dd data-testid="warnings">{status.warnings.length}</dd>
		</dl>
	{/if}
</main>

<style>
	main {
		font-family: ui-sans-serif, system-ui, sans-serif;
		max-width: 42rem;
		margin: 3rem auto;
		padding: 0 1.5rem;
		color: #1a1a1a;
	}
	h1 {
		font-size: 1.5rem;
		margin-bottom: 0.25rem;
	}
	.sub {
		color: #666;
		margin-top: 0;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin: 1.5rem 0;
	}
	nav a {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.6rem 0.9rem;
		border: 1px solid #e2e2e2;
		border-radius: 8px;
		text-decoration: none;
		color: #1a56db;
		font-weight: 600;
	}
	nav a:hover {
		border-color: #1a56db;
		background: #f5f8ff;
	}
	nav a span {
		color: #8a8a8a;
		font-weight: 400;
		font-size: 0.78rem;
	}
	.ready {
		color: #137333;
		font-weight: 600;
	}
	.error {
		color: #c5221f;
		font-weight: 600;
	}
	dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 0.35rem 1.25rem;
		margin-top: 1.5rem;
		font-variant-numeric: tabular-nums;
	}
	dt {
		color: #666;
	}
	dd {
		margin: 0;
		font-weight: 500;
	}
</style>
