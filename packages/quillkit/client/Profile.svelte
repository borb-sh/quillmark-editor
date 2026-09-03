<!--
  The author's boilerplate, nominated and kept: which of this quill's fields a new document
  should open already carrying (`profile.ts`).

  The document on screen is the editing surface for it, which is why this panel draws no
  field controls of its own. A writer fills a letterhead once in the editor they already
  know, opens this, and nominates the fields worth keeping; a PCS is the same gesture with
  the new values typed. A control per field here would be a second editor over the same
  schema, drawn worse, and stale the moment the schema moved.

  So what this panel holds is a checklist, and the value beside each name is a readout of
  what would be saved rather than an input: the panel says what the gesture will take, and
  the editor is where it is changed.
-->
<script lang="ts">
	import type { Document, Quill } from '@quillmark/wasm';
	import { clearProfile, loadProfile, saveProfile, type Profile } from './profile';

	interface Props {
		/** The quill on screen: its schema names the fields, its name keys the store. */
		quill: Quill;
		/** The document as it stands. Read at open and not tracked: an edit mutates it in
		 *  place, and this panel is mounted only while it is up. */
		doc: Document;
		onClose: () => void;
	}

	let { quill, doc, onClose }: Props = $props();

	let el = $state.raw<HTMLDialogElement | undefined>();
	$effect(() => el?.showModal());

	/** Where the gesture a click reports began, so a selection released past the plate is
	 *  told from a click on the scrim (the reading `Markdown.svelte` takes). */
	let pressed: EventTarget | null = null;

	/** Which quill's profile this is. Derived rather than read once: the panel is mounted
	 *  only while it is up and a quill cannot change under it, but a prop read at init is a
	 *  value that would silently stop tracking if that ever stopped being true. */
	const name = $derived(quill.metadata.name);

	/** What the store holds now, read once at open — which is the whole of this panel's
	 *  read: what it lists is the store as the author opened it, and every write below
	 *  answers for itself. */
	// svelte-ignore state_referenced_locally
	const held = loadProfile(name) ?? {};

	/** One row per declared field of the main card, in the schema's own order — which is
	 *  the order the editor draws them in, so the checklist reads down the same list the
	 *  author just filled. Card kinds are out: an indorsement is a card the author adds,
	 *  and a seed lays no card for a profile to reach. */
	const rows = $derived(
		Object.entries(quill.schema.main.fields).map(([field, schema]) => ({
			field,
			label: schema.ui?.title ?? humanize(field),
			value: read(field)
		}))
	);

	/** Which fields are nominated. Seeded from what is already saved, so opening the panel
	 *  and saving again is a no-op rather than a clear. */
	let chosen = $state<Record<string, boolean>>(
		Object.fromEntries(Object.keys(held).map((f) => [f, true]))
	);

	/** What the last gesture did, said in the panel rather than in the head: the head
	 *  reports the document, and this is about the store. */
	let said = $state.raw<string | undefined>();

	const count = $derived(rows.filter((r) => chosen[r.field]).length);
	/** Whether the store holds anything for this quill, which is what makes a clear
	 *  meaningful. Tracked rather than read off `held`, so it answers after a save. */
	let saved = $state.raw(Object.keys(held).length > 0);

	/** `memo_from` → "Memo from": the key humanized, which is what a card's group registry
	 *  says a consumer does with an id it has no title for. */
	function humanize(field: string): string {
		const spaced = field.replace(/[_-]+/g, ' ').trim();
		return spaced.charAt(0).toUpperCase() + spaced.slice(1);
	}

	/** The verbatim store read, which is exactly what a save writes and a seed lays back.
	 *  A field the document has nothing at answers `undefined` rather than throwing. */
	function read(field: string): unknown {
		try {
			return doc.getStored(field);
		} catch {
			return undefined;
		}
	}

	/** One line of what a value is, for the row beside its name. Not the value's own
	 *  rendering — this panel draws no content — just enough to recognize what is about to
	 *  be kept. */
	function preview(value: unknown): string {
		if (value === undefined || value === null || value === '') return '—';
		if (Array.isArray(value)) return value.length ? value.map(preview).join(' · ') : '—';
		if (typeof value === 'object') return JSON.stringify(value);
		return String(value);
	}

	function save(): void {
		const next: Profile = {};
		for (const row of rows)
			if (chosen[row.field] && row.value !== undefined) next[row.field] = row.value;
		const took = saveProfile(name, next);
		saved = took && Object.keys(next).length > 0;
		said = took
			? Object.keys(next).length === 0
				? 'Profile cleared.'
				: `Saved ${Object.keys(next).length} field${Object.keys(next).length === 1 ? '' : 's'}. New documents open with them.`
			: 'This browser refused the write, so nothing is saved.';
	}

	function clear(): void {
		const took = clearProfile(name);
		if (took) {
			chosen = {};
			saved = false;
		}
		said = took ? 'Profile cleared.' : 'This browser refused the write, so nothing changed.';
	}
