<!--
  `@quillmark/editor/source`'s Svelte wrapper — mounts `createSourceView` over a
  container div on mount, tears it down on unmount. No logic beyond wiring;
  view.ts owns the CodeMirror surface and the `toMarkdown()` serialize. Exposes
  `refresh()` (re-serialize after an edit lands) as an instance method
  (`bind:this`) — pure passthrough.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { createSourceView, type SourceViewController } from './view.js';
	import type { Document } from '../core/index.js';

	/**
	 * REMOUNT CONTRACT. `createSourceView` binds once in `onMount`; a later change
	 * to `doc` is NOT observed. Swap the document by REMOUNTING (`{#key doc}`);
	 * reflect in-place edits through the `refresh()` method.
	 */
	interface Props {
		doc: Document;
	}
	let { doc }: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let controller: SourceViewController | undefined;

	onMount(() => {
		if (!containerEl) return;
		controller = createSourceView({ container: containerEl, doc });
		return () => {
			controller?.destroy();
			controller = undefined;
		};
	});

	export function refresh(): void {
		controller?.refresh();
	}
</script>

<div bind:this={containerEl} class="qm-source"></div>

<style>
	.qm-source {
		width: 100%;
		height: 100%;
		overflow: auto;
		font-size: 0.8rem;
	}
	/* CodeMirror paints its own chrome; a neutral, overridable baseline only. */
	.qm-source :global(.cm-editor) {
		height: 100%;
		background: var(--qm-source-bg, #fbfbfb);
	}
	.qm-source :global(.cm-gutters) {
		background: var(--qm-source-gutter-bg, #f3f3f3);
		border-right: 1px solid var(--qm-border, #e2e2e2);
		color: var(--qm-source-gutter-text, #9a9a9a);
	}
	.qm-source :global(.cm-editor.cm-focused) {
		outline: none;
	}
</style>
