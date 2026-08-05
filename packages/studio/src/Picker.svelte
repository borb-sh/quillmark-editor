<!--
  Which quill, and which version of it. Two selects over the quiver's catalog, which
  is in memory by the time the quiver exists (`quillNames` and `versionsOf` are sync),
  so this needs no loading state of its own.

  Native selects: the picker is chrome around the surface being judged, and a control
  the platform already draws is the one that competes with it least.
-->
<script lang="ts">
	import type { Catalog } from './quiver';

	interface Props {
		catalog: Catalog;
		picked: { name: string; version: string } | undefined;
		/** Inert while an open is in flight: a second pick mid-open would race it. */
		disabled: boolean;
		onPick: (name: string, version: string) => void;
	}

	let { catalog, picked, disabled, onPick }: Props = $props();

	/** Versions of the picked quill, newest first (`versionsOf`'s own order). */
	const versions = $derived(catalog.quills.find((q) => q.name === picked?.name)?.versions ?? []);

	// A quill picked from the name select takes its newest version: the version is a
	// narrowing of the name, so it cannot keep the one the previous quill was at.
	function pickName(name: string): void {
		const quill = catalog.quills.find((q) => q.name === name);
		if (quill) onPick(name, quill.versions[0]);
	}
</script>

<div class="picker">
	<span class="qm-label">{catalog.name}</span>
	<label class="field">
		<span class="qm-label">quill</span>
		<select
			class="qm-control"
			data-testid="pick-quill"
			{disabled}
			value={picked?.name ?? ''}
			onchange={(e) => pickName(e.currentTarget.value)}
		>
			{#each catalog.quills as quill (quill.name)}
				<option value={quill.name}>{quill.name}</option>
			{/each}
		</select>
	</label>
	<label class="field">
		<span class="qm-label">version</span>
		<select
			class="qm-control"
			data-testid="pick-version"
			disabled={disabled || versions.length < 2}
			value={picked?.version ?? ''}
			onchange={(e) => picked && onPick(picked.name, e.currentTarget.value)}
		>
			{#each versions as version (version)}
				<option value={version}>{version}</option>
			{/each}
		</select>
	</label>
</div>

<style>
	.picker {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--qmh-space) var(--qmh-space-3);
		min-width: 0;
	}

	/* Label and control on one line: the label is the control's name, not a heading
	   over it, and a head band has one line to spend. */
	.field {
		display: flex;
		align-items: center;
		gap: var(--qmh-space);
	}
</style>
