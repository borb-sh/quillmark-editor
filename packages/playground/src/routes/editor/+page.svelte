<!--
  The reference SPLIT-PANE SHELL. One consumer-owned LiveSession drives all three
  surfaces over one seeded document:
    • <VisualEditor> (left): the edit surface; commits land on `doc`.
    • <Preview>      (right): a pure view of the session; never mutates it.
    • <SourceView>   (drawer): read-only canonical markdown of `doc`.

  It wires the glue the primitives push outward (ARCHITECTURE §Playground), all
  through the PUBLIC API; no reach-through:

    edit ─► (debounced) session.apply(doc) ─► preview.refresh(change)
                                            └► sourceView.refresh()
                                            └► diagnostics = session.warnings
    preview click ─► onCaretPick(hit) ─► editor.setCaret(hit)     (preview→editor)
    editor caret  ─► onCaretMove(at)  ─► preview.focusPosition(at) (editor→preview)

  The bridge is consumer-layer and one-way-independent: the editor is unaware of
  the preview (it only emits addresses + carets), the preview is unaware of the
  editor (it only surfaces hits). This route is the seam that joins them.

  Recompile is fed by `onChange` ALONE, which covers all three lanes: a prose
  commit, a scalar/array write, a card operation. A structure op applies at once
  (one per gesture, and the stack moved); prose and field edits debounce, since
  they arrive per keystroke. `onCaretMove` drives the preview's caret and nothing
  else: it fires on a bare arrow key, so a recompile hung off it would recompile
  on every one.

  The strip above the panes reads the bridge's outcomes back out (last-hit,
  active-addr, last-focus, last-change, the change LANE, and the last recovered
  error), so a round-trip that lands nowhere is visible rather than silent, and a
  failure the surfaces recovered from is visible rather than console-only. `inject-diagnostics` stands in for a live
  render-error feed: a real consumer derives external diagnostics from
  `session.warnings` (wired here, `[]` for usaf_memo) plus render errors.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		Quill,
		Document,
		LiveSession,
		ContentHit,
		ChangeSet,
		Place,
		Diagnostic,
		EditorError
	} from '@quillmark/svelte/core';
	import type { ActiveLeaf, EditorChange } from '@quillmark/svelte/visual';
	import { Preview } from '@quillmark/svelte/preview';
	import { SourceView } from '@quillmark/svelte/source';
	import { loadUsafMemoTree } from '../fixture';

	type Status = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };
	type VisualEditorComponent = typeof import('@quillmark/svelte/visual').VisualEditor;

	let status = $state<Status>({ phase: 'loading' });
	let VisualEditor = $state<VisualEditorComponent | undefined>();

	let session: LiveSession | undefined = $state();
	let quillHandle: Quill | undefined = $state();
	let docHandle: Document | undefined = $state();

	// Surface handles for the imperative bridge hops.
	let editorRef: { setCaret(hit: ContentHit): Promise<void> } | undefined = $state();
	let previewRef: ReturnType<typeof Preview> | undefined = $state();
	let sourceRef: ReturnType<typeof SourceView> | undefined = $state();

	// External diagnostics fed to the editor = live `session.warnings` + any
	// injected render-error stand-ins (recomputed on every recompile).
	let injected = $state<Diagnostic[]>([]);
	let externalDiagnostics = $state<Diagnostic[]>([]);
	function syncDiagnostics(): void {
		externalDiagnostics = session ? [...session.warnings, ...injected] : injected;
	}

	// Bridge observability: what the strip reads.
	let lastHit = $state<ContentHit | undefined>();
	let activeAddr = $state('none');
	let lastFocus = $state('none');
	let lastChange = $state<ChangeSet | undefined>();
	let lastChangeSource = $state('none');
	let lastError = $state('none');
	let showSource = $state(false);

	// ── Split resizer (playground reference) ─────────────────────────────────────
	// The editor|preview divider: a hairline thickening on hover/drag with an
	// ellipsis grip. A press only becomes a drag past a small dead-zone (swallows
	// click-jitter), the ratio clamps to 30–70% so neither pane collapses, and the
	// body takes a cursor/user-select lock for the drag so it reads as one gesture
	// and no text selects under the pointer. Playground-only; the split shell is the
	// consumer's per ARCHITECTURE §Playground.
	let shellEl: HTMLDivElement | undefined = $state();
	let splitPct = $state(50);
	let dragging = $state(false);
	const SPLIT_MIN = 30;
	const SPLIT_MAX = 70;
	const DEAD_ZONE = 3; // px moved before a press engages as a drag
	const clampSplit = (pct: number): number => Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, pct));

	function onResizerPointerDown(e: PointerEvent): void {
		if (!shellEl) return;
		e.preventDefault();
		const target = e.currentTarget as HTMLElement;
		const width = shellEl.getBoundingClientRect().width;
		const startX = e.clientX;
		const startPct = splitPct;
		let engaged = false;
		target.setPointerCapture(e.pointerId);

		const move = (ev: PointerEvent): void => {
			const dx = ev.clientX - startX;
			if (!engaged) {
				if (Math.abs(dx) < DEAD_ZONE) return; // dead-zone: ignore click-jitter
				engaged = true;
				dragging = true;
				document.body.style.cursor = 'col-resize';
				document.body.style.userSelect = 'none';
			}
			splitPct = clampSplit(startPct + (dx / width) * 100);
		};
		const up = (ev: PointerEvent): void => {
			target.releasePointerCapture?.(ev.pointerId);
			target.removeEventListener('pointermove', move);
			target.removeEventListener('pointerup', up);
			if (engaged) {
				dragging = false;
				document.body.style.cursor = '';
				document.body.style.userSelect = '';
			}
		};
		target.addEventListener('pointermove', move);
		target.addEventListener('pointerup', up);
	}

	function onResizerKeyDown(e: KeyboardEvent): void {
		let next = splitPct;
		if (e.key === 'ArrowLeft') next -= 2;
		else if (e.key === 'ArrowRight') next += 2;
		else if (e.key === 'Home') next = SPLIT_MIN;
		else if (e.key === 'End') next = SPLIT_MAX;
		else return;
		e.preventDefault();
		splitPct = clampSplit(next);
	}

	let toFree: Array<{ free(): void }> = [];

	// ── Debounced recompile ─────────────────────────────────────────────────────
	// One session, many edit sources → one apply per settled burst. The timer is
	// cleared on unmount so a pending recompile never touches a freed session.
	let recompileTimer: ReturnType<typeof setTimeout> | undefined;
	function scheduleRecompile(): void {
		if (recompileTimer != null) clearTimeout(recompileTimer);
		recompileTimer = setTimeout(recompileNow, 120);
	}
	function recompileNow(): void {
		recompileTimer = undefined;
		if (!session || !docHandle) return;
		try {
			const change = session.apply(docHandle);
			lastChange = change;
			previewRef?.refresh(change);
			sourceRef?.refresh();
			syncDiagnostics(); // re-read live warnings each compile, merged with the stand-ins
		} catch (e) {
			// A failed recompile keeps the last-good preview (the session is
			// transactional); surface it without crashing the shell.
			console.error('[playground] recompile failed', e);
		}
	}

	// ── Bridge: preview → editor ────────────────────────────────────────────────
	function handleCaretPick(hit: ContentHit): void {
		lastHit = hit;
		editorRef?.setCaret(hit);
	}

	// ── Bridge: editor → preview ────────────────────────────────────────────────
	function handleActiveLeaf(active: ActiveLeaf): void {
		activeAddr = JSON.stringify(active);
	}
	// The editor already speaks the preview's address grammar, so this hop is a
	// pass-through; the strip readout is the only reason it is a function at all.
	function handleCaretMove(at: Place): void {
		previewRef?.focusPosition(at);
		lastFocus = JSON.stringify(at);
	}
	// Every edit, whichever lane it came down. A structure op recompiles at once:
	// it happens once per gesture, and a card that appears half a beat after the
	// click reads as lag rather than as debouncing.
	function handleChange(change: EditorChange): void {
		lastChangeSource = change.source;
		if (change.source === 'structure') recompileNow();
		else scheduleRecompile();
	}
	function handleError(err: EditorError): void {
		lastError = `${err.code}: ${err.message}`;
	}

	function injectDiagnostics(): void {
		injected = [
			{ severity: 'warning', message: 'External test warning on subject', path: 'main.subject' },
			{
				severity: 'error',
				message: 'External test error on indorsement 0 from',
				path: 'cards.indorsement[0].from'
			}
		];
		syncDiagnostics();
	}

	onMount(() => {
		let cancelled = false;
		(async () => {
			try {
				// Dynamic import keeps WASM's top-level await out of the route module, so
				// Safari/dev doesn't TDZ on Kit's `component` export; VisualEditor rides the
				// same import. The fixture fetch is independent of both, so it runs alongside
				// them.
				const treeP = loadUsafMemoTree();
				const [{ Engine, Quill, init }, visual] = await Promise.all([
					import('@quillmark/svelte/core'),
					import('@quillmark/svelte/visual')
				]);
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
				VisualEditor = visual.VisualEditor;
				session = openedSession;
				quillHandle = quill;
				docHandle = doc;
				syncDiagnostics();
				toFree = [openedSession, doc, quill];
				status = { phase: 'ready' };
			} catch (e) {
				if (!cancelled)
					status = { phase: 'error', message: e instanceof Error ? e.message : String(e) };
			}
		})();
		return () => {
			cancelled = true;
			if (recompileTimer != null) clearTimeout(recompileTimer);
			for (const h of toFree) h.free();
			toFree = [];
			session = undefined;
			quillHandle = undefined;
			docHandle = undefined;
		};
	});
