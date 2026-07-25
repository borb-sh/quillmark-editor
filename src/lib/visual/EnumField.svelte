<!--
  A `string`+`enum` (or `type: 'enum'`) field → a styled listbox over `enum ??
  values`, on bits-ui. When nothing is authored the list shows a distinct UNSET
  sentinel that GHOSTS the `default:` (muted, shown-never-written), distinguishable
  from an authored pick and re-selectable — so re-picking the default fires a
  change (issue #21a). The sentinel commits nothing; any real pick — INCLUDING the
  value that equals the default — commits via the parent's typed `writer.set`.
  Explicitly picking the default is the one place "commit the default" is genuine
  intent, expressible. The sentinel stays in the list once a value is authored, as
  the "clear back to default" (unset) affordance.

  Styled rather than a native `<select>`: the dropdown list is UA-owned and reaches
  no dial (issue #79 §3). Listbox semantics and typeahead come with the primitive.
-->
<script lang="ts">
	import { Select } from 'bits-ui';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { QM_THEME } from '../core/index.js';
	import { syncedLocal } from './synced.svelte.js';

	interface Props {
		value: string | undefined;
		values: string[];
		fallback?: string;
		/** Accessible name — the visual label is a bare span the trigger can't reference. */
		label?: string;
		onCommit: (v: string | undefined) => void;
		/** Consumer policy (issue #73): `false` disables an option so it can't be picked.
		 * A disallowed value already authored stays SELECTED and visible (disabled), never
		 * stripped or mutated. The UNSET sentinel is exempt — clear-to-default always works. */
		optionAllowed?: (value: string) => boolean;
		testid?: string;
	}
	let { value, values, fallback, label, onCommit, optionAllowed, testid }: Props = $props();

	// The sentinel's option value — a namespaced marker that no schema-authored
	// enum member would ever be (`values` are classification markings, seal ids, and
	// the like), so it never collides with a real option.
	const UNSET = '__qm_unset__';

	// Local selection synced to `value` (sentinel when unauthored); own-picks stay
	// local, only an external change reconciles back in (see `syncedLocal`). Driven
	// CONTROLLED (`value` + `onValueChange`, never `bind:`) so reconciliation stays
	// the package's rather than the primitive's.
	const local = syncedLocal(() => value ?? UNSET);

	/** An empty enum member has no glyph of its own; an em dash stands in for it. */
	const dash = (v: string | undefined) => v || '—';

	const unset = $derived(local.value === UNSET);
	const ghostText = $derived(dash(fallback));
	/** What the closed trigger shows — the pick, or the ghosted default while unset. */
	const shown = $derived(unset ? ghostText : dash(local.value));
</script>

<span class="qm-select-wrap">
	<!-- `allowDeselect={false}`: the UNSET sentinel is the clear-to-default
	     affordance, so the primitive's own deselect must stay off. It reports a
	     deselect as `''` — INDISTINGUISHABLE from picking the empty-string enum
	     member the reference quill actually declares (issue #21a). -->
	<Select.Root
		type="single"
		allowDeselect={false}
		value={local.value}
		onValueChange={(v) => {
			if (v == null) return;
			local.value = v;
			// Sentinel → unset (parent `removeField`, default renders); any real pick
			// (incl. the default value) → a genuine write.
			onCommit(v === UNSET ? undefined : v);
		}}
	>
		<Select.Trigger
			class="qm-select"
			aria-label={label}
			data-testid={testid}
			data-ghosted={unset ? '' : undefined}
		>
			{shown}
			<ChevronDown size={14} aria-hidden="true" />
		</Select.Trigger>
		<Select.Portal>
			<Select.Content sideOffset={4}>
				<!-- The list PORTALS to document.body, outside the editor root, so it
				     carries the derivation like FormatPopover does. The pill is this
				     element (not the primitive's) because scoped CSS keys off which
				     component OWNS the markup: a `class` passed to a primitive is a
				     plain string and never picks up the scoping hash. -->
				<div class="qm-select-content" style={QM_THEME}>
					<Select.Viewport>
						<Select.Item class="qm-select-item" value={UNSET} label={ghostText}>
							<span class="qm-select-ghost">{ghostText}</span>
						</Select.Item>
						{#each values as v (v)}
							<Select.Item
								class="qm-select-item"
								value={v}
								label={dash(v)}
								disabled={optionAllowed?.(v) === false}
							>
								{dash(v)}
							</Select.Item>
						{/each}
					</Select.Viewport>
				</div>
			</Select.Content>
		</Select.Portal>
	</Select.Root>
</span>

<style>
	/* A primitive renders its OWN element, which a scoped selector cannot reach —
	   styled through the wrapper with `:global`. */
	.qm-select-wrap :global(.qm-select) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--_qm-space);
		width: 100%;
		box-sizing: border-box;
		padding: var(--_qm-space) var(--_qm-space-2);
		border: 1px solid var(--_qm-border);
		border-radius: var(--_qm-radius-inner);
		font: inherit;
		text-align: left;
		color: var(--_qm-ink);
		background: var(--_qm-surface);
		cursor: pointer;
	}
	/* Themed focus ring in place of the raw UA outline (SURFACES §Focus). */
	.qm-select-wrap :global(.qm-select:focus-visible) {
		outline: var(--_qm-ring-focus);
		outline-offset: var(--_qm-ring-offset);
	}
	/* Shown-never-written: the closed control reads muted while unset, matching the
	   ghosted placeholder the text/number controls show. */
	.qm-select-wrap :global(.qm-select[data-ghosted]) {
		color: var(--_qm-ink-ghost);
	}
	/* The open list — a floating surface, so it earns the lift (SURFACES §Elevation). */
	.qm-select-content {
		min-width: var(--bits-select-anchor-width);
		max-height: 16rem;
		overflow-y: auto;
		padding: var(--_qm-space-half);
		border: 1px solid var(--_qm-border);
		border-radius: var(--_qm-radius);
		background: var(--_qm-surface);
		box-shadow: var(--_qm-shadow-popover);
		font-size: var(--_qm-text-body);
		color: var(--_qm-ink);
	}
	.qm-select-content :global(.qm-select-item) {
		padding: var(--_qm-space) var(--_qm-space-2);
		border-radius: var(--_qm-radius-inner);
		cursor: pointer;
		user-select: none;
	}
	/* bits marks the pointer/keyboard-highlighted item; there is no :hover lane. */
	.qm-select-content :global(.qm-select-item[data-highlighted]) {
		background: var(--_qm-surface-hover);
	}
	.qm-select-content :global(.qm-select-item[data-selected]) {
		font-weight: var(--_qm-weight-label);
	}
	/* Consumer policy (issue #73) — offered but unpickable, never hidden. */
	.qm-select-content :global(.qm-select-item[data-disabled]) {
		opacity: var(--_qm-opacity-muted);
		cursor: default;
	}
	.qm-select-ghost {
		color: var(--_qm-ink-ghost);
	}
</style>
