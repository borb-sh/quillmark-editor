<!--
  `@quillmark/ui/source`'s Svelte wrapper: mounts `createSourceView` over a
  container div on mount, tears it down on unmount. No logic beyond wiring;
  view.ts owns the text mirror and the `toMarkdown()` serialize. Exposes
  `refresh()` (re-serialize after an edit lands) as an instance method
  (`bind:this`); pure passthrough.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { createSourceView, type SourceViewController } from './view.js';
	import { createReport } from '../core/index.js';
	import type { Document, ErrorSink } from '../core/index.js';

	/**
	 * REMOUNT CONTRACT. `createSourceView` binds once in `onMount`; a later change
	 * to `doc` is NOT observed. Swap the document by REMOUNTING (`{#key doc}`);
	 * reflect in-place edits through the `refresh()` method.
	 */
	interface Props {
		doc: Document;
		/** Appended to the root's own class (see `Preview`). */
		class?: string;
		/** Merged onto the root; free because theming lands on `data-qm-root`. */
		style?: string;
		/** Every failure this surface recovers from; unset falls to `console.error`. */
		onError?: ErrorSink;
	}
	let { doc, onError, class: className, style }: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let controller: SourceViewController | undefined;

	onMount(() => {
		if (!containerEl) return;
		controller = createSourceView({
			container: containerEl,
			doc,
			// A getter, as `Preview` does: the view holds its options for its lifetime.
			get onError() {
				return onError;
			}
		});
		return () => {
			controller?.destroy();
			controller = undefined;
		};
	});

	// THE REMOUNT GUARD (the contract above), at `dev` severity, once per mount: a
	// document swapped in place leaves the mirror serializing the previous one.
	const report = createReport(() => onError);
	// svelte-ignore state_referenced_locally
	const mountedDoc = doc;
	let rebindReported = false;
	$effect(() => {
		if (rebindReported || doc === mountedDoc) return;
		rebindReported = true;
		report(
			'surface.rebind',
			'doc swapped in place; the mirror still serializes the previous document. Remount ({#key doc}) to swap.',
			{ severity: 'dev' }
		);
	});

	export function refresh(): void {
		controller?.refresh();
	}
</script>

<div bind:this={containerEl} class="qm-source {className ?? ''}" {style} data-qm-root></div>

<style>
	/* A DETACHED root, marked `data-qm-root` (core/theme.css). The container is
	   the scroller; view.ts holds its offset across a refresh. */
	.qm-source {
		width: 100%;
		height: 100%;
		overflow: auto;
		background: var(--_qm-surface-raised);
		font-size: var(--_qm-text-label);
	}
	/* The mirror is text, so the chrome is the monospace face and wrapping: a long
	   line folds rather than scrolling the drawer sideways, and the reader still
	   sees where the canonical serialize put its breaks. `:global` because view.ts
	   creates the element, so Svelte's scoping hash never lands on it. */
	.qm-source :global(.qm-source-text) {
		margin: 0;
		padding: var(--_qm-space-2);
		color: var(--_qm-ink);
		font-family: var(--_qm-font-mono);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
