<!--
  The errors, read. A band under the panes rather than a panel over them: it is
  consulted, not watched, and a surface that appears and disappears would reflow the
  thing being judged every time a keystroke fixed a field.

  Each row carries its ORIGIN and its address. The address is the point, and it is
  written in one of two spaces: the document's, which the editor routes to a control,
  or the quill's source, which a compile failure names and this band only prints. A row
  with neither is UNROUTED, naming no place at all, and the summary counts those. A
  diagnostic detached from what provoked it is a quill's problem, invisible everywhere
  else.

  `<details>` rather than a button and a flag: the disclosure is the platform's, and
  the summary stays a row of counts either way.
-->
<script lang="ts">
	import { placeOf, type NoteSet } from './notes';

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
			<span class="qm-label">no notes</span>
		{:else}
			<span class="count" class:alert={errors > 0} data-testid="note-count">
				{errors} error{errors === 1 ? '' : 's'} · {warnings} warning{warnings === 1 ? '' : 's'}
			</span>
			{#if notes.unrouted > 0}
				<!-- The gap, counted: these name no place in either space. -->
				<span class="qm-label" data-testid="note-unrouted">{notes.unrouted} unrouted</span>
			{/if}
		{/if}
	</summary>

	{#if notes.all.length > 0}
		<ul class="list">
			{#each notes.all as note}
				<li class="note" class:alert={note.severity === 'error'}>
					<span class="qm-label origin">{note.origin}</span>
					<!-- The best address the note has: the document's field, else the line of
					     source that raised it, else the word for having neither. -->
					<span
						class="qm-readout where"
						class:source={note.path === undefined && note.location !== undefined}
						class:unrouted={note.path === undefined && note.location === undefined}
					>
						{note.path ?? (note.location ? placeOf(note.location) : 'unrouted')}
					</span>
					<span class="message">
						{note.message}
						{#if note.code}<span class="qm-label code">{note.code}</span>{/if}
						{#if note.hint}<span class="hint">{note.hint}</span>{/if}
					</span>
				</li>
			{/each}
		</ul>
	{/if}
</details>

<style>
	.notes {
		border-top: var(--qmh-border-width) solid var(--qmh-border);
		background: var(--qmh-page);
	}

	.summary {
		display: flex;
		align-items: baseline;
		gap: var(--qmh-space-3);
		padding: var(--qmh-space) var(--qmh-space-4);
		cursor: pointer;
	}

	.count {
		font-family: var(--qmh-font-mono);
		font-size: var(--qmh-text-meta);
		letter-spacing: var(--qmh-track-label);
		text-transform: uppercase;
		color: var(--qmh-ink-meta);
	}

	.count.alert {
		color: var(--qmh-alert);
	}

	/* Bounded, because a quill with thirty must-fill fields would otherwise take the
	   panes. It is a list to scroll, not a page to read. */
	.list {
		margin: 0;
		padding: 0 var(--qmh-space-4) var(--qmh-space-2);
		list-style: none;
		max-height: var(--st-notes);
		overflow: auto;
	}

	/* Origin, address, message: three columns, so the addresses line up and a run of
	   notes is scanned down rather than read across. */
	.note {
		display: grid;
		grid-template-columns: 4.5rem minmax(6rem, 14rem) minmax(0, 1fr);
		gap: var(--qmh-space-2);
		align-items: baseline;
		padding-block: var(--qmh-space-half);
		border-top: var(--qmh-border-width) solid var(--qmh-border);
	}

	.origin {
		color: var(--qmh-ghost);
	}

	.where {
		color: var(--qmh-ink-meta);
	}

	/* A source address is a place the author opens in their other editor, so it reads as
	   the coordinate it is rather than as a field name. */
	.where.source {
		color: var(--qmh-ink);
	}

	/* An unrouted note has no address to print, so the word takes the address column
	   and says why the row is here at all. */
	.where.unrouted {
		color: var(--qmh-warn);
		font-style: italic;
	}

	.message {
		font-size: var(--qmh-text-label);
		line-height: var(--qmh-leading-tight);
		color: var(--qmh-ink);
		overflow-wrap: anywhere;
	}

	.note.alert .message {
		color: var(--qmh-alert);
	}

	.code {
		color: var(--qmh-ghost);
		margin-inline-start: var(--qmh-space);
	}

	/* The hint is the fix, so it reads as a second sentence rather than a second
	   column: an author reading a note wants both at once. */
	.hint {
		display: block;
		font-size: var(--qmh-text-meta);
		color: var(--qmh-ink-meta);
	}
</style>
