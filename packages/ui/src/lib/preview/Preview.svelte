<!--
  `@quillmark/ui/preview`'s Svelte wrapper: mounts `createPreview` over a
  container div on mount and tears it down on unmount. No logic beyond wiring;
  paint.ts/overlay.ts/bridge.ts/controller.ts own the behavior. Exposes the
  `PreviewController` verbs as instance methods (`bind:this`) for a consumer
  that drives `refresh`/`scrollToField`/`focusPosition`/`setZoom` imperatively
  (e.g. after `session.apply` elsewhere); pure passthrough, no added logic.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { createPreview, type PreviewController } from './controller.js';
	import { createReport } from '../core/index.js';
	import type { LiveSession, ContentHit, ChangeSet, ErrorSink } from '../core/index.js';

	/**
	 * REMOUNT CONTRACT. `createPreview` binds once in `onMount`; a later change to
	 * `session` (or `margin`/`overlays`/`onCaretPick`) is NOT observed. Swap the
	 * session by REMOUNTING (`{#key session}`, as the playground does); drive
	 * in-place edits through the `refresh(change)` method, not a prop change.
	 */
	interface Props {
		session: LiveSession;
		/** Appended to the root's own class: the surface is a mounted element the
		 *  consumer positions, so it needs a handle for layout it owns. */
		class?: string;
		/** Merged onto the root. Free: theming lands on `data-qm-root` (core/theme.css),
		 *  not this attribute. */
		style?: string;
		margin?: number;
		overlays?: boolean;
		onCaretPick?: (hit: ContentHit) => void;
		/** Every failure this surface recovers from; unset falls to `console.error`. */
		onError?: ErrorSink;
	}

	let {
		session,
		margin,
		overlays,
		onCaretPick,
		onError,
		class: className,
		style
	}: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let controller: PreviewController | undefined;

	onMount(() => {
		if (!containerEl) return;
		controller = createPreview(session, {
			container: containerEl,
			margin,
			overlays,
			onCaretPick,
			// A getter: the controller holds its options for its lifetime, so a sink
			// closing over live consumer state reports against the current one rather
			// than the one it closed over at mount.
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
	// session swapped in place leaves the paint loop, the overlay and the click
	// bridge all reading the previous session's geometry.
	const report = createReport(() => onError);
	// svelte-ignore state_referenced_locally
	const mountedSession = session;
	let rebindReported = false;
	$effect(() => {
		if (rebindReported || session === mountedSession) return;
		rebindReported = true;
		report(
			'surface.rebind',
			'session swapped in place; the preview still paints the previous session. Remount ({#key session}) to swap.',
			{ severity: 'dev' }
		);
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

<div bind:this={containerEl} class="qm-preview {className ?? ''}" {style} data-qm-root></div>

<style>
	/* A DETACHED root: the preview is not a descendant of the editor, so it carries
	   `data-qm-root` for the page/overlay rungs paint.ts and overlay.ts read
	   (core/theme.css). */
	.qm-preview {
		position: relative;
		width: 100%;
		height: 100%;
		overflow-y: auto;
	}
</style>
