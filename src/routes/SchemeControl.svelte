<!--
  The host's colour-scheme declaration, as a control: it writes `color-scheme`
  on the document element — the line THEMING.md asks a host app for — and every
  `[data-qm-root]` below inherits it (PLAYGROUND §Colour). `system` is the
  absence of the declaration, not a third value.
-->
<script lang="ts">
	import { onMount } from 'svelte';

	type Scheme = 'system' | 'light' | 'dark';

	const SCHEMES: Scheme[] = ['system', 'light', 'dark'];
	// `app.html`'s head script reads the same key and makes the same write before
	// first paint, so a pinned scheme does not flash the OS default on load.
	const KEY = 'pg-scheme';

	let scheme = $state<Scheme>('system');

	function apply(next: Scheme): void {
		scheme = next;
		// Empty string clears the inline declaration, leaving the stylesheet's
		// `light dark` — following the OS is what "system" means.
		document.documentElement.style.colorScheme = next === 'system' ? '' : next;
		// Storage throws rather than no-ops where it is denied, and a blank
		// playground is a steep price for a preference.
		try {
			localStorage.setItem(KEY, next);
		} catch {
			/* not persisted */
		}
	}

	onMount(() => {
		let stored: string | null = null;
		try {
			stored = localStorage.getItem(KEY);
		} catch {
			/* not persisted */
		}
		if (stored === 'light' || stored === 'dark') apply(stored);
	});
</script>

<div class="scheme" role="group" aria-label="Colour scheme">
	{#each SCHEMES as option (option)}
		<button
			class="pg-btn"
			type="button"
			aria-pressed={scheme === option}
			onclick={() => apply(option)}>{option}</button
		>
	{/each}
</div>

<style>
	/* One control, three segments: the buttons share their edges rather than each
	   carrying its own, so the group reads as a single switch. */
	.scheme {
		display: flex;
	}

	.pg-btn {
		border-radius: 0;
	}

	.pg-btn + .pg-btn {
		margin-inline-start: calc(var(--pg-border-width) * -1);
	}

	.pg-btn:first-child {
		border-start-start-radius: var(--pg-radius-inner);
		border-end-start-radius: var(--pg-radius-inner);
	}

	.pg-btn:last-child {
		border-start-end-radius: var(--pg-radius-inner);
		border-end-end-radius: var(--pg-radius-inner);
	}

	/* The pressed segment must sit over its neighbours' edges for its own stronger
	   border to be the one drawn on the shared seam. */
	.pg-btn[aria-pressed='true'] {
		position: relative;
	}
</style>
