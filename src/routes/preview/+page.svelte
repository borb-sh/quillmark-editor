<!--
  Phase 2 playground: mount <Preview> over a live session of the reference quill
  and prove the three responsibilities in a real browser — paint (canvas per
  page), overlay (field-box rects), and the click bridge (positionAt -> a
  CorpusHit written to `data-testid="last-hit"` for the e2e spec to assert on).

  `margin={0}` (the component's own default is 1) is deliberate: usaf_memo is a
  2-page fixture, and any margin >= 1 always keeps BOTH pages mounted regardless
  of scroll position (page 0 and page 1 are never more than 1 page apart), which
  makes "mounted canvases stay bounded below pageCount" unfalsifiable. margin=0
  plus the short fixed-height shell below make scrolling actually swap which
  page is mounted — see e2e/preview.spec.ts.

  The "apply an edit" button exercises the OTHER half of the exit criteria (an
  apply repaints dirty ∩ visible pages) without reaching into Phase 3's codec:
  `doc.revise` is a Phase-1 substrate primitive (BOUNDARY_NOTES), so this stays
  in the playground route's lane, not Preview's — Preview never calls `apply`.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Quill, Document, LiveSession, CorpusHit, ChangeSet } from '$lib/core';
	import { Preview } from '$lib/preview';
	import { loadUsafMemoTree } from '../fixture';

	type Status = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };

	let status = $state<Status>({ phase: 'loading' });
	let session: LiveSession | undefined = $state();
	let lastHit = $state<CorpusHit | undefined>(undefined);
	let lastChange = $state<ChangeSet | undefined>(undefined);
	let previewRef: ReturnType<typeof Preview> | undefined = $state();

	let toFree: Array<{ free(): void }> = [];
	let quillHandle: Quill | undefined;
	let docHandle: Document | undefined;

	function handleCaretPick(hit: CorpusHit): void {
		lastHit = hit;
	}

	function applySubjectEdit(): void {
		if (!session || !docHandle) return;
		docHandle.revise({ field: 'subject' }, `Edited subject (${Date.now()}).`);
		const change = session.apply(docHandle);
		lastChange = change;
		previewRef?.refresh(change);
	}

	// Exercises the two remaining command-surface verbs the click-bridge tests
	// don't reach: `setZoom` (density, not layout — the canvas backing store
	// should grow) and `scrollToField` (fieldBoxes -> scroll into view).
	function zoomIn(): void {
		previewRef?.setZoom(2);
	}
	function scrollToSubject(): void {
		previewRef?.scrollToField('subject');
	}

	onMount(() => {
		let cancelled = false;
		(async () => {
			try {
				// Dynamic: keep WASM's top-level await out of the route module so
				// Safari/dev doesn't TDZ on Kit's `component` export (#7805).
				const { Engine, Quill, init } = await import('$lib/core');
				init();
				const tree = await loadUsafMemoTree();
				const quill = Quill.fromTree(tree);
				const doc = quill.seedDocument();
				const engine = new Engine();
				const openedSession = await engine.open(quill, doc);
				if (cancelled) {
					openedSession.free();
					doc.free();
					quill.free();
					return;
				}
				session = openedSession;
				quillHandle = quill;
				docHandle = doc;
				toFree = [openedSession, doc, quill];
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
			session = undefined;
			quillHandle = undefined;
			docHandle = undefined;
		};
	});
</script>

<main>
	<h1>@quillmark/editor — Preview</h1>
	<p class="sub">Phase 2 — paint, overlay, and the click bridge over a live session.</p>

	{#if status.phase === 'loading'}
		<p data-testid="status" class="loading">Loading reference quill…</p>
	{:else if status.phase === 'error'}
		<p data-testid="status" class="error">Error: {status.message}</p>
	{:else}
		<p data-testid="status" class="ready">Session open.</p>
		<div class="toolbar">
			<button onclick={applySubjectEdit}>Edit subject (apply + refresh)</button>
			<button onclick={zoomIn}>Zoom 2x</button>
			<button onclick={scrollToSubject}>Scroll to subject</button>
			<span data-testid="dirty-pages">
				{lastChange ? `dirtyPages: [${lastChange.dirtyPages.join(', ')}]` : 'dirtyPages: —'}
			</span>
		</div>
		<p data-testid="last-hit">
			{lastHit
				? JSON.stringify({
						field: lastHit.field,
						pos: lastHit.pos,
						granularity: lastHit.granularity
					})
				: 'none'}
		</p>
		<div class="preview-shell">
			{#if session}
				<Preview bind:this={previewRef} {session} margin={0} onCaretPick={handleCaretPick} />
			{/if}
		</div>
	{/if}
</main>

<style>
	main {
		font-family: ui-sans-serif, system-ui, sans-serif;
		max-width: 60rem;
		margin: 2rem auto;
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
	.ready {
		color: #137333;
		font-weight: 600;
	}
	.error {
		color: #c5221f;
		font-weight: 600;
	}
	.toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin: 1rem 0;
	}
	.preview-shell {
		height: 500px;
		width: min(700px, 100%);
		border: 1px solid #ccc;
	}
</style>
