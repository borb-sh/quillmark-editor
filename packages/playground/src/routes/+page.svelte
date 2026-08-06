<!--
  The front page: the thesis, then the quickstart in two columns — the steps a
  consumer reads down the left, the surfaces they produce standing beside them
  (PLAYGROUND §"The routes").

  Two documents off one quill: the preview's is the one its session paints, the
  editor's is its own. No apply loop runs here, so a shared document would let
  typing in the editor step desynchronize the page painted beside the ones above
  it; the two wired together is `/playground`.
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
			A WYSIWYG over the document and a canvas over the compiled page, on one session: an edit
			repaints the page, a click on the page moves the caret.
		</p>
		<div class="actions">
			<a class="pg-cta" href="{base}/playground">Open the playground</a>
			<a class="pg-cta-quiet" href="#get-started">Get started</a>
			<a class="pg-link" href="https://github.com/borb-sh/quillmark-js">Source</a>
		</div>
	</section>

	<section id="get-started" class="quickstart">
		<h2 class="qm-label">Get started</h2>

		<div class="split">
			<div class="col">
				<article class="step">
					<h3 class="qm-label">01 · Install</h3>
					<p>
						<code>@quillmark/svelte</code> is the surfaces;
						<code>@quillmark/wasm</code> is the engine they view.
					</p>
					<pre class="qm-readout sample">{INSTALL}</pre>
				</article>

				<article class="step">
					<h3 class="qm-label">02 · Session</h3>
					<p>
						A quill is a template's file tree; a document is the content in it. Opening the two
						compiles the first page and gives you the handle both surfaces read.
					</p>
					<pre class="qm-readout sample">{OPEN_SESSION}</pre>
				</article>

				<article class="step">
					<h3 class="qm-label">03 · Preview</h3>
					<p>
						<code>&lt;Preview&gt;</code> paints the session's pages to canvas and resolves a click to
						the content under it, so the compiled page is addressable rather than a picture.
					</p>
					<pre class="qm-readout sample">{PREVIEW}</pre>
				</article>
			</div>

			<figure class="art">
				<figcaption class="art-head">
					<span class="qm-label">&lt;Preview&gt;</span>
					{#if status.phase === 'loading'}
						<span data-testid="status" class="qm-status">Opening the reference quill…</span>
					{:else if status.phase === 'error'}
						<span data-testid="status" class="qm-status qm-status-error"
							>Error: {status.message}</span
						>
					{/if}
				</figcaption>
				<div class="pg-frame demo-frame">
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
			</figure>
		</div>

		<div class="split band">
			<div class="col">
				<article class="step">
					<h3 class="qm-label">04 · Edit</h3>
					<p>
						<code>&lt;VisualEditor&gt;</code> projects the quill's schema onto the document: prose
						where the field takes prose, a control where it takes a value, a card per block.
						<code>onChange</code> fires when an edit lands, and applying it to the session hands the preview
						the pages to repaint.
					</p>
					<pre class="qm-readout sample">{VISUAL}</pre>
				</article>

				<article class="step">
					<h3 class="qm-label">Next</h3>
					<p>
						Both surfaces on one session, the caret bridged in both directions:
						<a class="pg-link" href="{base}/playground">the playground</a>.
					</p>
				</article>
			</div>

			<figure class="art">
				<figcaption class="art-head">
					<span class="qm-label">&lt;VisualEditor&gt;</span>
				</figcaption>
				<div class="pg-frame demo-frame">
					{#if VisualEditor && editDoc && quillHandle}
						<VisualEditor class="qm-pane" doc={editDoc} quill={quillHandle} />
					{/if}
				</div>
			</figure>
		</div>
	</section>
</main>

<style>
	/* A front page opens on air, where a tool route opens on its surface. */
	.hero {
		display: flex;
		flex-direction: column;
		gap: var(--qmh-space-4);
		max-width: var(--qmh-measure);
		padding-block: var(--pg-space-12) var(--pg-space-8);
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

	.quickstart {
		display: flex;
		flex-direction: column;
		gap: var(--pg-space-8);
		border-top: var(--qmh-border-width) solid var(--qmh-border);
		padding-block: var(--pg-space-8) var(--pg-space-12);
	}

	/* The two columns of the front page: the reading column at its measure, which is
	   also what a sample was written to fit, and the rest of the page for the surface
	   those steps mount. The steps beside one surface are the steps that reach it —
	   install, session, mount is one band, edit is the next — so the split is a band
	   rather than a step, and no step spends half a page proving it has no output. */
	.split {
		display: grid;
		grid-template-columns: minmax(0, var(--qmh-measure)) minmax(0, 1fr);
		column-gap: var(--pg-space-8);
		align-items: start;
	}

	/* The second band's rule, on the row rather than around it: a hairline between the
	   surfaces is what separates them, and one under the last of them would close a
	   section that ends at the page. */
	.band {
		border-top: var(--qmh-border-width) solid var(--qmh-border);
		padding-top: var(--pg-space-8);
	}

	.col {
		display: flex;
		flex-direction: column;
		gap: var(--pg-space-8);
		min-width: 0;
	}

	.step {
		display: flex;
		flex-direction: column;
		gap: var(--qmh-space-3);
	}

	.step p {
		margin: 0;
	}

	code {
		font-family: var(--qmh-font-mono);
		font-size: var(--qmh-text-label);
	}

	/* Code keeps its own line breaks and scrolls sideways rather than wrapping: a
	   wrapped line reads as two statements, and the column it sits in is the measure,
	   which is the width the samples are cut to. */
	.sample {
		white-space: pre;
		word-break: normal;
		overflow-x: auto;
	}

	/* A mounted surface and what names it. `figure`'s margins go: the column places it. */
	.art {
		display: flex;
		flex-direction: column;
		gap: var(--qmh-space-2);
		margin: 0;
		min-width: 0;
	}

	/* The surface's name, and the boundary's phase off the end of the line while it is
	   not open — the one place on the page a session says anything in words. */
	.art-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--qmh-space-2) var(--qmh-space-4);
	}

	.art-head .qm-status {
		margin-inline-start: auto;
	}

	/* What a demo frame owes a surface is a height to sit in. The gutter, the tone and
	   the desk are the surface's own (THEMING §"Drop it in"), so a frame that states
	   them would be restating the package to itself. */
	.demo-frame {
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

	/* Below the width that holds a measure and a surface beside it, the split stacks
	   and a surface follows the steps that mount it, which is the order the columns
	   already read in. */
	@media (width < 60rem) {
		.hero {
			padding-block: var(--pg-space-8);
		}

		.split {
			grid-template-columns: minmax(0, 1fr);
			row-gap: var(--pg-space-8);
		}
	}
</style>
