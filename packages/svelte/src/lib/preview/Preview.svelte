<!--
  `@quillmark/svelte/preview`'s Svelte wrapper: mounts `createPreview` over a
  container div on mount and tears it down on unmount. No logic beyond wiring;
  paint.ts/overlay.ts/bridge.ts/controller.ts own the behavior. Exposes the
  `PreviewController` verbs as instance methods (`bind:this`) for a consumer
  that drives `refresh`/`scrollToField`/`focusPosition`/`setZoom` imperatively
  (e.g. after `session.apply` elsewhere); pure passthrough, no added logic.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { createPreview, type PreviewController } from './controller.js';
	import { reportError } from '../core/index.js';
	import type {
		LiveSession,
		ContentHit,
		ChangeSet,
		DocPath,
		Place,
		EditorErrorHandler
	} from '../core/index.js';

	/**
	 * REMOUNT CONTRACT. `createPreview` binds once in `onMount`; a later change to
	 * `session` (or `margin`/`overlays`/`onCaretPick`/`onError`) is NOT observed. Swap the
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
		/** A page paint the backend refused; the error message state shows either way. */
		onError?: EditorErrorHandler;
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

	// The contract above, said out loud. The editor re-keys on its own `doc`; this
	// surface cannot, because the paint loop owns scroll position, mounted page
	// slots and an observer set that a remount would discard on every apply — so the
	// swap stays the consumer's `{#key session}` and what the surface owes is to
	// stop being silent about the one it was handed instead.
	// svelte-ignore state_referenced_locally
	const mounted = session;
	let reported = false;
	$effect(() => {
		if (reported || session === mounted) return;
		reported = true;
		reportError(onError, {
			code: 'rebind-ignored',
			severity: 'dev',
			message:
				'session swapped in place; the paint loop still holds the session it mounted with. Remount the preview ({#key session}) to swap.'
		});
	});

	onMount(() => {
		if (!containerEl) return;
		controller = createPreview(session, {
			container: containerEl,
			margin,
			overlays,
			onCaretPick,
			onError
		});
		return () => {
			controller?.destroy();
			controller = undefined;
		};
	});

	export function refresh(change: ChangeSet): void {
		controller?.refresh(change);
	}
	export function scrollToField(field: DocPath): void {
		controller?.scrollToField(field);
	}
	/** Takes the editor's `onCaretMove` payload: `onCaretMove={preview.focusPosition}`. */
	export function focusPosition(at: Place): void {
		controller?.focusPosition(at);
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
