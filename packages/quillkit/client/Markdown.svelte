<!--
  The document's two doors, which are one panel: canonical Quillmark markdown out, the
  same markdown in (STUDIO §"The document has a door").

  Nothing here parses, conforms or reports. `apply` hands the text to the caller, which
  lands it through the repack's own carry.
-->
<script lang="ts">
	interface Props {
		/** The document as it stands: its canonical markdown, or the text a failed open
		 *  left held. */
		text: string;
		/** The document's ref, which names the download. */
		ref: string;
		/** Land this text as the document, resolving to what refused it. What landed and
		 *  what it stranded are the caller's to report; what never became a document is
		 *  said here, beside the text that caused it. */
		onApply: (text: string) => Promise<string | undefined>;
	}

	let { text, ref, onApply }: Props = $props();

	/** What the panel opened with, edited or replaced; studio's document is untouched
	 *  until `apply`, so closing the panel discards this and nothing else. Seeded once per
	 *  mount, and the panel is mounted only while open, so every opening reads the
	 *  document as it then stands. */
	// svelte-ignore state_referenced_locally
	let draft = $state(text);

	/** What refused the draft, at either door: a file that would not decode, or markdown
	 *  that would not parse. Both leave the document on screen standing. */
	let refused = $state.raw<string | undefined>();

	const dirty = $derived(draft !== text);

	/** The document as bytes, named by its ref. Revoked on the same turn: the click has
	 *  already been dispatched by the time the object URL is no longer reachable. */
	function download(): void {
		const url = URL.createObjectURL(new Blob([draft], { type: 'text/markdown' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `${ref}.md`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function readFile(input: HTMLInputElement): Promise<void> {
		const file = input.files?.[0];
		// The input keeps its value, so re-picking the same file after an edit re-reads it.
		input.value = '';
		if (!file) return;
		try {
			draft = await file.text();
			refused = undefined;
		} catch (err) {
			refused = err instanceof Error ? err.message : String(err);
		}
	}
</script>

<div class="doors">
	<!-- Editable, since replacing the text is how a document comes in. Not a second
	     editor: what is typed reaches the document only through `apply`, all at once. -->
	<textarea
		class="qm-readout source"
		data-testid="markdown-source"
		spellcheck="false"
		rows="16"
		aria-label="Document markdown"
		bind:value={draft}
	></textarea>

	{#if refused}
		<p class="qm-status qm-status-error" data-testid="markdown-refused">{refused}</p>
	{/if}

	<div class="row">
		<button class="qm-control" type="button" data-testid="markdown-download" onclick={download}
			>Download</button
		>
		<!-- The input is the control; the label is what it looks like, since a file input
		     draws a button this page does not draw. -->
		<label class="qm-control file">
			Open file…
			<input
				type="file"
				accept=".md,text/markdown,text/plain"
				data-testid="markdown-open"
				onchange={(e) => readFile(e.currentTarget)}
			/>
		</label>
		<!-- Inert until the text differs from the document: applying what is already
		     mounted would reseed a session to land the document it is holding. -->
		<button
			class="qm-control"
			type="button"
			data-testid="markdown-apply"
			disabled={!dirty}
			onclick={async () => (refused = await onApply(draft))}>Apply</button
		>
	</div>
</div>

<style>
	.doors {
		display: flex;
		flex-direction: column;
		gap: var(--qmh-space-3);
		min-height: 0;
	}

	/* The block readout, made typable: `pre.qm-readout`'s plate on a control carrying its
	   own scroll. Its height is its rows, which is the one place a document's length is
	   stated in lines rather than in a rung; it takes what the panel has left when the
	   room is shorter than that. */
	.source {
		box-sizing: border-box;
		flex: 1 1 auto;
		min-height: 0;
		width: 100%;
		max-height: 100%;
		resize: none;
		background: var(--qmh-page);
		border: var(--qmh-border-width) solid var(--qmh-border);
		border-radius: var(--qmh-radius-inner);
		padding: var(--qmh-space-2);
		white-space: pre;
		overflow: auto;
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--qmh-space-2);
	}

	/* A file input draws a control of its own, which is the one control here the page did
	   not draw. The label is the button and the input covers it, transparent: the platform
	   keeps the keyboard and the picker, and the page keeps the look. */
	.file {
		position: relative;
		display: inline-flex;
		align-items: center;
	}

	.file input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
</style>
