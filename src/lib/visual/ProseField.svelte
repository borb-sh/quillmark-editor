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
	import './controls.css';
	import type { Document, Addr } from '../core/index.js';

	interface Props {
		doc: Document;
		addr: Addr;
		inline?: boolean;
		plaintext?: boolean;
		/**
		 * Draw no box — the card body's leaf, and nothing else. A property
		 * of the SLOT rather than of the leaf: `block` is not the same predicate, since
		 * a `richtext` field without `inline` is block prose and still a control in a
		 * row of controls. Only the body is paper, and only its caller knows it is.
		 */
		unframed?: boolean;
		/** Accessible name for the editable region (the visual label is a sibling span). */
		label?: string;
		/** Ghost shown on the empty leaf — the resolved `default:`. */
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
		unframed,
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

	// Block prose vs a control in a row of controls — the SAME predicate the codec
	// picks its schema by (`createField`: `plaintext` implies `inline`), so the box a
	// leaf draws and the schema it holds cannot disagree. Keyed on `inline` alone, a
	// `plaintext`-only field would take the body's floor while holding one paragraph.
	const block = $derived(!(inline || plaintext));

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

<div
	bind:this={containerEl}
	class="qm-prose"
	class:qm-control-box={!unframed}
	class:qm-prose-block={block}
	data-leaf-key={leafKey}
	data-testid={testid}
></div>

<style>
	/* The box is `.qm-control-box` (controls.css) — the same rule the input beside it
	   draws, so the two agree on height by construction rather than by two floors
	   tuned to match. Nothing here restates it, and there is no
	   `min-height`: `core/codec/prose.css` resets the paragraph box, so one line of
	   prose in this box measures one line of text in that one. */
	.qm-prose {
		/* Positioned for the arrival wash `setCaret` inserts (`core/bloom.ts`) — an
		   inset child, so it covers the text without fading it or tinting the leaf's
		   own surface. */
		position: relative;
	}
	/* A leaf the inline schema does NOT constrain — the body — is paper rather than a
	   cell in a row of controls, so it opens at a few lines and grows. The floor is six
	   LINE BOXES, not a length: size times leading is what one line measures, so both
	   factors are named or the expression stops meaning the six lines it claims. It
	   moves with the type ramp and with nothing else. */
	.qm-prose-block {
		min-height: calc(var(--_qm-text-body) * var(--_qm-leading-body) * 6);
	}
	/* The caret is the prose leaf's focus indicator, not a ring — a ring around a
	   contenteditable reads as the form chrome AESTHETIC strips. So the outline is
	   dropped; a boxed leaf tints its wrapper border below (SURFACES §Focus). */
	.qm-prose :global(.ProseMirror) {
		outline: none;
	}
	/* Active-leaf cue: tint the hairline to the focus hue, shared with the scalar
	   ring and the preview active box — no added box (the editor↔preview address).
	   Scoped to the leaves that HAVE a hairline: the body has none, and the caret is
	   the whole indicator there — one surface per card, and the largest in it, so
	   "which leaf am I in" is not a question it raises. A rule drawn to answer it
	   would be a stroke bought back to replace the one unframing removed. */
	.qm-prose.qm-control-box:focus-within {
		border-color: var(--_qm-accent);
	}
	/* Empty-leaf ghost: the resolved `default:` as dim/italic ghost,
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
