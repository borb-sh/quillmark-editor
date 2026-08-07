<!--
  The reference SPLIT-PANE SHELL, and the page the site is named for. One
  consumer-owned LiveSession drives all three surfaces over one seeded document:
    • <VisualEditor> (left): the edit surface; commits land on `doc`.
    • <Preview>      (right): a pure view of the session; never mutates it.
    • <SourceMirror> (drawer): read-only canonical markdown of `doc`, app-local.

  It wires the glue the primitives push outward (ARCHITECTURE §Playground), all
  through the PUBLIC API; no reach-through:

    edit ─► (debounced) session.update(doc) ─► preview.refresh(change)
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
  error), so a round-trip that lands nowhere shows there, as does a failure the
  surfaces recovered from. `inject-diagnostics` stands in for a live
  render-error feed: a real consumer derives external diagnostics from
  `session.warnings` (wired here, `[]` for usaf_memo) plus render errors.

  The fixture variants are query flags with no chrome: schema or seed changes read
  once at mount, for the branches the reference quill on disk reaches none of
  (PLAYGROUND §"Fixture variants").
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type {
		Quill,
		Document,
		LiveSession,
		ContentHit,
		ChangeSet,
		Diagnostic
	} from '@quillmark/wasm';
	import type { Place, EditorError } from '@quillmark/svelte/core';
	import type { ActiveLeaf, EditorChange } from '@quillmark/svelte/visual';
	import { Preview } from '@quillmark/svelte/preview';
	import SourceMirror from './SourceMirror.svelte';
	import { loadUsafMemoTree, withMainDateDefault, withSecondCardKind } from '../fixture';

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
	let sourceRef: ReturnType<typeof SourceMirror> | undefined = $state();

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
			const change = session.update(docHandle);
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
	// it happens once per gesture, and a card that appears after a delay reads as
	// lag.
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
				// Dynamic: the WASM binary and VisualEditor's ProseMirror stack are the
				// route's heaviest payload and nothing before paint needs them, so they load
				// after mount. `init` instantiates the core and every boundary verb throws
				// `runtime::not_initialized` until it resolves. The fixture load is one of
				// them (it materializes a quill to read its tree), so it waits.
				const [{ Engine, Quill, Document, MAIN_CARD_ADDR }, { init }, visual] = await Promise.all([
					import('@quillmark/wasm'),
					import('@quillmark/svelte/core'),
					import('@quillmark/svelte/visual')
				]);
				await init();
				const tree = await loadUsafMemoTree();
				// The SCHEMA variants, patched into the tree before the quill is built:
				// `?dateDefault=YYYY-MM-DD` gives the main `date` a literal default (the
				// reference quill declares a blank one, which ghosts nothing), `?kinds2` a
				// second card kind, so the add affordance takes its menu branch.
				const params = new URLSearchParams(window.location.search);
				const dateDefault = params.get('dateDefault');
				if (dateDefault) withMainDateDefault(tree, dateDefault);
				if (params.has('kinds2')) withSecondCardKind(tree);
				const quill = Quill.fromTree(tree);
				const doc = quill.seedDocument();
				// The SEED variants. `?foreign` holds a card whose kind the schema cannot
				// project: `Document.insertCard` is schema-agnostic where the Quill-bound
				// writer would reject it, which is the case the recovery shell handles.
				// `?tips` seeds the guidance channel a quill or consumer supplies (`$ext`,
				// not schema), through `patchEditorExt`, so a consumer seeding one key does
				// not replace the namespace.
				if (params.has('foreign')) {
					doc.insertCard(Document.makeCard('legacy_kind', {}, 'Trapped legacy body.'));
				}
				if (params.has('tips')) {
					visual.patchEditorExt(doc, MAIN_CARD_ADDR, {
						tips: [
							'Press **Tab** to move on.',
							'Run `npm run dev` for the playground.',
							'Last one — dismissing clears the channel.'
						]
					});
				}
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

