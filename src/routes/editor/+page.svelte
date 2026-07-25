<!--
  Phase 5 playground — the reference SPLIT-PANE SHELL. One consumer-owned
  LiveSession drives all three surfaces over one seeded document:
    • <VisualEditor> (left)   — the edit surface; commits land on `doc`.
    • <Preview>      (right)  — a pure view of the session; never mutates it.
    • <SourceView>   (drawer) — read-only canonical markdown of `doc`.

  It wires the glue the primitives push outward (ARCHITECTURE §Playground), all
  through the PUBLIC API — no reach-through:

    edit ─► (debounced) session.apply(doc) ─► preview.refresh(change)
                                            └► sourceView.refresh()
                                            └► diagnostics = session.warnings
    preview click ─► onCaretPick(hit) ─► editor.setCaret(hit)          (preview→editor)
    editor caret  ─► onCaretMove(addr,pos) ─► preview.focusPosition(   (editor→preview)
                       fieldPathForAddr(addr, kinds), pos)

  The bridge is consumer-layer and one-way-independent: the editor is unaware of
  the preview (it only emits addresses + carets), the preview is unaware of the
  editor (it only surfaces hits). This route is the seam that joins them.

  Recompile is debounced and fed by BOTH `onChange` (scalar/structure mutations)
  and `onCaretMove` (prose edits surface here — a prose leaf commits directly and
  does not bump the editor's revision). A caret move with no content change
  recompiles to empty `dirtyPages` (apply on an unchanged doc is a cheap no-op),
  so the preview repaints nothing; only the geometry re-reads.

  `data-testid` strip: the bridge outcomes e2e/editor.spec.ts asserts on
  (last-hit, active-addr, last-focus, last-change). `inject-diagnostics` stands in
  for a live render-error feed — a real consumer derives external diagnostics from
  `session.warnings` (wired here, `[]` for usaf_memo) + render errors; the button
  proves the shell threads them to inline rendering deterministically.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		Quill,
		Document,
		LiveSession,
		ContentHit,
		ChangeSet,
		Addr,
		Diagnostic
	} from '$lib/core';
	import { Preview } from '$lib/preview';
	import { SourceView } from '$lib/source';
	import { loadUsafMemoTree } from '../fixture';

	type Status = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };
	type VisualEditorComponent = typeof import('$lib/visual').VisualEditor;

	let status = $state<Status>({ phase: 'loading' });
	let VisualEditor = $state<VisualEditorComponent | undefined>();

	let session: LiveSession | undefined = $state();
	let quillHandle: Quill | undefined = $state();
	let docHandle: Document | undefined = $state();

	// The editor→preview address mapping — captured from the dynamic `$lib/visual`
	// import (below) rather than statically imported, so the route module never
	// pulls VisualEditor's WASM top-level await (Kit #7805, the reason for the
	// dynamic-import dance). This IS the public `/visual` surface, just deferred.
	let fieldPathForAddr: ((addr: Addr, kinds: readonly string[]) => string | undefined) | undefined;

	// Surface handles for the imperative bridge hops.
	let editorRef: { setCaret(hit: ContentHit): void } | undefined = $state();
	let previewRef: ReturnType<typeof Preview> | undefined = $state();
	let sourceRef: ReturnType<typeof SourceView> | undefined = $state();

	// External diagnostics fed to the editor = live `session.warnings` + any
	// injected render-error stand-ins (recomputed on every recompile).
	let injected = $state<Diagnostic[]>([]);
	let externalDiagnostics = $state<Diagnostic[]>([]);
	function syncDiagnostics(): void {
		externalDiagnostics = session ? [...session.warnings, ...injected] : injected;
	}

	// Bridge observability (e2e).
	let lastHit = $state<ContentHit | undefined>();
	let activeAddr = $state('none');
	let lastFocus = $state('none');
	let lastChange = $state<ChangeSet | undefined>();
	let showSource = $state(false);

	// ── Split resizer (playground reference) ─────────────────────────────────────
	// The editor|preview divider: a 3px line thickening to 5.5px on hover/drag with
	// an ellipsis grip. A press only becomes a drag past a small dead-zone (swallows
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
	function handleActiveAddr(addr: Addr): void {
		activeAddr = JSON.stringify(addr);
	}
	function handleCaretMove(addr: Addr, pos: number): void {
		// Only a card address needs the kinds array; read it lazily so a main-field
		// caret move (the common case) costs no `doc.cards` allocation.
		const kinds = addr.card != null && docHandle ? docHandle.cards.map((c) => c.kind) : [];
		const field = fieldPathForAddr?.(addr, kinds);
		if (field != null) {
			previewRef?.focusPosition(field, pos);
			lastFocus = JSON.stringify({ field, pos });
		}
		// A prose edit surfaces only as a caret move — recompile to follow it.
		scheduleRecompile();
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
				// Dynamic import keeps WASM's top-level await out of the route module
				// (Safari/dev TDZ, Kit #7805); VisualEditor rides the same import. The
				// fixture fetch is independent of both, so it runs alongside them.
				const treeP = loadUsafMemoTree();
				const [{ Engine, Quill, init }, visual] = await Promise.all([
					import('$lib/core'),
					import('$lib/visual')
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
				fieldPathForAddr = visual.fieldPathForAddr;
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

<main>
	<h1>@quillmark/editor — Editor</h1>
	<p class="sub">Phase 5 — the split-pane shell: edit ⇄ preview, one session.</p>

	{#if status.phase === 'loading'}
		<p data-testid="status" class="loading">Loading reference quill…</p>
	{:else if status.phase === 'error'}
		<p data-testid="status" class="error">Error: {status.message}</p>
	{:else}
		<p data-testid="status" class="ready">Session open.</p>

		<div class="bridge-state">
			<span>active: <code data-testid="active-addr">{activeAddr}</code></span>
			<span
				>hit: <code data-testid="last-hit"
					>{lastHit ? JSON.stringify({ field: lastHit.field, pos: lastHit.pos }) : 'none'}</code
				></span
			>
			<span>focus→preview: <code data-testid="last-focus">{lastFocus}</code></span>
			<span
				>dirtyPages: <code data-testid="last-change"
					>{lastChange ? JSON.stringify(lastChange.dirtyPages) : 'none'}</code
				></span
			>
			<button type="button" data-testid="inject-diagnostics" onclick={injectDiagnostics}
				>Inject diagnostics</button
			>
			<button type="button" data-testid="toggle-source" onclick={() => (showSource = !showSource)}
				>{showSource ? 'Hide' : 'Show'} source</button
			>
		</div>

		<div
			class="shell"
			bind:this={shellEl}
			style="grid-template-columns: minmax(0, {splitPct}fr) 11px minmax(0, {100 - splitPct}fr)"
		>
			<section class="editor-pane" aria-label="Visual editor">
				{#if VisualEditor && docHandle && quillHandle}
					<VisualEditor
						bind:this={editorRef}
						doc={docHandle}
						quill={quillHandle}
						onActiveAddrChange={handleActiveAddr}
						onCaretMove={handleCaretMove}
						onChange={scheduleRecompile}
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
			<section class="preview-pane" aria-label="Live preview">
				{#if session}
					<Preview bind:this={previewRef} {session} onCaretPick={handleCaretPick} />
				{/if}
			</section>
		</div>

		{#if showSource && docHandle}
			<section class="source-drawer" aria-label="Debug source view" data-testid="source-drawer">
				<div class="drawer-label">Canonical markdown (read-only)</div>
				<div class="source-host">
					<SourceView bind:this={sourceRef} doc={docHandle} />
				</div>
			</section>
		{/if}
	{/if}
</main>

<style>
	/* The playground is the reference CONSUMER: it derives its own chrome from the
	   package's two colour dials with the same oklab idiom the package derivation
	   uses (THEMING.md), rather than reaching for internals. Namespaced `--pg-*` —
	   only the ten `--qm-*` dials are package surface. */
	main {
		--pg-border-strong: color-mix(in oklab, var(--qm-bg, #fff), var(--qm-fg, #1a1a1a) 40%);
		--pg-border: color-mix(in oklab, var(--qm-bg, #fff), var(--qm-fg, #1a1a1a) 17%);
		--pg-card-bg: color-mix(in oklab, var(--qm-bg, #fff), var(--qm-fg, #1a1a1a) 2%);
		--pg-main-bg: var(--qm-bg, #fff);
		--pg-ghost: color-mix(in oklab, var(--qm-fg, #1a1a1a), var(--qm-bg, #fff) 60%);
		--pg-section-label: color-mix(in oklab, var(--qm-fg, #1a1a1a), var(--qm-bg, #fff) 45%);

		font-family: ui-sans-serif, system-ui, sans-serif;
		max-width: 88rem;
		margin: 1.25rem auto;
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
	.bridge-state {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin: 0.75rem 0;
		font-size: 0.72rem;
		color: #666;
	}
	.bridge-state code {
		background: #f3f3f3;
		border-radius: 3px;
		padding: 0.05rem 0.3rem;
		font-size: 0.7rem;
	}
	.bridge-state button {
		font-size: 0.72rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid var(--pg-border);
		border-radius: 5px;
		background: #fafafa;
		cursor: pointer;
	}
	.shell {
		display: grid;
		/* grid-template-columns is set inline from `splitPct` — the middle track
		   holds the resizer, the two side tracks are the panes. */
		align-items: start;
		height: 72vh;
	}
	.editor-pane {
		min-width: 0;
		height: 100%;
		overflow: auto;
		padding: 0.5rem;
		border: 1px solid var(--pg-border);
		border-radius: var(--qm-radius, 8px);
		background: var(--pg-main-bg);
	}
	.preview-pane {
		min-width: 0;
		height: 100%;
		border: 1px solid var(--pg-border);
		border-radius: var(--qm-radius, 8px);
		overflow: hidden;
		background: var(--pg-card-bg);
	}
	/* Reference resizer — a hairline in an 11px hit track, thickening on
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
		width: 3px;
		height: 100%;
		border-radius: 999px;
		background: var(--pg-border);
		transition:
			width 0.1s ease,
			background-color 0.1s ease;
	}
	.resizer:hover::before,
	.resizer:focus-visible::before,
	.resizer.dragging::before {
		width: 5.5px;
		background: var(--pg-border-strong);
	}
	.resizer:focus-visible {
		outline: none;
	}
	.grip {
		position: absolute;
		font-size: 0.8rem;
		line-height: 1;
		color: var(--pg-ghost);
		background: var(--pg-main-bg);
		padding: 0.15rem 0;
		border-radius: 999px;
		opacity: 0;
		transition: opacity 0.1s ease;
		pointer-events: none;
	}
	.resizer:hover .grip,
	.resizer:focus-visible .grip,
	.resizer.dragging .grip {
		opacity: 1;
	}
	.source-drawer {
		margin-top: 1rem;
		border: 1px solid var(--pg-border);
		border-radius: var(--qm-radius, 8px);
		overflow: hidden;
	}
	.drawer-label {
		font-size: 0.68rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--pg-section-label);
		padding: 0.4rem 0.6rem;
		background: #f3f3f3;
		border-bottom: 1px solid var(--pg-border);
	}
	.source-host {
		height: 22rem;
	}
</style>
