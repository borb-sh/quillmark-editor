<!--
  A `date` (or `datetime`) field → a styled segmented date field on bits-ui. The
  stored value is a string (fixture uses `YYYY-MM-DD`, blank to mean "today at
  render"); a cleared control commits `undefined` — the unset rung: the parent
  removes the field, so the memo quill's blank-date → `datetime.today()`
  substitution applies (issue #12). The value-object a date field lowers to is a
  render-time concern — the editor only sees the stored string.

  Styled rather than a native `<input type="date">` because that control's calendar
  popup is UA-owned and reaches no dial (issue #79 §3). `DateField` (segments, no
  calendar) rather than `DatePicker`: the segments ARE the entry affordance, and a
  calendar is a second surface this field has never had.

  THE BOUNDARY IS A STRING. The primitive speaks `CalendarDate`; the document
  speaks `YYYY-MM-DD`. `CalendarDate` carries no time and no zone, so the
  round-trip is lossless and no local-midnight shift can occur — the hazard that
  makes `new Date('2026-07-25')` the wrong tool here. Authored values are data, not
  input: `parseDate` THROWS on anything malformed, so a bad string degrades to an
  empty field rather than taking the editor down with it.
-->
<script lang="ts">
	import { DateField as BitsDateField } from 'bits-ui';
	import { CalendarDate, parseDate, type DateValue } from '@internationalized/date';
	import { syncedLocal } from './synced.svelte.js';

	interface Props {
		value: string | undefined;
		/** Accessible name — the visual label is a bare span the segments can't reference. */
		label?: string;
		onCommit: (v: string | undefined) => void;
		testid?: string;
	}
	let { value, label, onCommit, testid }: Props = $props();

	function toDateValue(s: string | undefined): DateValue | undefined {
		if (!s) return undefined;
		try {
			// The stored form may carry a time (`datetime`); the date half is what a
			// date field edits, so anything past `YYYY-MM-DD` is not this control's.
			return parseDate(s.slice(0, 10));
		} catch {
			return undefined;
		}
	}
	/** Back to the stored form — `CalendarDate.toString()` is exactly `YYYY-MM-DD`. */
	const toStored = (d: DateValue | undefined) =>
		d ? new CalendarDate(d.year, d.month, d.day).toString() : undefined;

	// Local value synced to `value`; own-edits stay local, only an external change
	// reconciles back in (see `syncedLocal`). Driven CONTROLLED (`value` +
	// `onValueChange`, never `bind:`) so reconciliation stays the package's.
	const local = syncedLocal(() => toDateValue(value));
</script>

<span class="qm-date-wrap">
	<BitsDateField.Root
		value={local.value}
		onValueChange={(d) => {
			local.value = d;
			// A cleared or half-typed field yields undefined — the unset rung.
			onCommit(toStored(d));
		}}
	>
		<BitsDateField.Input class="qm-date" aria-label={label} data-testid={testid}>
			{#snippet children({ segments })}
				<!-- Keyed by INDEX: `part` repeats — the `literal` separators between
				     segments all carry it — so a part-keyed block collides. -->
				{#each segments as seg, i (i)}
					<BitsDateField.Segment class="qm-date-segment" part={seg.part}>
						{seg.value}
					</BitsDateField.Segment>
				{/each}
			{/snippet}
		</BitsDateField.Input>
	</BitsDateField.Root>
</span>

<style>
	/* A primitive renders its OWN element, which a scoped selector cannot reach —
	   styled through the wrapper with `:global`. */
	.qm-date-wrap :global(.qm-date) {
		display: flex;
		align-items: center;
		width: 100%;
		box-sizing: border-box;
		padding: var(--_qm-space) var(--_qm-space-2);
		border: 1px solid var(--_qm-border);
		border-radius: var(--_qm-radius-inner);
		font: inherit;
		color: var(--_qm-ink);
		background: var(--_qm-surface);
	}
	/* The ring lands on the wrapper: focus lives on the SEGMENT, so a per-segment
	   ring would flicker across the field as the caret walks it (SURFACES §Focus). */
	.qm-date-wrap :global(.qm-date:focus-within) {
		outline: 2px solid var(--_qm-accent);
		outline-offset: 1px;
	}
	.qm-date-wrap :global(.qm-date-segment) {
		padding: 0 var(--_qm-space-half);
		border-radius: var(--_qm-radius-inner);
		outline: none;
	}
	.qm-date-wrap :global(.qm-date-segment:focus) {
		background: var(--_qm-surface-hover);
	}
	/* An unfilled segment shows its `dd`/`mm`/`yyyy` hint — shown, never written. */
	.qm-date-wrap :global(.qm-date-segment[data-placeholder]) {
		color: var(--_qm-ink-ghost);
	}
</style>
