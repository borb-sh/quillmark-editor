<!--
  `@quillmark/editor/preview`'s Svelte wrapper: mounts `createPreview` over a
  container div on mount and tears it down on unmount. No logic beyond wiring;
  paint.ts/overlay.ts/bridge.ts/controller.ts own the behavior. Exposes the
  `PreviewController` verbs as instance methods (`bind:this`) for a consumer
  that drives `refresh`/`scrollToField`/`focusPosition`/`setZoom` imperatively
  (e.g. after `session.apply` elsewhere); pure passthrough, no added logic.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		createPreview,
		DEFAULT_PREVIEW_STRINGS,
		type PreviewController,
		type CaretTarget,
		type PreviewState,
		type PreviewStrings
	} from './controller.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { rebindGuard } from '../core/rebind.js';
	import { checkDials } from '../core/dials.js';
	import type { LiveSession, ContentHit, ChangeSet } from '../core/index.js';
	import type { EditorErrorHandler } from '../core/errors.js';

	/**
	 * REMOUNT CONTRACT. `createPreview` binds once in `onMount`; a later change to
	 * `session` (or `margin`/`overlays`/`onCaretPick`) is NOT observed. Swap the
	 * session by REMOUNTING (`{#key session}`, as the playground does); drive
	 * in-place edits through the `refresh(change)` method, not a prop change.
	 */
	interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'class' | 'style'> {
		session: LiveSession;
		/** Appended to the root's own class: the surface is a mounted element the
		 *  consumer positions, so it needs a handle for layout it owns. */
		class?: string;
		/** Merged onto the root. Free: theming lands on `data-qm-root` (core/theme.css),
		 *  not this attribute. */
		style?: string;
		margin?: number;
		overlays?: boolean;
		/** The initial density multiplier; `setZoom` moves it after mount. */
		zoom?: number;
		onCaretPick?: (hit: ContentHit) => void;
		/** Paint failures and the remount contract; absent → the console. */
		onError?: EditorErrorHandler;
		/** The message states' wording; unset keys take the package's English. */
		strings?: Partial<PreviewStrings>;
		/**
		 * What to draw INSTEAD of the built-in message, when the preview is in one of
		 * its three non-painting states. Told which state and the text it would have
		 * drawn, so a consumer restyling only the empty case still has the other two
		 * words: `{#if state === 'empty'}<Illustration />{:else}<p>{text}</p>{/if}`.
		 *
		 * One snippet for three states rather than three props: the states are
		 * mutually exclusive and share a slot, and the core reports which one it is in
		 * (`onState`) precisely so this layer can render it.
		 */
		message?: Snippet<[{ state: PreviewState; text: string }]>;
	}

	let {
		session,
		margin,
		overlays,
		zoom,
		onCaretPick,
		onError,
		strings,
		message,
		class: className,
		style,
		...rest
	}: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	// The state the core reports, for the `message` snippet; `null` while painting.
	let messageState: PreviewState | null = $state(null);
	const words = $derived({ ...DEFAULT_PREVIEW_STRINGS, ...strings });
	let controller: PreviewController | undefined;

	// The remount contract, made loud in dev (`core/rebind.ts`): swapping `session`
	// in place leaves this painting the old one, silently.
	// svelte-ignore state_referenced_locally
	const guardSession = rebindGuard('Preview', 'session', session, () => onError);
	$effect(() => guardSession(session));

	onMount(() => {
		// Dev-only: a length dial with no unit renders as the default and says nothing.
		checkDials(containerEl, 'Preview', () => onError);
		if (!containerEl) return;
		controller = createPreview({
			session,
			container: containerEl,
			margin,
			overlays,
			zoom,
			onCaretPick,
			onError,
			strings,
			// The core draws the message only when nothing better will: a snippet here
			// means this layer owns the slot, and two texts in one box is the bug.
			messages: !message,
			onState: (next) => (messageState = next)
		});
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
	export function focusPosition(at: CaretTarget): void {
		controller?.focusPosition(at);
	}
	export function setZoom(scale: number): void {
		controller?.setZoom(scale);
	}
</script>

<!-- `rest` FIRST: an `id`, a `data-testid`, an `aria-*` the consumer needs on the
     mounted element, without letting it overwrite the class or the theming marker
     the surface depends on. -->
<div {...rest} bind:this={containerEl} class="qm-preview {className ?? ''}" {style} data-qm-root>
	{#if message && messageState}
		<div class="qm-preview-message qm-preview-{messageState}">
			{@render message({ state: messageState, text: words[messageState] })}
		</div>
	{/if}
</div>

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
