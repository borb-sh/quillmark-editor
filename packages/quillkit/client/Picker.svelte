<!--
  Which quill, and which version of it. Two axes over the quiver's catalog, which is in
  memory by the time the quiver exists (`quillNames` and `versionsOf` are sync), so this
  needs no loading state of its own.

  An axis holding one value is not a choice, so it is printed rather than offered (a
  working tree is usually one quill at one version). What stays either way is the fact,
  which quill and which version, since an author has to know what they are looking at.

  Native selects where there is something to pick: the picker is chrome around the
  surface being judged, and a control the platform already draws is the one that
  competes with it least.
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
	{#if catalog.description}
		<!-- The collection's own sentence, beside the name it names. `About` holds it
		     untruncated (STUDIO §"Opened, not stood on"). -->
		<span class="said" data-testid="quiver-said" title={catalog.description}
			>{catalog.description}</span
		>
	{/if}
	<!-- A `<label>` where there is a control for it to name, a `<div>` where the value is
	     printed: a label naming nothing is worse than the markup it saves. -->
	{#if catalog.quills.length > 1}
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
	{:else}
		<div class="field">
			<span class="qm-label">quill</span>
			<span class="qm-readout" data-testid="pick-quill">{picked?.name ?? ''}</span>
		</div>
	{/if}
	{#if versions.length > 1}
		<label class="field">
			<span class="qm-label">version</span>
			<select
				class="qm-control"
				data-testid="pick-version"
				{disabled}
				value={picked?.version ?? ''}
				onchange={(e) => picked && onPick(picked.name, e.currentTarget.value)}
			>
				{#each versions as version (version)}
					<option value={version}>{version}</option>
				{/each}
			</select>
		</label>
	{:else}
		<div class="field">
			<span class="qm-label">version</span>
			<span class="qm-readout" data-testid="pick-version">{picked?.version ?? ''}</span>
		</div>
	{/if}
</div>

<style>
	.picker {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--qmh-space) var(--qmh-space-3);
		min-width: 0;
	}

	/* Label and value on one line: the label is the value's name, not a heading over
	   it, and a head band has one line to spend. */
	.field {
		display: flex;
		align-items: center;
		gap: var(--qmh-space);
	}

	/* The only part of this band that yields: it truncates to whatever the controls beside
	   it leave, a sentence pushing the picker off the line costing the author the control
	   they came for. */
	.said {
		flex: 0 1 auto;
		min-width: 0;
		font-size: var(--qmh-text-meta);
		line-height: var(--qmh-leading-tight);
		color: var(--qmh-ink-meta);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
</style>
