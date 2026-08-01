<!--
  Mount <Preview> over a live session of the reference quill and exercise the
  three responsibilities in a real browser: paint (canvas per page), overlay
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
  lane, not Preview's; Preview never calls `apply`.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		Document,
		LiveSession,
		ContentHit,
		ChangeSet,
		EditorError
	} from '@quillmark/ui/core';
	import { Preview } from '@quillmark/ui/preview';
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

	// A surface with no shell around it still needs the channel: this route is the
	// standalone-preview consumer, and `onError` is per surface for exactly that.
	function handleError(e: EditorError): void {
		console.error(`[playground] ${e.code}: ${e.message}`, e.cause);
	}

	function applySubjectEdit(): void {
		if (!session || !docHandle) return;
		docHandle.revise({ field: 'subject' }, `Edited subject (${Date.now()}).`);
		const change = session.apply(docHandle);
		lastChange = change;
		previewRef?.refresh(change);
	}

	// Exercises the two remaining command-surface verbs the click bridge does not
	// reach: `setZoom` (density, not layout; the canvas backing store should grow)
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
				// Safari/dev doesn't TDZ on Kit's `component` export. The fixture fetch is
				// independent of it, so it runs alongside rather than behind it.
				const treeP = loadUsafMemoTree();
				const { Engine, Quill, init } = await import('@quillmark/ui/core');
				init();
				const quill = Quill.fromTree(await treeP);
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
	<header class="pg-head">
		<h1 class="pg-title">Preview</h1>
		{#if status.phase === 'loading'}
			<p data-testid="status" class="pg-status loading">Opening…</p>
		{:else if status.phase === 'error'}
			<p data-testid="status" class="pg-status error">Error: {status.message}</p>
		{/if}
	</header>

	{#if status.phase === 'ready'}
		<div class="pg-layout">
			<div class="pg-frame preview-frame">
				{#if session}
					<Preview
						bind:this={previewRef}
						{session}
						margin={0}
						onCaretPick={handleCaretPick}
						onError={handleError}
					/>
				{/if}
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
	/* Inset, so the painted page reads against the desk tone rather than bleeding
	   into the frame's own edge; the height is the shell's short mount. */
	.preview-frame {
		height: var(--pg-mount);
		padding: var(--pg-space-4);
	}

	.buttons {
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: var(--pg-space);
	}
</style>
