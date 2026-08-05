<!--
  The errors, read. A band under the panes rather than a panel over them: it is
  consulted, not watched, and a surface that appears and disappears would reflow the
  thing being judged every time a keystroke fixed a field.

  Each row carries its ORIGIN and its address. The address is the point: the editor
  routes a diagnostic to a control by `path`, so a row with none reached no field, and
  the summary counts those. A diagnostic detached from the field that provoked it is a
  quill's problem, invisible everywhere else.

  `<details>` rather than a button and a flag: the disclosure is the platform's, and
  the summary stays a row of counts either way.
-->
<script lang="ts">
	import type { NoteSet } from './notes';

	interface Props {
		notes: NoteSet;
	}

	let { notes }: Props = $props();

	const errors = $derived(notes.all.filter((n) => n.severity === 'error').length);
	const warnings = $derived(notes.all.length - errors);
</script>

<details class="notes" open data-testid="notes">
	<summary class="summary">
		{#if notes.all.length === 0}
			<span class="st-label">no notes</span>
		{:else}
			<span class="count" class:alert={errors > 0} data-testid="note-count">
				{errors} error{errors === 1 ? '' : 's'} · {warnings} warning{warnings === 1 ? '' : 's'}
			</span>
			{#if notes.unrouted > 0}
				<!-- The gap, counted: these reach no control in the editor. -->
				<span class="st-label" data-testid="note-unrouted">{notes.unrouted} unrouted</span>
			{/if}
		{/if}
	</summary>

	{#if notes.all.length > 0}
		<ul class="list">
			{#each notes.all as note}
				<li class="note" class:alert={note.severity === 'error'}>
					<span class="st-label origin">{note.origin}</span>
					<span class="st-readout where" class:unrouted={note.path === undefined}>
						{note.path ?? 'unrouted'}
					</span>
					<span class="message">
						{note.message}
						{#if note.code}<span class="st-label code">{note.code}</span>{/if}
						{#if note.hint}<span class="hint">{note.hint}</span>{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</details>

<style>
	.notes {
		border-top: var(--st-border-width) solid var(--st-border);
		background: var(--st-page);
	}

	.summary {
		display: flex;
		align-items: baseline;
		gap: var(--st-space-3);
		padding: var(--st-space) var(--st-space-4);
		cursor: pointer;
	}

	.count {
		font-family: var(--st-font-mono);
		font-size: var(--st-text-meta);
		letter-spacing: var(--st-track-label);
		text-transform: uppercase;
		color: var(--st-ink-meta);
	}

	.count.alert {
		color: var(--st-alert);
	}

	/* Bounded, because a quill with thirty must-fill fields would otherwise take the
	   panes. It is a list to scroll, not a page to read. */
	.list {
		margin: 0;
		padding: 0 var(--st-space-4) var(--st-space-2);
		list-style: none;
		max-height: var(--st-notes);
		overflow: auto;
	}

	/* Origin, address, message: three columns, so the addresses line up and a run of
	   notes is scanned down rather than read across. */
	.note {
		display: grid;
		grid-template-columns: 4.5rem minmax(6rem, 14rem) minmax(0, 1fr);
		gap: var(--st-space-2);
		align-items: baseline;
		padding-block: var(--st-space-half);
		border-top: var(--st-border-width) solid var(--st-border);
	}

	.origin {
		color: var(--st-ghost);
	}

	.where {
		color: var(--st-ink-meta);
	}

	/* An unrouted note has no address to print, so the word takes the address column
	   and says why the row is here at all. */
	.where.unrouted {
		color: var(--st-warn);
		font-style: italic;
	}

	.message {
		font-size: var(--st-text-label);
		line-height: var(--st-leading-tight);
		color: var(--st-ink);
		overflow-wrap: anywhere;
	}

	.note.alert .message {
		color: var(--st-alert);
	}

	.code {
		color: var(--st-ghost);
		margin-inline-start: var(--st-space);
	}

	/* The hint is the fix, so it reads as a second sentence rather than a second
	   column: an author reading a note wants both at once. */
	.hint {
		display: block;
		font-size: var(--st-text-meta);
		color: var(--st-ink-meta);
	}
</style>
