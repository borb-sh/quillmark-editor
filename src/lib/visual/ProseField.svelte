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
		border: 1px solid var(--qm-border, #d4d4d4);
		border-radius: 4px;
		padding: 0.35rem 0.5rem;
		background: var(--qm-field-bg, #fff);
		min-height: 1.6rem;
	}
	.qm-prose :global(.ProseMirror) {
		outline: none;
		white-space: pre-wrap;
		word-wrap: break-word;
	}
	.qm-prose :global(.ProseMirror:focus) {
		outline: none;
	}
</style>
