<!--
  A `date` (or `datetime`) field → a styled segmented date field on bits-ui. The
  stored value is a string (fixture uses `YYYY-MM-DD`, blank to mean "today at
  render"); a cleared control commits `undefined` — the unset rung: the parent
  removes the field, so the memo quill's blank-date → `datetime.today()`
  substitution applies. The value-object a date field lowers to is a
  render-time concern — the editor only sees the stored string.

  Styled rather than a native `<input type="date">`: that control's calendar popup
  is UA-owned and reaches no dial. `DateField` (segments, no
  calendar) rather than `DatePicker` — the segments are the entry affordance, and a
  calendar is a second surface this field does not need.

  THE BOUNDARY IS A STRING, AND THE LOCAL IS TOO. The primitive speaks
  `CalendarDate`; the document speaks `YYYY-MM-DD`. `CalendarDate` carries no time
  and no zone, so the round-trip is lossless and no local-midnight shift can occur
  — the hazard that makes `new Date('2026-07-25')` the wrong tool here. Authored
  values are data, not input: `parseDate` THROWS on anything malformed, so a bad
  string degrades to an empty field rather than taking the editor down with it.

  `syncedLocal` reconciles by IDENTITY, so the local must hold the string, not the
  parsed value: a fresh `CalendarDate` is never `===` the last one, which would
  make every reconcile fire and re-render all seven segments on each commit.

  THE GHOST IS THE DEFAULT'S DIGITS, NOT A FORMAT HINT. An unset field
  carrying a `default:` prints the default's digits in the segments, ghost-toned,
  instead of the primitive's `mm`/`dd`/`yyyy` hints — which say "empty" where the
  rung says "will render 2026-01-01". The ghost is painted in the SEGMENT SNIPPET,
  over an unset primitive: substituting the default for `value` instead would make
  the field indistinguishable from an authored one to every path that reads it
  (`areAllSegmentsFilled`, Backspace, the hidden input), and the primitive shadows
  a written-back `value` prop it was not `bind:`-ed to, so re-seating the ghost
  after a clear never lands. `placeholder` — the `DateValue` the segments COUNT
  from, never one they display — carries the default too, so arrowing an empty
  segment starts at the render's date rather than today's.
-->
<script lang="ts">
	import { DateField as BitsDateField } from 'bits-ui';
	import { parseDate, type DateValue } from '@internationalized/date';
	import { syncedLocal } from './synced.svelte.js';
	import './controls.css';

	interface Props {
		value: string | undefined;
		/** The resolved `default:` in the boundary's currency (`YYYY-MM-DD`) — parsed
		 * for display only, shown while unset, never written. */
		fallback?: string;
		/** Accessible name for a field NOTHING else names — an object property, whose
		 * name is the field label plus the property's. A field's own date takes
		 * `labelledBy` instead. */
		label?: string;
		/** The field label's own id. `for` CANNOT reach this control — the segment
		 * container is not a labelable element — so the association runs the other way,
		 * and the label's click comes back through {@link focus}. It lands on the
		 * container, which the primitive gives `role="group"`: the name belongs to the
		 * SET of segments, and entering any of them announces it. (bits builds each
		 * segment's own `aria-labelledby` from a `DateField.Label` inside its root —
		 * unreachable from here, since the field's label is a grid child of the field,
		 * not of the control.) */
		labelledBy?: string;
		/** The parked `description` (FieldLabel) — announced after the name. */
		describedBy?: string;
		onCommit: (v: string | undefined) => void;
		testid?: string;
	}
	let { value, fallback, label, labelledBy, describedBy, onCommit, testid }: Props = $props();

	let wrapEl: HTMLElement | undefined = $state();
	/** Take the caret — what the label click, and a parent placing focus here, calls.
	 * The FIRST segment, not the field: focus lives on a segment (which is why the
	 * ring is `.qm-focus-ring-within`), and the container holds none. `literal` is the
	 * separator between segments — present, never focusable. */
	export function focus(): void {
		wrapEl?.querySelector<HTMLElement>('[data-segment]:not([data-segment="literal"])')?.focus();
	}

	// The stored form may carry a time (`datetime`); the date half is what a date
	// field edits, so anything past `YYYY-MM-DD` is not this control's. `parseDate`
	// throws on a malformed authored value — an empty field is the honest render.
	function toDateValue(s: string): DateValue | undefined {
		if (!s) return undefined;
		try {
			return parseDate(s);
		} catch {
			return undefined;
		}
	}

	// Local value synced to `value` as a STRING (see the identity note above);
	// own-edits stay local, only an external change reconciles back in. Driven
	// CONTROLLED (`value` + `onValueChange`, never `bind:`) so reconciliation stays
	// the package's.
	const local = syncedLocal(() => value?.slice(0, 10) ?? '');
	const parsed = $derived(toDateValue(local.value));
	// The date the empty segments ghost, or undefined when there is nothing to ghost:
	// the field is unset AND the default has a date form. A non-blank local that
	// fails to parse is AUTHORED-but-malformed, which the empty field states
	// honestly — the ghost would claim it unset. Held as the parsed value rather than
	// a boolean so the substitution below narrows on the one fact it needs.
	const fallbackDate = $derived(toDateValue(fallback?.slice(0, 10) ?? ''));
	const ghost = $derived(local.value === '' ? fallbackDate : undefined);

	// What one segment prints, and whether that text is shown-never-written.
	//
	// An UNFILLED segment is always shown-never-written, whether it prints the
	// default's digits or the primitive's own `mm`/`dd`/`yyyy` hint — both state
	// "nothing authored here". Only an unfilled segment ghosts: a half-entered date
	// holds digits while the VALUE is still undefined (one unfilled segment unsets
	// the whole field), so ghosting unconditionally would paint over, and dim, the
	// digits just typed. The segment's own text is the tell — its unfilled hint is
	// alphabetic in every locale bits ships (`mm`/`yyyy`, `аа`, `年`), a filled one
	// is digits.
	//
	// The separators are `literal` parts, never unfilled; substitution covers the
	// date parts only, so any time part keeps the primitive's text. Digits are
	// zero-padded to the segment widths the field displays.
	function segmentText(part: string, text: string): { text: string; ghosted: boolean } {
		if (part === 'literal' || /\d/.test(text)) return { text, ghosted: false };
		if (!ghost) return { text, ghosted: true };
		switch (part) {
			case 'year':
				return { text: String(ghost.year).padStart(4, '0'), ghosted: true };
			case 'month':
				return { text: String(ghost.month).padStart(2, '0'), ghosted: true };
			case 'day':
				return { text: String(ghost.day).padStart(2, '0'), ghosted: true };
			default:
				return { text, ghosted: true };
		}
	}
</script>

<span class="qm-date-wrap" bind:this={wrapEl}>
	<BitsDateField.Root
		value={parsed}
		placeholder={fallbackDate}
		onValueChange={(d) => {
			// `CalendarDate.toString()` is exactly `YYYY-MM-DD`. A cleared or
			// half-typed field yields undefined — the unset rung.
			local.value = d?.toString() ?? '';
			onCommit(d?.toString());
		}}
	>
		<!-- `data-ghosted` states the rung the way the enum trigger does. The date
		     primitive emits no per-segment placeholder marker (only bits' `select`
		     does), so the TONE rides the same attribute, set per segment from the
		     substitution itself — which is also what keeps a half-typed date's own
		     digits at full ink while the segments around them ghost. -->
		<BitsDateField.Input
			class="qm-date qm-control-box qm-focus-ring-within"
			aria-label={labelledBy ? undefined : label}
			aria-labelledby={labelledBy}
			aria-describedby={describedBy}
			data-ghosted={ghost ? '' : undefined}
			data-testid={testid}
		>
			{#snippet children({ segments })}
				<!-- Keyed by INDEX: `part` repeats — the `literal` separators between
				     segments all carry it — so a part-keyed block collides. -->
				{#each segments as seg, i (i)}
					{@const shown = segmentText(seg.part, seg.value)}
					<BitsDateField.Segment
						class="qm-date-segment"
						part={seg.part}
						data-ghosted={shown.ghosted ? '' : undefined}
					>
						{shown.text}
					</BitsDateField.Segment>
				{/each}
			{/snippet}
		</BitsDateField.Input>
	</BitsDateField.Root>
</span>

<style>
	/* A primitive renders its OWN element, which a scoped selector cannot reach —
	   styled through the wrapper with `:global`. */
	/* The box is `.qm-control-box` (controls.css), carried on the primitive's own
	   element beside `.qm-focus-ring-within`; the segments inherit its size rung, so
	   the field and its neighbours agree without a second rule. */
	.qm-date-wrap :global(.qm-date) {
		display: flex;
		align-items: center;
		width: 100%;
		box-sizing: border-box;
		color: var(--_qm-ink);
	}
	/* The ring rides `.qm-focus-ring-within` (controls.css) rather than the plain
	   marker: focus lives on the SEGMENT, so it rings the field, not the segment
	   the caret happens to be in. */
	.qm-date-wrap :global(.qm-date-segment) {
		padding: 0 var(--_qm-space-half);
		border-radius: var(--_qm-radius-inner);
		outline: none;
	}
	.qm-date-wrap :global(.qm-date-segment:focus) {
		background: var(--_qm-surface-hover);
	}
	/* An unfilled segment is ghost-toned whatever it prints — the resolved `default:`
	   when there is one to ghost, the `dd`/`mm`/`yyyy` hint when there is not. Shown,
	   never written, either way. The marker is the component's own (see the snippet):
	   the date primitive emits no placeholder attribute of its own. */
	.qm-date-wrap :global(.qm-date-segment[data-ghosted]) {
		color: var(--_qm-ink-ghost);
	}
</style>