</script>

<main class="pg-width">
	<header class="pg-head">
		<h1 class="pg-title">Editor</h1>
		{#if status.phase === 'loading'}
			<p data-testid="status" class="pg-status loading">Opening…</p>
		{:else if status.phase === 'error'}
			<p data-testid="status" class="pg-status error">Error: {status.message}</p>
		{/if}
	</header>

	{#if status.phase === 'ready'}
		<!-- The bridge, read back out: each hop's last outcome, so a round-trip that
		     lands nowhere is visible rather than silent. -->
		<div class="pg-panel strip">
			<span class="stat"
				><span class="pg-label">active</span>
				<span class="pg-readout" data-testid="active-addr">{activeAddr}</span></span
			>
			<span class="stat"
				><span class="pg-label">hit</span>
				<span class="pg-readout" data-testid="last-hit"
					>{lastHit ? JSON.stringify({ field: lastHit.field, pos: lastHit.pos }) : 'none'}</span
				></span
			>
			<span class="stat"
				><span class="pg-label">focus→preview</span>
				<span class="pg-readout" data-testid="last-focus">{lastFocus}</span></span
			>
			<span class="stat"
				><span class="pg-label">dirty pages</span>
				<span class="pg-readout" data-testid="last-change"
					>{lastChange ? JSON.stringify(lastChange.dirtyPages) : 'none'}</span
				></span
			>
			<span class="stat"
				><span class="pg-label">lane</span>
				<span class="pg-readout" data-testid="last-change-source">{lastChangeSource}</span></span
			>
			<span class="stat"
				><span class="pg-label">error</span>
				<span class="pg-readout" data-testid="last-error">{lastError}</span></span
			>
			<span class="strip-actions">
				<button
					class="pg-btn"
					type="button"
					data-testid="inject-diagnostics"
					onclick={injectDiagnostics}>Inject diagnostics</button
				>
				<button
					class="pg-btn"
					type="button"
					data-testid="toggle-source"
					aria-pressed={showSource}
					onclick={() => (showSource = !showSource)}>Source</button
				>
			</span>
		</div>

		<!-- The split rides a custom property rather than `grid-template-columns`
		     itself, so the narrow-width rule below can stack the panes: an inline
		     track list would outrank any stylesheet. -->
		<div
			class="shell"
			bind:this={shellEl}
			style="--split: minmax(0, {splitPct}fr) var(--pg-resizer) minmax(0, {100 - splitPct}fr)"
		>
			<section class="pg-frame editor-pane" aria-label="Visual editor">
				{#if VisualEditor && docHandle && quillHandle}
					<VisualEditor
						bind:this={editorRef}
						doc={docHandle}
						quill={quillHandle}
						onActiveLeafChange={handleActiveLeaf}
						onCaretMove={handleCaretMove}
						onChange={handleChange}
						onError={handleError}
						diagnostics={externalDiagnostics}
					/>
				{/if}
			</section>
			<!-- A focusable role="separator" with aria-valuenow + arrow-key handling is
			     the WAI-ARIA window-splitter pattern; the a11y lint is conservative here. -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<div
				class="resizer"
				class:dragging
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize editor and preview panes"
				aria-valuemin={SPLIT_MIN}
				aria-valuemax={SPLIT_MAX}
				aria-valuenow={Math.round(splitPct)}
				tabindex="0"
				onpointerdown={onResizerPointerDown}
				onkeydown={onResizerKeyDown}
			>
				<span class="grip" aria-hidden="true">⋮</span>
			</div>
			<section class="pg-frame preview-pane" aria-label="Live preview">
				{#if session}
					<Preview bind:this={previewRef} {session} onCaretPick={handleCaretPick} />
				{/if}
			</section>
		</div>

		{#if showSource && docHandle}
			<section class="pg-frame drawer" aria-label="Debug source view" data-testid="source-drawer">
				<p class="pg-label drawer-label">Canonical markdown — read only</p>
				<div class="source-host">
					<SourceView bind:this={sourceRef} doc={docHandle} />
				</div>
			</section>
		{/if}
	{/if}
</main>

<style>
	.strip {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--pg-space-2) var(--pg-space-6);
		margin-bottom: var(--pg-space-4);
	}

	.stat {
		display: flex;
		align-items: baseline;
		gap: var(--pg-space-2);
		min-width: 0;
	}

	.stat .pg-readout {
		color: var(--pg-ink-meta);
	}

	.strip-actions {
		display: flex;
		gap: var(--pg-space);
		margin-inline-start: auto;
	}

	/* `--split` comes in inline from `splitPct`: the middle track holds the resizer,
	   the two side tracks are the panes. */
	.shell {
		display: grid;
		grid-template-columns: var(--split);
		align-items: start;
		height: var(--pg-mount-tall);
	}

	/* Both panes are the shell's frame; what each states here is the mounting site
	   THEMING §"What is behind the column is yours" leaves to the host: the gutter,
	   the scroll container, the page tone, the tail. This one puts plain `--qm-bg`
	   behind the column, the supported bare case, and its end padding is the tail. */
	.editor-pane {
		min-width: 0;
		height: 100%;
		overflow: auto;
		padding: var(--pg-space-2) var(--pg-space-2) var(--pg-tail);
		background: var(--pg-page);
	}

	/* The other half of the demonstration: a page tone of the host's own, with the
	   painted sheet inset on it. The frame carries the rest. */
	.preview-pane {
		min-width: 0;
		height: 100%;
		padding: var(--pg-space-2);
	}

	/* Reference resizer: a hairline in an 11px hit track, thickening on
	   hover/drag, with an ellipsis grip that fades in over the line. */
	.resizer {
		position: relative;
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: col-resize;
		touch-action: none; /* pointer drag owns the gesture, not scroll/pan */
	}

	.resizer::before {
		content: '';
		width: var(--pg-rule);
		height: 100%;
		border-radius: var(--pg-radius-pill);
		background: var(--pg-border);
		transition:
			width var(--pg-duration) var(--pg-ease-reverse),
			background-color var(--pg-duration) var(--pg-ease-reverse);
	}

	.resizer:hover::before,
	.resizer:focus-visible::before,
	.resizer.dragging::before {
		width: var(--pg-rule-strong);
		background: var(--pg-border-strong);
	}

	.resizer:focus-visible {
		outline: none;
	}

	.grip {
		position: absolute;
		font-size: var(--pg-text-label);
		line-height: 1;
		color: var(--pg-ghost);
		background: var(--pg-page);
		padding-block: var(--pg-space-half);
		border-radius: var(--pg-radius-pill);
		opacity: 0;
		transition: opacity var(--pg-duration) var(--pg-ease-reverse);
		pointer-events: none;
	}

	.resizer:hover .grip,
	.resizer:focus-visible .grip,
	.resizer.dragging .grip {
		opacity: 1;
	}

	.drawer {
		margin-top: var(--pg-space-4);
	}

	.drawer-label {
		padding: var(--pg-space-2) var(--pg-space-3);
		border-bottom: var(--pg-border-width) solid var(--pg-border);
	}

	.source-host {
		height: var(--pg-mount);
		background: var(--pg-page);
	}

	/* Below the width that fits two panes side by side, the split stops being one: the
	   tracks stack, the divider has nothing left to divide, and each pane takes the
	   short mount so both are reachable by scrolling the page. Same threshold as the
	   aside on every other route. */
	@media (width < 60rem) {
		.shell {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--pg-space-4);
			height: auto;
		}

		.resizer {
			display: none;
		}

		.editor-pane,
		.preview-pane {
			height: var(--pg-mount);
		}
	}
</style>
