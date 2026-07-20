<!--
  One element of an array-of-`richtext` field (fixture `references`). Array
  elements are NOT `applyChange`-addressable — `Addr.field` is a flat name, so
  `references.0` has no op address (BOUNDARY_NOTES §applyChange addressing). So
  this is NOT a `createField` leaf: it mounts a minimal PM view over the codec's
  decode/encode + inline schema, and on every edit hands the re-encoded
  `Content` UP to the parent {@link ArrayField}, which commits the WHOLE array
  by value (`writer.set(field, arrayWithElementReplaced)`). Anchors within an
  element are dropped on that value write — acceptable for inline refs. Mounts
  ONCE per stable element id (no reset on the parent's re-derive).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { baseKeymap, toggleMark } from 'prosemirror-commands';
	import { history, redo, undo } from 'prosemirror-history';
	import { keymap } from 'prosemirror-keymap';
	import { EditorState, type Command } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import { decode, pmToContent, inlineSchema, inputRulesPlugin } from '../core/codec/index.js';
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
		const schema = inlineSchema;
		const pmDoc = decode(value, schema, { plaintext: !!plaintext });
		const km: Record<string, Command> = {
			'Mod-z': undo,
			'Mod-y': redo,
			'Shift-Mod-z': redo,
			// One textblock only — swallow Enter so no split is attempted.
			Enter: () => true
		};
		if (!plaintext) {
			if (schema.marks.strong) km['Mod-b'] = toggleMark(schema.marks.strong);
			if (schema.marks.em) km['Mod-i'] = toggleMark(schema.marks.em);
			if (schema.marks.underline) km['Mod-u'] = toggleMark(schema.marks.underline);
		}
		const state = EditorState.create({
			doc: pmDoc,
			plugins: [
				history(),
				...(plaintext ? [] : [inputRulesPlugin(schema)]),
				keymap(km),
				keymap(baseKeymap)
			]
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

<div bind:this={containerEl} class="qm-prose qm-array-prose" data-testid={testid}></div>

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
