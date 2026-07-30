<!--
  The playground's front page, and the one route written for a stranger. It opens
  a session over the reference quill exactly as the tool routes do, then spends it
  twice: the hero mounts <Preview> over it, so the first thing a visitor sees is a
  real compiled page painted by the package rather than a picture of one, and the
  panel at the foot reports the boundary quantities off the same handles
  (pageCount / supportsCanvas / warnings).

  Clicking the hero sheet is the package's thesis in one gesture — a hit on the
  painted page resolves to a content address, printed under it. Nothing else on
  the page claims anything the session is not already proving.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import { Preview } from '$lib/preview';
	import type { ContentHit, Diagnostic, LiveSession } from '$lib/core';
	import { loadUsafMemoTree } from './fixture';

	type Status =
		| { phase: 'loading' }
		| { phase: 'error'; message: string }
		| {
				phase: 'ready';
				quillName: string;
				quillVersion: string;
				backendId: string;
				fieldCount: number;
				cardKinds: string[];
				pageCount: number;
				supportsCanvas: boolean;
				warnings: Diagnostic[];
		  };

	// The running head routes to these; what it cannot carry is what each one is.
	const SURFACES = [
		{ path: '/preview', name: 'Preview', line: 'paint, overlay, click bridge' },
		{ path: '/visual', name: 'Visual', line: 'the WYSIWYG over a seeded document' },
		{ path: '/editor', name: 'Editor', line: 'both surfaces, one session, caret bridged' }
	];

	let status = $state<Status>({ phase: 'loading' });
	let session = $state<LiveSession | undefined>();
	let lastHit = $state<ContentHit | undefined>();
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
				// Safari/dev doesn't TDZ on Kit's `component` export.
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
				session = openedSession;
				status = {
					phase: 'ready',
					quillName: quill.metadata.name,
					quillVersion: quill.metadata.version,
					backendId: quill.backendId,
					fieldCount: Object.keys(quill.schema.main.fields).length,
					cardKinds: Object.keys(quill.schema.card_kinds ?? {}),
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
			session = undefined;
		};
	});
</script>

<main class="pg-width">
	<section class="hero">
		<div class="thesis">
			<h1 class="pg-title">Editor + live preview for Quillmark</h1>
			<p class="pg-deck">
				The preview is the compiled page, repainted from the session as you type. A click on the
				page resolves to a content position and sets the editor caret.
			</p>
			<div class="actions">
				<a class="pg-cta" href="{base}/editor">Open the editor</a>
				<a class="pg-link" href="https://github.com/borb-sh/quillmark-editor">Source</a>
			</div>
		</div>

		<!-- The sheet: the reference quill, compiled and painted, on a page tone the
		     host supplies. Sized to the first page and non-scrolling — a wheel over
		     the hero scrolls the PAGE, not the paper (PLAYGROUND §"The routes"). -->
		<figure class="sheet">
			<div class="pg-frame sheet-frame">
				{#if session}
					<Preview
						{session}
						margin={0}
						style="overflow-y: hidden"
						onCaretPick={(hit) => (lastHit = hit)}
					/>
				{/if}
			</div>
			<figcaption class="sheet-caption">
				<span class="pg-label">Caret pick</span>
				<span class="pg-readout" data-testid="hero-hit">
					{lastHit ? `${lastHit.field} @ ${lastHit.pos}` : 'click any text on the page'}
				</span>
			</figcaption>
		</figure>
	</section>

	<section class="pg-rail block">
		<h2 class="pg-label">Surfaces</h2>
		<ul class="surfaces">
			{#each SURFACES as surface (surface.path)}
				<li>
					<a class="pg-link" href="{base}{surface.path}">{surface.name}</a> — {surface.line}
				</li>
			{/each}
		</ul>
	</section>

	<section class="pg-rail block">
		<h2 class="pg-label">Install</h2>
		<pre class="pg-readout install">npm install @quillmark/editor</pre>
	</section>

	<section class="pg-rail block">
		<h2 class="pg-label">Session</h2>
		<div class="pg-panel readout-panel">
			{#if status.phase === 'loading'}
				<p data-testid="status" class="pg-status loading">Loading reference quill…</p>
			{:else if status.phase === 'error'}
				<p data-testid="status" class="pg-status error">Error: {status.message}</p>
			{:else}
				<p data-testid="status" class="pg-status ready">Session open</p>
				<dl class="facts">
					<dt>quill</dt>
					<dd>{status.quillName}@{status.quillVersion}</dd>
					<dt>backend</dt>
					<dd>{status.backendId}</dd>
					<dt>main fields</dt>
					<dd>{status.fieldCount}</dd>
					<dt>card kinds</dt>
					<dd>{status.cardKinds.join(', ') || '—'}</dd>
					<dt>pageCount</dt>
					<dd data-testid="pageCount">{status.pageCount}</dd>
					<dt>supportsCanvas</dt>
					<dd data-testid="supportsCanvas">{status.supportsCanvas}</dd>
					<dt>warnings</dt>
					<dd data-testid="warnings">{status.warnings.length}</dd>
				</dl>
			{/if}
		</div>
	</section>
</main>

<style>
	/* The thesis and the artifact it describes, side by side; the sheet drops under
	   the text where the two no longer fit. */
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 26rem;
		gap: var(--pg-space-16);
		align-items: start;
		padding-block: var(--pg-space-16);
	}

	.thesis {
		display: flex;
		flex-direction: column;
		gap: var(--pg-space-4);
		max-width: var(--pg-measure);
	}

	h1 {
		text-wrap: balance;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--pg-space-4);
		margin-top: var(--pg-space-2);
	}

	.sheet {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--pg-space-2);
	}

	/* The desk inset: the painted page carries its own edge and shadow, so what the
	   host owes it is room to sit in and a tone to read against. US Letter's ratio
	   on the border box, so the whole first page fits the frame: the padding's
	   worth of spare (~10px) is under the page-gap the paint loop puts before page
	   2, which is what keeps the fold clean. */
	.sheet-frame {
		aspect-ratio: 17 / 22;
		padding: var(--pg-space-4);
	}

	.sheet-caption {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--pg-space-2);
	}

	.sheet-caption .pg-readout {
		color: var(--pg-ink-meta);
	}

	/* ── Sections ───────────────────────────────────────────────────────────── */

	.block {
		padding-block: var(--pg-space-12);
		border-top: var(--pg-border-width) solid var(--pg-border);
	}

	/* Three lines of prose, not three cards: the running head already routes here,
	   so what is left to say is one clause each. */
	.surfaces {
		list-style: none;
		margin: 0;
		padding: 0;
		max-width: var(--pg-measure);
		color: var(--pg-ink-meta);
	}

	.install {
		max-width: var(--pg-measure);
	}

	.readout-panel {
		display: flex;
		flex-direction: column;
		gap: var(--pg-space-3);
		max-width: var(--pg-measure);
	}

	.facts {
		display: grid;
		grid-template-columns: max-content minmax(0, 1fr);
		gap: var(--pg-space) var(--pg-space-6);
		margin: 0;
		font-family: var(--pg-font-mono);
		font-size: var(--pg-text-label);
		line-height: var(--pg-leading-tight);
		font-variant-numeric: tabular-nums;
	}

	dt {
		color: var(--pg-ghost);
	}

	dd {
		margin: 0;
		overflow-wrap: anywhere;
	}

	@media (width < 60rem) {
		.hero {
			grid-template-columns: minmax(0, 1fr);
			gap: var(--pg-space-8);
			padding-block: var(--pg-space-12) var(--pg-space-8);
		}
		.sheet {
			max-width: 26rem;
		}
	}
</style>
