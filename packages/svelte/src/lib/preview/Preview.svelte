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
	import { guardRebind } from '../core/rebind.svelte.js';
	import type { PreviewStringsInput } from './strings.js';
	import type { LiveSession, ContentHit, ChangeSet } from '@quillmark/wasm';
	import type { DocPath, Place } from '../core/address.js';
	import type { EditorErrorHandler } from '../core/errors.js';

	/**
	 * REMOUNT CONTRACT. `createPreview` binds once in `onMount`; a later change to any
	 * prop it closed over (`session`, `margin`, `overlays`, `onCaretPick`, `onError`,
	 * `strings`) is NOT observed, and each reports `rebind-ignored` when swapped. Swap
	 * the session by REMOUNTING (`{#key session}`, as the playground does); drive
	 * in-place edits through the `refresh(change)` method, not a prop change.
	 *
	 * `onError` is itself once-bound, so a swapped handler means the report of its own
	 * swap reaches the handler it replaced. `class` and `style` are the exceptions:
	 * they land on the root element Svelte owns, so they stay live.
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
		/** The message-state wording, keyed and partial (`PreviewStrings`). */
		strings?: PreviewStringsInput;
	}

	let {
		session,
		margin,
		overlays,
		onCaretPick,
		onError,
		strings,
		class: className,
		style
	}: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let controller: PreviewController | undefined;

	guardRebind(
		() => ({ session, margin, overlays, onCaretPick, onError, strings }),
		'Remount the preview ({#key session}) to rebind.'
	);

	onMount(() => {
		if (!containerEl) return;
		controller = createPreview(session, {
			container: containerEl,
			margin,
			overlays,
			onCaretPick,
			onError,
			strings
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
