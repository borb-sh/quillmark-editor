<!--
 One element of an array of `richtext` (fixture `keywords`) or `plaintext`
 (`errata`). Array elements are not `applyChange`-addressable: `Addr.field` is a
 flat name, so `keywords[0]` has no op address. So
 this is not a `createField` leaf: it mounts a minimal PM view over the codec's
 decode/encode + inline schema, and on every edit hands the re-encoded
 `Content` up to the parent {@link ArrayField}, which commits the whole array
 by value (`writer.set(field, arrayWithElementReplaced)`). Anchors within an
 element are dropped on that value write: acceptable for inline refs. Mounts
 once per stable element id (no reset on the parent's re-derive).

 The content is read, not passed: `reader.getContentAt(addr, [k])` decodes an
 element through the codec its `items` type declares, so what the element rests
 as — the content object, a `plaintext` literal, the authored string a transport
 door left — stops being this row's business. Read once, at mount, since that is
 when this leaf takes its state.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorState } from 'prosemirror-state';
	import { EditorView } from 'prosemirror-view';
	import {
		decode,
		pmToContent,
		inlineSchema,
		plaintextSchema,
		proseLeafPlugins
	} from '../core/codec/index.js';
	import './controls.css';
	import type { Content } from '@quillmark/wasm';

	interface Props {
		/** This element's content, read at mount (`ArrayField`, through the boundary's
		 * element read). A thunk rather than a value: the parent re-derives per
		 * revision and this leaf takes its state once, so a value prop would be a
		 * boundary read per row per render, all but one of them discarded. */
		content: () => Content;
		/** The mark-free schema (a `plaintext` item): literal text, no formatting,
		 * exactly as the scalar field of that type mounts. */
		plaintext?: boolean;
		/** Accessible name for the editable region (the array has no per-element label). */
		label?: string;
		onChange: (rt: Content) => void;
		/** Raw keydown, for a container whose own keys run through this element: the
		 * array repeater's Enter/Backspace (`ArrayField`). Fires before the view's own
		 * keymap, so the state it reads is the one this keystroke has yet to change. */
		onKey?: (e: KeyboardEvent) => void;
	}
	let { content, plaintext = false, label, onChange, onKey }: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();
	let view: EditorView | undefined;
	/** Take the caret: what a parent placing focus on this element calls. The view's
	 * focus, not the element's: a PM view restores its selection, where a bare DOM
	 * focus on a contenteditable leaves the caret unplaced. */
	export function focus(): void {
		view?.focus();
	}

	onMount(() => {
		if (!containerEl) return;
		// An array element is an inline, value-by-value leaf: the same keymap and
		// plugin stack a `createField` leaf mounts (shared `proseLeafPlugins`), minus
		// the anchor-position plugin (element anchors are dropped on the array's value
		// write, per the header). Its own `dispatchTransaction` hands `Content` up.
		//
		// The schema is the declared type's, as `createField` picks it: `plaintext`
		// declares no mark types, so there is nothing to toggle, to paste in, or to
		// mint a shorthand with.
		const schema = plaintext ? plaintextSchema : inlineSchema;
		const pmDoc = decode(content(), schema);
		const state = EditorState.create({
			doc: pmDoc,
			plugins: proseLeafPlugins(schema, { inline: true })
		});
		const mounted = new EditorView(containerEl, {
			state,
			// Names the `contenteditable` for assistive tech (the array row has no
			// label element to associate).
			attributes: label ? { 'aria-label': label } : undefined,
			dispatchTransaction(tr) {
				const next = mounted.state.apply(tr);
				mounted.updateState(next);
				if (tr.docChanged) onChange(pmToContent(next.doc));
			},
			handleDOMEvents: {
				keydown: (_v, e) => {
					onKey?.(e);
					return false;
				}
			}
		});
		view = mounted;
		return () => {
			view = undefined;
			mounted.destroy();
		};
	});
</script>

<!-- `.qm-control-box` (controls.css) is the whole box, so an array of `richtext` and
 an array of `string` render rows of equal height. No floor: the reset in
 `core/codec/prose.css` makes one line of prose measure one line. Width is the
 row's to give: the element fills the track it is placed in (`ArrayField`). -->
<div bind:this={containerEl} class="qm-array-prose qm-control-box qm-focus-ring-within"></div>

<style>
	/* Caret-primary, matching ProseField: the contenteditable's own outline is
	   dropped and the ring rides the wrapper (`qm-focus-ring-within`,
	   controls.css), which is where the box is. */
	.qm-array-prose :global(.ProseMirror) {
		outline: none;
	}
</style>
