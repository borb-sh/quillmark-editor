<!--
  The reference SPLIT-PANE SHELL, and the page the site is named for. One
  consumer-owned LiveSession drives both surfaces over one seeded document:
    • <VisualEditor> (left): the edit surface; commits land on `doc`.
    • <Preview>      (right): a pure view of the session; never mutates it.

  It wires the glue the primitives push outward (ARCHITECTURE §Playground), all
  through the PUBLIC API; no reach-through:

    edit ─► (debounced) session.update(doc) ─► preview.refresh(change)
                                            └► diagnostics = session.warnings
    preview click ─► onPick(at) ─► editor.setCaret(at)          (preview→editor)
                                      └► shown = 1                (reveal, narrow)
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

  Under the preset's threshold the split shows ONE track and the switch band says
  which, so the bridge's preview→editor hop reveals the editor as well as placing
  the caret in it: a hit that lands in a hidden pane lands nowhere a reader can see.
  Both panes stay mounted either way: the switch is CSS over a state, never an
  `{#if}` that would take the editor's history with it.

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
	import type { Quill, Document, LiveSession, ChangeSet, Diagnostic } from '@quillmark/wasm';
	import type { Landing, Place, EditorError } from '@quillmark/svelte/core';
	import type { ActiveLeaf, EditorChange } from '@quillmark/svelte/visual';
	import { Preview } from '@quillmark/svelte/preview';
	import { loadUsafMemoTree, withMainDateDefault, withSecondCardKind } from '../fixture';

	type Status = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };
	type VisualEditorComponent = typeof import('@quillmark/svelte/visual').VisualEditor;

	let status = $state<Status>({ phase: 'loading' });
	let VisualEditor = $state<VisualEditorComponent | undefined>();

	let session: LiveSession | undefined = $state();
	let quillHandle: Quill | undefined = $state();
	let docHandle: Document | undefined = $state();

	// Surface handles for the imperative bridge hops.
	let editorRef: { setCaret(at: Landing): Promise<void> } | undefined = $state();
	let previewRef: ReturnType<typeof Preview> | undefined = $state();

	// Which of the split's two tracks is showing. It is read only under the preset's
	// threshold, where one shows at a time; above it the attribute is inert and the
	// switch band is not drawn, so the route holds one number at every width rather
	// than a viewport in JS beside the one the stylesheet already has.
	let shown = $state<1 | 2>(1);

	// External diagnostics fed to the editor = live `session.warnings` + any
	// injected render-error stand-ins (recomputed on every recompile).
	let injected = $state<Diagnostic[]>([]);
	let externalDiagnostics = $state<Diagnostic[]>([]);
	function syncDiagnostics(): void {
		externalDiagnostics = session ? [...session.warnings, ...injected] : injected;
	}

	// Bridge observability: what the strip reads.
	let lastHit = $state<Landing | undefined>();
	let activeAddr = $state('none');
	let lastFocus = $state('none');
	let lastChange = $state<ChangeSet | undefined>();
	let lastChangeSource = $state('none');
	let lastError = $state('none');

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
			syncDiagnostics(); // re-read live warnings each compile, merged with the stand-ins
		} catch (e) {
			// A failed recompile keeps the last-good preview (the session is
			// transactional); surface it without crashing the shell.
			console.error('[playground] recompile failed', e);
		}
	}

	// ── Bridge: preview → editor ────────────────────────────────────────────────
	// The caret and the reveal together: under the threshold the editor is the track
	// that is not showing, and a caret placed in it is a round-trip the reader cannot
	// see land. Above it the write is a no-op the stylesheet ignores.
	//
	// The reveal needs no flush of its own, which is what makes the tab hop ordinary:
	// `setCaret` already waits one out before it lands (a collapsed group is `inert` and
	// swallows a focus, the same way a hidden track would), and the track's `display`
	// moves in that same flush.
	function handlePick(at: Landing): void {
		lastHit = at;
		shown = 1;
		editorRef?.setCaret(at);
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
				// after mount. `init` instantiates the core and resolves to `Quill` and
				// `Document`, which the artifact exports nowhere statically. The fixture
				// load awaits the same memoized gate to materialize its quill.
				const [{ Engine, MAIN_CARD_ADDR }, { init }, visual] = await Promise.all([
					import('@quillmark/wasm'),
					import('@quillmark/svelte/core'),
					import('@quillmark/svelte/visual')
				]);
				const { Quill, Document } = await init();
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

<svelte:head><title>Playground · quillmark</title></svelte:head>

<main class="pg-width page">
	<!-- The boundary's phase, and only while it is one: the route carries no title,
	     since the running head names it and marks it current, and an open session says
	     the rest by painting the page. So the band is gone at rest and the panes have
	     the room (PLAYGROUND §"The routes"). -->
	{#if status.phase === 'loading'}
		<p data-testid="status" class="qm-status phase">Opening…</p>
	{:else if status.phase === 'error'}
		<p data-testid="status" class="qm-status qm-status-error phase">Error: {status.message}</p>
	{/if}

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
				<!-- The one reading on the strip that is a failure rather than a fact, so it
				     is the one that takes colour when it holds one. -->
				<span class="qm-readout" class:alert={lastError !== 'none'} data-testid="last-error"
					>{lastError}</span
				></span
			>
			<span class="strip-actions">
				<button
					class="qm-control"
					type="button"
					data-testid="inject-diagnostics"
					onclick={injectDiagnostics}>Inject diagnostics</button
				>
			</span>
		</div>

		<!-- Drawn only under the preset's threshold, where the split shows one track.
		     The pair reads as one choice, so the pressed state is the whole of what
		     says which: `.qm-control` already carries it. -->
		<div class="qm-switch" role="group" aria-label="Visible pane">
			<button
				class="qm-control"
				type="button"
				data-testid="show-editor"
				aria-pressed={shown === 1}
				onclick={() => (shown = 1)}>Editor</button
			>
			<button
				class="qm-control"
				type="button"
				data-testid="show-preview"
				aria-pressed={shown === 2}
				onclick={() => (shown = 2)}>Preview</button
			>
		</div>

		<div class="qm-split shell" data-qm-show={shown}>
			<section class="qm-frame" aria-label="Visual editor">
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
			<section class="qm-frame" aria-label="Live preview">
				{#if session}
					<Preview bind:this={previewRef} {session} onPick={handlePick} />
				{/if}
			</section>
		</div>
	{/if}
</main>

<style>
	/* The page takes what the shell hands it and never scrolls itself, at every width:
	   the panes below own their overflow, so the surfaces stay put while their contents
	   move, and under the threshold the one showing takes the room the two had. */
	.page {
		display: flex;
		flex-direction: column;
		gap: var(--qmh-space-4);
		min-height: 0;
		/* The block gutter is the rung the bands are separated by: what stands between
		   the head's rule and the strip is what stands between the strip and the panes. */
		padding-block: var(--qmh-space-4);
	}

	/* A `<p>` in the column, so it takes the page's gap and nothing else; and it is here
	   only while the boundary is not open, so at rest the panes start under the head. */
	.phase {
		margin: 0;
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

	.stat .qm-readout.alert {
		color: var(--qmh-alert);
	}

	.strip-actions {
		display: flex;
		gap: var(--qmh-space);
		margin-inline-start: auto;
	}

	/* The split's tracks, its gap, its frames and the width it shows one track at are
	   `.qm-split`'s and `.qm-frame`'s (THEMING §"The shell"). What is left here is the
	   split's pull on the height under the head and the strip, which is all of it. */
	.shell {
		flex: 1 1 0;
	}
</style>
