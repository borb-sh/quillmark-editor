<!--
  The front page: the thesis, then the quickstart, each step's sample mounted
  beside the surface it describes (PLAYGROUND §"The routes").

  Two documents off one quill: one the preview's session paints, one the editor
  holds. No apply loop runs here, so a shared document would let typing in the
  editor step desynchronize the page painted in the one above it. `/playground`
  is where the two are wired together.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { Preview } from '@quillmark/svelte/preview';
	import type { ContentHit, Document, LiveSession, Quill } from '@quillmark/wasm';
	import { loadUsafMemoTree } from './fixture';
	import { INSTALL, OPEN_SESSION, PREVIEW, VISUAL } from './samples';

	type Status = { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready' };
	type VisualEditorComponent = typeof import('@quillmark/svelte/visual').VisualEditor;

	let status = $state<Status>({ phase: 'loading' });
	let VisualEditor = $state<VisualEditorComponent | undefined>();
	let session = $state<LiveSession | undefined>();
	let quillHandle = $state<Quill | undefined>();
	let editDoc = $state<Document | undefined>();
	let lastHit = $state<ContentHit | undefined>();
	let toFree: Array<{ free(): void }> = [];

	onMount(() => {
		let cancelled = false;
		(async () => {
			// Handles created so far, newest first; freed in reverse creation order on
			// unmount-during-open and on a mid-chain failure (`engine.open` throwing
			// after `quill`/`doc` already exist).
			const created: Array<{ free(): void }> = [];
			try {
				// Dynamic: the WASM binary and VisualEditor's ProseMirror stack are the
				// route's heaviest payload and nothing before paint needs them. `init`
				// instantiates the core and every boundary verb throws
				// `runtime::not_initialized` until it resolves; the fixture load is one of
				// them (it materializes a quill to read its tree), so it waits.
				const [{ Engine, Quill }, { init }, visual] = await Promise.all([
					import('@quillmark/wasm'),
					import('@quillmark/svelte/core'),
					import('@quillmark/svelte/visual')
				]);
				await init();
				const quill = Quill.fromTree(await loadUsafMemoTree());
				created.unshift(quill);
				const previewDoc = quill.seedDocument();
				created.unshift(previewDoc);
				const engine = new Engine();
				const openedSession = await engine.open(quill, previewDoc);
				created.unshift(openedSession);
				const doc = quill.seedDocument();
				created.unshift(doc);
				if (cancelled) {
					for (const h of created) h.free();
					return;
				}
				toFree = created;
				VisualEditor = visual.VisualEditor;
				session = openedSession;
				quillHandle = quill;
				editDoc = doc;
				status = { phase: 'ready' };
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
			VisualEditor = undefined;
			session = undefined;
			quillHandle = undefined;
			editDoc = undefined;
		};
	});
</script>

<main class="pg-width">
	<section class="hero">
		<h1 class="pg-title">Editor + live preview for Quillmark</h1>
		<p class="lede">
			A visual editor for the document and a canvas preview of the compiled page, sharing one
			session. An edit repaints the page; a click on the page moves the caret.
		</p>
		<div class="actions">
			<a class="pg-cta" href="{base}/playground">Open the playground</a>
			<a class="pg-cta-quiet" href="#get-started">Get started</a>
			<a class="pg-link" href="https://github.com/borb-sh/quillmark-js">Source</a>
		</div>
	</section>

	<section id="get-started" class="pg-rail block">
		<h2 class="qm-label">Get started</h2>
		<div class="intro">
			<p>Four steps to a running editor. Each surface shown here runs the sample beside it.</p>
			{#if status.phase === 'loading'}
				<p data-testid="status" class="qm-status">Opening the reference quill…</p>
			{:else if status.phase === 'error'}
				<p data-testid="status" class="qm-status qm-status-error">Error: {status.message}</p>
			{/if}
		</div>
	</section>

	<section class="pg-rail block">
		<h3 class="qm-label">01 · Install</h3>
		<div class="step">
			<p>
				<code>@quillmark/svelte</code> provides the surfaces;
				<code>@quillmark/wasm</code> is the engine they read.
			</p>
			<pre class="qm-readout sample">{INSTALL}</pre>
		</div>
	</section>

	<section class="pg-rail block">
		<h3 class="qm-label">02 · Session</h3>
		<div class="step">
			<p>
				A quill is a template's file tree; a document is the content in it. Opening the two compiles
				the first page and returns the session handle both surfaces read.
			</p>
			<pre class="qm-readout sample">{OPEN_SESSION}</pre>
		</div>
	</section>

	<section class="pg-rail block">
		<h3 class="qm-label">03 · Preview</h3>
		<div class="step">
			<p>
				<code>&lt;Preview&gt;</code> paints the session's pages to canvas and resolves a click to the
				content under it, so the compiled page is addressable and not just displayed.
			</p>
			<div class="pair">
				<pre class="qm-readout sample">{PREVIEW}</pre>
				<div class="demo">
					<div class="pg-frame preview-frame">
						{#if session}
							<Preview {session} margin={0} onCaretPick={(hit) => (lastHit = hit)} />
						{/if}
					</div>
					<p class="caption">
						<span class="qm-label">Caret pick</span>
						<span class="qm-readout" data-testid="demo-hit">
							{lastHit ? `${lastHit.field} @ ${lastHit.pos}` : 'click any text on the page'}
						</span>
					</p>
				</div>
			</div>
		</div>
	</section>

	<section class="pg-rail block">
		<h3 class="qm-label">04 · Edit</h3>
		<div class="step">
			<p>
				<code>&lt;VisualEditor&gt;</code> builds its controls from the quill's schema: a prose
				editor for a prose field, a control for a value field, a card per block.
				<code>onChange</code> fires when an edit lands; applying it to the session returns the pages the
				preview repaints.
			</p>
			<div class="pair">
				<pre class="qm-readout sample">{VISUAL}</pre>
				<div class="pg-frame editor-frame">
					{#if VisualEditor && editDoc && quillHandle}
						<VisualEditor class="qm-pane" doc={editDoc} quill={quillHandle} />
					{/if}
				</div>
			</div>
		</div>
	</section>

	<section class="pg-rail block">
		<h3 class="qm-label">Next</h3>
		<div class="step">
			<p>
				Both surfaces on one session, with the caret bridged in both directions:
				<a class="pg-link" href="{base}/playground">the playground</a>.
			</p>
		</div>
	</section>
</main>

<style>
	/* The front page opens on whitespace, where a tool route opens on its surface. */
	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--qmh-space-4);
		max-width: var(--qmh-measure);
		padding-block: var(--pg-space-16);
	}

	h1 {
		text-wrap: balance;
	}

	.lede {
		margin: 0;
		color: var(--qmh-ink-meta);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--qmh-space-4);
		margin-top: var(--qmh-space-2);
	}

	/* ── The quickstart ─────────────────────────────────────────────────────── */
	/* The anchor clears the running head, which sits over whatever the jump lands
	   on. */
	#get-started {
		scroll-margin-top: var(--pg-space-16);
	}

	.block {
		padding-block: var(--pg-space-12);
		border-top: var(--qmh-border-width) solid var(--qmh-border);
	}

	.intro,
	.step {
		display: flex;
		flex-direction: column;
		gap: var(--qmh-space-4);
	}

	.step p,
	.intro p {
		margin: 0;
		max-width: var(--qmh-measure);
	}

	.intro p {
		color: var(--qmh-ink-meta);
	}

	code {
		font-family: var(--qmh-font-mono);
		font-size: var(--qmh-text-label);
	}

	/* The sample and what it runs, side by side; stacked where a half column stops
	   holding a line of code, at the shell's one threshold. */
	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--qmh-space-4);
		align-items: start;
	}

	/* Code keeps its own line breaks and scrolls sideways rather than wrapping: a
	   wrapped line reads as two statements. The block form's cap is off, since a
	   sample is short by construction and a scrollbar inside a scrollbar is not. */
	.sample {
		white-space: pre;
		word-break: normal;
		max-height: none;
	}

	/* A sample with no surface beside it takes the reading column's width, not the
	   page's: a one-line shell command in a full-width box reads as a banner. */
	.step > .sample {
		max-width: var(--qmh-measure);
	}

	.demo {
		display: flex;
		flex-direction: column;
		gap: var(--qmh-space-2);
		min-width: 0;
	}

	/* A demo frame states a height and nothing else. The gutter, the tone and the desk
	   are the surface's own (THEMING §"Drop it in"), so a frame stating them would
	   duplicate the package. */
	.preview-frame {
		height: var(--pg-demo);
	}

	.editor-frame {
		height: var(--pg-demo);
		min-width: 0;
	}

	.caption {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--qmh-space-2);
		margin: 0;
	}

	.caption .qm-readout {
		color: var(--qmh-ink-meta);
	}

	@media (width < 60rem) {
		.hero {
			padding-block: var(--pg-space-12) var(--pg-space-8);
		}

		.pair {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
