<!--
  The debug drawer's read-only mirror of `doc.toMarkdown()`, app-local because the
  serialize is the whole of it: `Document` is the public handle and the canonical
  markdown is what it returns, so a route showing it needs no package surface
  (PLAYGROUND §"The routes").

  `refresh()` re-serializes after an edit lands, so the markdown tracks the live
  document. `toMarkdown()` emits canonical Quillmark markdown that re-parses to an
  equal `Document`, so this is exactly that form and never a pretty-print.

  A `<pre>` carrying text, not an editor: a mirror needs selectable monospace and
  nothing more, and syntax highlighting is worth less here than a route that pulls
  no editor library for a surface with no caret.
-->
<script lang="ts">
	import { tick } from 'svelte';
	import type { Document } from '@quillmark/wasm';

	interface Props {
		/** Serialized on mount and on every {@link refresh}. Bound once: remount ({#key doc}) to swap it. */
		doc: Document;
		/** A serialize that threw. The mirror shows the error text in place either way. */
		onError?: (message: string) => void;
	}
	let { doc, onError }: Props = $props();

	let hostEl: HTMLElement | undefined = $state();

	function serialize(): string {
		try {
			return doc.toMarkdown();
		} catch (e) {
			// `toMarkdown` round-trips any valid document, but a boundary error must not
			// crash the drawer; show it in place instead.
			const message = e instanceof Error ? e.message : String(e);
			onError?.(message);
			return `# source view unavailable\n\n${message}`;
		}
	}

	let text = $state(serialize());

	export async function refresh(): Promise<void> {
		const next = serialize();
		if (next === text) return; // no re-render when the serialize is unchanged
		// The host is the scroller, so a shorter document clamps its offset; hold it
		// across the swap and the drawer stays where the reader left it, which matters
		// because `refresh` runs on every recompile tick.
		const top = hostEl?.scrollTop ?? 0;
		text = next;
		await tick();
		if (hostEl) hostEl.scrollTop = top;
	}
</script>

<pre bind:this={hostEl} class="source-mirror">{text}</pre>

<style>
	/* A long line folds rather than scrolling the drawer sideways, so the reader still
	   sees where the canonical serialize put its breaks. */
	.source-mirror {
		width: 100%;
		height: 100%;
		overflow: auto;
		margin: 0;
		padding: var(--qmh-space-2);
		background: var(--qmh-surface);
		color: var(--qmh-ink);
		font-family: var(--qmh-font-mono);
		font-size: var(--qmh-text-label);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
