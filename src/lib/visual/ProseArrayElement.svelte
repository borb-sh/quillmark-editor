<!--
  One element of an array-of-`richtext` field (fixture `references`). Array
  elements are NOT `applyChange`-addressable — `Addr.field` is a flat name, so
  `references.0` has no op address. So
  this is NOT a `createField` leaf: it mounts a minimal PM view over the codec's
  decode/encode + inline schema, and on every edit hands the re-encoded
  `Content` UP to the parent {@link ArrayField}, which commits the WHOLE array
  by value (`writer.set(field, arrayWithElementReplaced)`). Anchors within an
  element are dropped on that value write — acceptable for inline refs. Mounts
  ONCE per stable element id (no reset on the parent's re-derive).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorState } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import { decode, pmToContent, inlineSchema, proseLeafPlugins } from '../core/codec/index.js';
	import type { Content } from '../core/index.js';

	interface Props {
		value: Content;
		plaintext?: boolean;
		/** Accessible name for the editable region (the array has no per-element label). */
		label?: string;
		onChange: (rt: Content) => void;
		onFocusEl?: () => void;
		testid?: string;
	}
	let { value, plaintext, label, onChange, onFocusEl, testid }: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();

	onMount(() => {
		if (!containerEl) return;
		// An array element is an inline, value-by-value leaf — the SAME keymap and
		// plugin stack a `createField` leaf mounts (shared `proseLeafPlugins`), minus
		// the anchor-position plugin (element anchors are dropped on the array's value
		// write, per the header). Its own `dispatchTransaction` hands `Content` up.
		const pmDoc = decode(value, inlineSchema, { plaintext: !!plaintext });
		const state = EditorState.create({
			doc: pmDoc,
			plugins: proseLeafPlugins(inlineSchema, { inline: true, plaintext: !!plaintext })
		});
		const view = new EditorView(containerEl, {
			state,
			// Names the `contenteditable` for assistive tech (the array row has no
			// label element to associate).
			attributes: label ? { 'aria-label': label } : undefined,
			dispatchTransaction(tr) {
				const next = view.state.apply(tr);
				view.updateState(next);
				if (tr.docChanged) onChange(pmToContent(next.doc));
			},
			handleDOMEvents: {
				focus: () => {
					onFocusEl?.();
					return false;
				}
			}
		});
		return () => view.destroy();
	});
</script>

<div bind:this={containerEl} class="qm-array-prose" data-testid={testid}></div>

<style>
	.qm-array-prose {
		flex: 1;
		border: 1px solid var(--qm-border, #d4d4d4);
		border-radius: 4px;
		padding: 0.3rem 0.45rem;
		background: var(--qm-field-bg, #fff);
		min-height: 1.5rem;
	}
	.qm-array-prose :global(.ProseMirror) {
		outline: none;
		white-space: pre-wrap;
		word-wrap: break-word;
	}
</style>
