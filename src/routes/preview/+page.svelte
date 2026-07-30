<!--
  Mount <Preview> over a live session of the reference quill and exercise the
  three responsibilities in a real browser — paint (canvas per page), overlay
  (field-box rects), and the click bridge (positionAt → a ContentHit, written to
  the panel beside it).

  `margin={0}` (the component's own default is 1) is deliberate: usaf_memo is a
  2-page fixture, and any margin >= 1 always keeps BOTH pages mounted regardless
  of scroll position (page 0 and page 1 are never more than 1 page apart), which
  makes "mounted canvases stay bounded below pageCount" unfalsifiable. margin=0
  plus the short fixed-height frame below make scrolling actually swap which page
  is mounted.

  The "edit subject" button exercises the OTHER half of the exit criteria (an
  apply repaints dirty ∩ visible pages) without reaching into the codec:
  `doc.revise` is a substrate primitive, so this stays in the playground route's
  lane, not Preview's — Preview never calls `apply`.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Document, LiveSession, ContentHit, ChangeSet } from '$lib/core';
	import { Preview } from '$lib/preview';
	import { loadUsafMemoTree } from '../fixture';

	type Status = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };

	let status = $state<Status>({ phase: 'loading' });
	let session = $state<LiveSession | undefined>();
	let lastHit = $state<ContentHit | undefined>(undefined);
	let lastChange = $state<ChangeSet | undefined>(undefined);
	let previewRef: ReturnType<typeof Preview> | undefined = $state();

	let toFree: Array<{ free(): void }> = [];
	let docHandle: Document | undefined;

	function handleCaretPick(hit: ContentHit): void {
		lastHit = hit;
	}

	function applySubjectEdit(): void {
		if (!session || !docHandle) return;
		docHandle.revise({ field: 'subject' }, `Edited subject (${Date.now()}).`);
		const change = session.apply(docHandle);
		lastChange = change;
		previewRef?.refresh(change);
	}

	// Exercises the two remaining command-surface verbs the click bridge does not
	// reach: `setZoom` (density, not layout — the canvas backing store should grow)
	// and `scrollToField` (fieldBoxes -> scroll into view).
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
				// Safari/dev doesn't TDZ on Kit's `component` export.
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
			docHandle = undefined;
		};
	});
</script>

<main class="pg-width">
	<header class="pg-rail head">
		{#if status.phase === 'loading'}
			<p data-testid="status" class="pg-status loading">Opening…</p>
		{:else if status.phase === 'error'}
			<p data-testid="status" class="pg-status error">Error: {status.message}</p>
		{:else}
			<p data-testid="status" class="pg-status ready">Session open</p>
		{/if}
		<div>
			<h1 class="pg-title">Preview</h1>
			<p class="pg-deck">
				One canvas per visible page, mounted by scroll position. Click text to resolve a content
				position.
			</p>
		</div>
	</header>

	{#if status.phase === 'ready'}
		<div class="layout">
			<div>
				<div class="pg-frame preview-frame">
					{#if session}
						<Preview bind:this={previewRef} {session} margin={0} onCaretPick={handleCaretPick} />
					{/if}
				</div>
				<p class="note">
					Deliberately short, with <code>margin=0</code>: scrolling must swap which page is mounted,
					or the paint loop's bound is unfalsifiable.
				</p>
			</div>

			<aside class="pg-panel pg-instruments">
				<p class="pg-label">Commands</p>
				<div class="buttons">
					<button class="pg-btn" type="button" onclick={applySubjectEdit}>
						Edit subject, apply, refresh
					</button>
					<button class="pg-btn" type="button" onclick={zoomIn}>Zoom 2×</button>
					<button class="pg-btn" type="button" onclick={scrollToSubject}>Scroll to subject</button>
				</div>

				<p class="pg-label">Caret pick</p>
				<p class="pg-readout" data-testid="last-hit">
					{lastHit
						? JSON.stringify({
								field: lastHit.field,
								pos: lastHit.pos,
								granularity: lastHit.granularity
							})
						: 'none'}
				</p>

				<p class="pg-label">Dirty pages</p>
				<p class="pg-readout" data-testid="dirty-pages">
					{lastChange ? `[${lastChange.dirtyPages.join(', ')}]` : '—'}
				</p>
			</aside>
		</div>
	{/if}
</main>

<style>
	.head {
		padding-block: var(--pg-space-12) var(--pg-space-8);
	}

	h1 {
		margin-bottom: var(--pg-space-2);
	}

	/* The surface, and the instruments beside it — the shape every tool route takes.
	   */
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 22rem;
		gap: var(--pg-space-8);
		align-items: start;
	}

	/* Short by design, and inset so the painted page reads against the desk tone
	   rather than bleeding into the frame's own edge. */
	.preview-frame {
		height: 31rem;
		padding: var(--pg-space-4);
	}

	.note {
		max-width: var(--pg-measure);
		margin: var(--pg-space-3) 0 0;
		color: var(--pg-ink-meta);
		font-size: var(--pg-text-label);
	}

	code {
		font-family: var(--pg-font-mono);
		font-size: var(--pg-text-code);
	}

	.buttons {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--pg-space);
	}

	@media (width < 60rem) {
		.layout {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
