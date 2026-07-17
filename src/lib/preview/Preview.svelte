<!--
  `@quillmark/editor/preview`'s Svelte wrapper — mounts `createPreview` over a
  container div on mount and tears it down on unmount. No logic beyond wiring;
  paint.ts/overlay.ts/bridge.ts/controller.ts own the behavior. Exposes the
  `PreviewController` verbs as instance methods (`bind:this`) for a consumer
  that drives `refresh`/`scrollToField`/`focusPosition`/`setZoom` imperatively
  (e.g. after `session.apply` elsewhere) — pure passthrough, no added logic.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { createPreview, type PreviewController } from './controller.js';
	import type { LiveSession, CorpusHit, ChangeSet } from '../core/index.js';

	/**
	 * REMOUNT CONTRACT. `createPreview` binds to `session` once in `onMount`; a
	 * later change to `session` (or `margin`/`overlays`/`onCaretPick`) is NOT
	 * observed — this wrapper installs no `$effect` to tear down and recreate on
	 * prop-identity change. To point the preview at a different session, REMOUNT
	 * the component (`{#key session}` or an `{#if}` gate, as the playground does).
	 * In-place document edits are driven imperatively through `refresh(change)`
	 * after a `session.apply` elsewhere — not through a prop change.
	 */
	interface Props {
		session: LiveSession;
		margin?: number;
		overlays?: boolean;
		onCaretPick?: (hit: CorpusHit) => void;
	}

	let { session, margin, overlays, onCaretPick }: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let controller: PreviewController | undefined;

	onMount(() => {
		if (!containerEl) return;
		controller = createPreview(session, { container: containerEl, margin, overlays, onCaretPick });
		return () => {
			controller?.destroy();
			controller = undefined;
		};
	});

	export function refresh(change: ChangeSet): void {
		controller?.refresh(change);
	}
	export function scrollToField(field: string): void {
		controller?.scrollToField(field);
	}
	export function focusPosition(field: string, pos: number): void {
		controller?.focusPosition(field, pos);
	}
	export function setZoom(scale: number): void {
		controller?.setZoom(scale);
	}
</script>

<div bind:this={containerEl} class="qm-preview"></div>

<style>
	.qm-preview {
		position: relative;
		width: 100%;
		height: 100%;
		overflow-y: auto;
	}
</style>
