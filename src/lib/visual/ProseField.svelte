<!--
  One content prose leaf — a thin Svelte mount of the codec's `createField`
  (VISUAL_EDITOR §Surface). Mounts ONCE per stable leaf key and tears down on
  unmount; the leaf owns its PM state, history, and per-keystroke `applyChange`
  commit, so this wrapper adds no logic beyond wiring and registration. The
  `addr` is supplied by the parent as a LIVE object (its `card` a getter over the
  stable-id→index map), so a card reorder re-targets this leaf's commits without
  a remount — the caret rides the untouched PM view.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { createField, type FieldController } from '../core/codec/index.js';
	import type { Document, Addr } from '../core/index.js';

	interface Props {
		doc: Document;
		addr: Addr;
		inline?: boolean;
		plaintext?: boolean;
		/** Accessible name for the editable region (the visual label is a sibling span). */
		label?: string;
		/** Ghost shown on the empty leaf — the resolved `default:` (issue #58 §9). */
		placeholder?: string;
		/** Stable identity for the registry + a DOM stamp the e2e uses to prove no-remount. */
		leafKey: string;
		onFocus?: (addr: Addr) => void;
		onCaretMove?: (addr: Addr, pos: number) => void;
		register?: (key: string, controller: FieldController) => void;
		unregister?: (key: string) => void;
		testid?: string;
	}

	let {
		doc,
		addr,
		inline,
		plaintext,
		label,
		placeholder,
		leafKey,
		onFocus,
		onCaretMove,
		register,
		unregister,
		testid
	}: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();

	// An absent richtext field (a `default:`-only field like `tag_line`) is handled
	// by the codec itself — `createField` decodes an empty content and installs on
	// the first edit — so this wrapper adds no pre-seeding, and an untouched field
	// stays absent (its default rendering intact) until actually edited.
	onMount(() => {
		if (!containerEl) return;
		const controller = createField({
			doc,
			addr,
			container: containerEl,
			inline,
			plaintext,
			label,
			placeholder,
			onFocus,
			onCaretMove
		});
		register?.(leafKey, controller);
		return () => {
			unregister?.(leafKey);
			controller.destroy();
		};
	});
</script>

<div bind:this={containerEl} class="qm-prose" data-leaf-key={leafKey} data-testid={testid}></div>

<style>
	.qm-prose {
		border: 1px solid var(--_qm-border);
		border-radius: var(--_qm-radius-inner);
		padding: var(--_qm-space) var(--_qm-space-2);
		background: var(--_qm-surface);
		min-height: 1.6rem;
	}
	/* The caret is the prose leaf's focus indicator, not a ring — a ring around a
	   contenteditable reads as the form chrome AESTHETIC strips. So the outline is
	   dropped; the active leaf is cued by the wrapper border tint below (SURFACES §Focus). */
	.qm-prose :global(.ProseMirror) {
		outline: none;
	}
	/* Active-leaf cue: tint the hairline to the focus hue, shared with the scalar
	   ring and the preview active box — no added box (the editor↔preview address). */
	.qm-prose:focus-within {
		border-color: var(--_qm-accent);
	}
	/* Empty-leaf ghost (issue #58 §9): the resolved `default:` as dim/italic ghost,
	   matching the scalar ghost rung (AESTHETIC §"secondary text
	   recedes"). Rendered from a node decoration's data attr so it stays out of the
	   document; `float`/`height:0` keep it from displacing the caret. */
	.qm-prose :global(.ProseMirror .qm-prose-placeholder::before) {
		content: attr(data-placeholder);
		color: var(--_qm-ink-ghost);
		font-style: italic;
		float: left;
		height: 0;
		pointer-events: none;
	}
</style>