<main class="pg-width page">
	<header class="pg-head">
		<h1 class="pg-title">Playground</h1>
		{#if status.phase === 'loading'}
			<p data-testid="status" class="qm-status">Opening…</p>
		{:else if status.phase === 'error'}
			<p data-testid="status" class="qm-status qm-status-error">Error: {status.message}</p>
		{/if}
	</header>

	{#if status.phase === 'ready'}
		<!-- The bridge, read back out: each hop's last outcome, so a round-trip that
		     lands nowhere shows here. -->
		<div class="qm-panel strip">
			<span class="stat"
				><span class="qm-label">active</span>
				<span class="qm-readout" data-testid="active-addr">{activeAddr}</span></span
			>
			<span class="stat"
				><span class="qm-label">hit</span>
				<span class="qm-readout" data-testid="last-hit"
					>{lastHit ? JSON.stringify({ field: lastHit.field, pos: lastHit.pos }) : 'none'}</span
				></span
			>
			<span class="stat"
				><span class="qm-label">focus→preview</span>
				<span class="qm-readout" data-testid="last-focus">{lastFocus}</span></span
			>
			<span class="stat"
				><span class="qm-label">dirty pages</span>
				<span class="qm-readout" data-testid="last-change"
					>{lastChange ? JSON.stringify(lastChange.dirtyPages) : 'none'}</span
				></span
			>
			<span class="stat"
				><span class="qm-label">lane</span>
				<span class="qm-readout" data-testid="last-change-source">{lastChangeSource}</span></span
			>
			<span class="stat"
				><span class="qm-label">error</span>
				<span class="qm-readout" data-testid="last-error">{lastError}</span></span
			>
			<span class="strip-actions">
				<button
					class="qm-control"
					type="button"
					data-testid="inject-diagnostics"
					onclick={injectDiagnostics}>Inject diagnostics</button
				>
				<button
					class="qm-control"
					type="button"
					data-testid="toggle-source"
					aria-pressed={showSource}
					onclick={() => (showSource = !showSource)}>Source</button
				>
			</span>
		</div>

		<div class="shell">
			<section class="pg-frame editor-pane" aria-label="Visual editor">
				{#if VisualEditor && docHandle && quillHandle}
					<VisualEditor
						class="qm-pane"
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
			<section class="pg-frame preview-pane" aria-label="Live preview">
				{#if session}
					<Preview bind:this={previewRef} {session} onCaretPick={handleCaretPick} />
				{/if}
			</section>
		</div>

		{#if showSource && docHandle}
			<section class="pg-frame drawer" aria-label="Debug source view" data-testid="source-drawer">
				<p class="qm-label drawer-label">Canonical markdown — read only</p>
				<div class="source-host">
					<SourceMirror
						bind:this={sourceRef}
						doc={docHandle}
						onError={(message) => (lastError = `toMarkdown: ${message}`)}
					/>
				</div>
			</section>
		{/if}
	{/if}
</main>

<style>
	/* The page takes what the shell hands it and never scrolls itself: the panes
	   below own their overflow, so the surfaces stay put while their contents move.
	   Below the split's threshold the stacked panes outgrow it and this column takes
	   the scroll: the shell is pinned to the viewport at every width, so this is the
	   one place on the route a scroll can land. */
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--qmh-space-4);
		min-height: 0;
		padding-bottom: var(--qmh-space-4);
	}

	.strip {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--qmh-space-2) var(--pg-space-6);
	}

	.stat {
		display: flex;
		align-items: baseline;
		gap: var(--qmh-space-2);
		min-width: 0;
	}

	.stat .qm-readout {
		color: var(--qmh-ink-meta);
	}

	.strip-actions {
		display: flex;
		gap: var(--qmh-space);
		margin-inline-start: auto;
	}

	/* Two even tracks, one row, taking the height the page has left after the head and
	   the strip, and the drawer when it is open. The panes carry their own borders, so
	   the page gap is the whole of what sits between them. */
	.shell {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr);
		gap: var(--qmh-space-4);
		flex: 2 1 0;
		min-height: 0;
	}

	/* Both panes are the shell's frame and give their surface room, nothing more: the
	   gutter, the scroll container, the tone and the tail are the surface's own
	   (THEMING §"Drop it in"), so the editor takes `.qm-pane` in the markup and the
	   two rules here are what is left: a track that may shrink below its content. */
	.editor-pane {
		min-width: 0;
		min-height: 0;
	}

	.preview-pane {
		min-width: 0;
		min-height: 0;
	}

	/* Open, the drawer takes a third of what the panes had rather than a height of
	   its own: the page cannot grow, so the room comes from the split. */
	.drawer {
		display: flex;
		flex-direction: column;
		flex: 1 1 0;
		min-height: 0;
	}

	.drawer-label {
		padding: var(--qmh-space-2) var(--qmh-space-3);
		border-bottom: var(--qmh-border-width) solid var(--qmh-border);
	}

	.source-host {
		flex: 1 1 0;
		min-height: 0;
		background: var(--qmh-page);
	}

	/* Below the width that fits two panes side by side, the tracks stack and each pane
	   takes the short mount. Nothing flexes, so the column outgrows the shell and
	   scrolls inside it: both panes are reachable and the document is still not a
	   scroller. */
	@media (width < 60rem) {
		.page {
			overflow: auto;
		}

		.shell {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: none;
			flex: 0 0 auto;
		}

		.editor-pane,
		.preview-pane,
		.source-host {
			height: var(--pg-pane);
		}

		.drawer {
			flex: 0 0 auto;
		}
	}
</style>