</script>

<dialog
	bind:this={el}
	class="panel"
	aria-label="Document profile"
	onclose={onClose}
	onpointerdown={(e) => (pressed = e.target)}
	onclick={(e) => e.target === el && pressed === el && onClose()}
>
	<div class="qm-panel plate">
		<header class="head">
			<h2 class="qm-label">Profile · {name}</h2>
			<button class="qm-control" type="button" data-testid="profile-close" onclick={onClose}
				>Close</button
			>
		</header>

		<p class="said">
			Fields checked here are saved from the document on screen and laid onto every new document of
			this quill. Kept in this browser only.
		</p>

		<ul class="rows">
			{#each rows as row (row.field)}
				<li class="row">
					<label class="pick">
						<input
							type="checkbox"
							data-testid={`profile-pick-${row.field}`}
							checked={chosen[row.field] ?? false}
							onchange={(e) => (chosen = { ...chosen, [row.field]: e.currentTarget.checked })}
						/>
						<span class="name">{row.label}</span>
					</label>
					<span class="qm-readout value" title={preview(row.value)}>{preview(row.value)}</span>
				</li>
			{/each}
		</ul>

		{#if said}
			<p class="qm-status" data-testid="profile-said">{said}</p>
		{/if}

		<div class="controls">
			<button class="qm-control" type="button" data-testid="profile-save" onclick={save}
				>Save {count} field{count === 1 ? '' : 's'}</button
			>
			<button
				class="qm-control"
				type="button"
				data-testid="profile-clear"
				disabled={!saved}
				onclick={clear}>Clear profile</button
			>
		</div>
	</div>
</dialog>

<style>
	/* The room and the plate, as the source panel draws them: the dialog takes the viewport
	   so the scrim is clickable everywhere, and the plate inside it is what has a size. */
	.panel {
		display: flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: 100%;
		max-width: 100%;
		height: 100%;
		max-height: 100%;
		padding: var(--qmh-space-4);
		border: none;
		background: none;
		overflow: hidden;
	}

	.panel::backdrop {
		/* mint: the scrim's tone, the same recede the source panel mints — a scrim is a
		   tone between two planes and the host scale carries no opacity rung. */
		background: color-mix(in srgb, var(--qmh-page) 80%, transparent);
	}

	.plate {
		display: flex;
		flex-direction: column;
		gap: var(--qmh-space-3);
		width: 100%;
		max-width: var(--st-panel);
		max-height: 100%;
		min-height: 0;
	}

	.head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--qmh-space-4);
	}

	/* What the panel is for, once. It is the one sentence here, so it takes the meta ink
	   the picker's own sentence does rather than a plate of its own. */
	.said {
		margin: 0;
		font-size: var(--qmh-text-meta);
		line-height: var(--qmh-leading-tight);
		color: var(--qmh-ink-meta);
	}

	/* The checklist carries the panel's scroll: a quill with thirty fields is a list, and
	   the controls under it stay reachable without one. */
	.rows {
		flex: 1 1 auto;
		min-height: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		overflow: auto;
	}

	/* Name and value on one line, the value taking what the name leaves: the name is what
	   is being nominated, and the value is evidence beside it. */
	.row {
		display: flex;
		align-items: baseline;
		gap: var(--qmh-space-3);
		padding-block: var(--qmh-space);
		min-width: 0;
	}

	.row + .row {
		border-block-start: var(--qmh-border-width) solid var(--qmh-border);
	}

	.pick {
		display: flex;
		align-items: baseline;
		gap: var(--qmh-space);
		flex: 0 0 auto;
	}

	.name {
		font-size: var(--qmh-text-label);
	}

	/* The evidence, and the only part of the row that yields: one line, truncated, with the
	   whole of it in the title. A value wrapping to three lines would make the checklist a
	   document view, which is the panel this deliberately is not. */
	.value {
		flex: 1 1 auto;
		min-width: 0;
		text-align: end;
		color: var(--qmh-ink-meta);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		gap: var(--qmh-space-2);
	}
</style>
