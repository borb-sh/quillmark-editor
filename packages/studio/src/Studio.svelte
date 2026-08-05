<!--
  STUDIO, whole: a quiver's quills worked live. Pick a quill, edit, watch it paint,
  read the errors.

  One consumer-owned `LiveSession` over one document, under two surfaces:
    • <VisualEditor> (left): the edit surface; commits land on `open.doc`.
    • <Preview>     (right): a pure view of the session; never mutates it.

  The bridge is studio's own — consumer-layer by design, and rewritten here rather
  than shared with the playground, whose chrome shows its instruments where studio's
  hides them:

    edit ─► (debounced) session.update(doc) ─► preview.refresh(change)
                                            └► notes = the three producers, merged
    preview click ─► onCaretPick(hit) ─► editor.setCaret(hit)
    editor caret  ─► onCaretMove(at)  ─► preview.focusPosition(at)

  A repack of the source quiver arrives as one dev-server signal and is answered by
  minting a fresh `Quiver`: the manifest is content-addressed and the quill cache
  lives as long as the quiver does, so the quiver is dropped rather than invalidated.
  The DOCUMENT crosses (STUDIO §"The document survives the quill"), which is what
  makes an edit to a schema an edit to the thing the author is holding.
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { Engine, isQuillmarkError } from '@quillmark/wasm';
	import type { ContentHit, Diagnostic } from '@quillmark/wasm';
	import type { Quiver } from '@quillmark/quiver';
	import { init } from '@quillmark/svelte/core';
	import type { EditorError, Place } from '@quillmark/svelte/core';
	import { Preview } from '@quillmark/svelte/preview';
	import { VisualEditor } from '@quillmark/svelte/visual';
	import type { EditorChange } from '@quillmark/svelte/visual';
	import Picker from './Picker.svelte';
	import Notes from './Notes.svelte';
	import { catalogOf, openQuiver, refOf, type Catalog } from './quiver';
	import { carryOf, close, openRef, type Opened } from './session';
	import { collect, type Notes as NoteSet } from './notes';

	/** The dev-server signal the Node half sends after a repack. */
	const REPACKED = 'studio:quiver-repacked';
	/** One apply per settled burst of keystrokes. A structure op skips it. */
	const RECOMPILE_MS = 120;

	type Phase =
		| { kind: 'booting' }
		| { kind: 'opening'; ref: string }
		| { kind: 'ready' }
		| { kind: 'failed'; message: string };

	// The engine and the quiver are held, not tracked: nothing in the markup reads
	// them, and the surfaces read the handles under `open`.
	let engine: Engine | undefined;
	let quiver: Quiver | undefined;

	let phase = $state.raw<Phase>({ kind: 'booting' });
	let catalog = $state.raw<Catalog | undefined>();
	let picked = $state.raw<{ name: string; version: string } | undefined>();
	let open = $state.raw<Opened | undefined>();
	/** The document as text, kept across an open that FAILED. A quill that will not
	 *  compile is the state an author is most often mid-fix on, and a reload loop that
	 *  ate their document on the way through it would not be one. */
	let held = $state.raw<string | undefined>();

	// ── The errors ──────────────────────────────────────────────────────────────
	/** The diagnostics of a throw: a failed open or a failed recompile. A broken
	 *  plate is the case that matters — the engine reports it as a `QuillmarkError`
	 *  carrying every diagnostic, and an author needs all of them. */
	let thrown = $state.raw<Diagnostic[]>([]);
	/** What a surface recovered from, in its own slot so it neither clobbers a compile
	 *  failure nor is clobbered by the next successful compile. */
	let recovered = $state.raw<Diagnostic[]>([]);
	/** What the last carry stranded. Held for the open and dropped at the first edit:
	 *  from then on the schema producer speaks for the document's current state. */
	let carried = $state.raw<Diagnostic[]>([]);
	let notes = $state.raw<NoteSet>({ all: [], unrouted: 0, diagnostics: [] });

	function syncNotes(): void {
		notes = collect([
			{ origin: 'render', diags: thrown },
			{ origin: 'schema', diags: open ? open.quill.validate(open.doc) : [] },
			{ origin: 'render', diags: open ? open.session.warnings : [] },
			{ origin: 'carried', diags: carried },
			{ origin: 'surface', diags: recovered }
		]);
	}

	// Surface handles for the two imperative bridge hops.
	let editorRef: { setCaret(hit: ContentHit): Promise<void> } | undefined = $state.raw();
	let previewRef: ReturnType<typeof Preview> | undefined = $state.raw();

	// ── Opening ─────────────────────────────────────────────────────────────────
	/** Whether an open is in flight: the picker is inert while one is. */
	const busy = $derived(phase.kind === 'booting' || phase.kind === 'opening');

	/** The open in progress. An open takes as long as the backend takes to load and
	 *  compile a page, which is long enough for a second repack to land inside one, so
	 *  the loser drops what it built instead of both writing the same slot. */
	let turn = 0;

	/**
	 * Replace what is mounted with `ref`, over `carry` when the document should cross.
	 * The old handles are freed only after the surfaces are gone: a live `<Preview>`
	 * paints from the session it was handed, so unmounting first is what keeps a
	 * freed handle out of reach.
	 */
	async function mount(ref: string, carry?: string): Promise<void> {
		if (!engine || !quiver) return;
		const mine = ++turn;
		phase = { kind: 'opening', ref };
		const previous = open;
		open = undefined;
		await tick();
		if (previous) close(previous);
		recovered = [];
		try {
			const next = await openRef(engine, quiver, ref, carry);
			if (mine !== turn) return close(next);
			open = next;
			held = undefined;
			thrown = [];
			carried = next.carry.how === 'carried' ? next.carry.stranded : [];
			phase = { kind: 'ready' };
		} catch (err) {
			if (mine !== turn) return;
			// A quill that does not open is the case `/preview` used to answer: the
			// diagnostics are the whole point, so they land in the notes panel and the
			// panes stay empty rather than the failure being one line of chrome. The
			// document waits it out as text.
			held = carry;
			thrown = diagnosticsOf(err);
			carried = [];
			phase = { kind: 'failed', message: messageOf(err) };
		}
		syncNotes();
	}

	/** A pick is a different document, so nothing crosses: the picked quill seeds its
	 *  own example, which is what "what is this quill like to use" starts from. */
	async function pick(name: string, version: string): Promise<void> {
		picked = { name, version };
		held = undefined;
		await mount(refOf(name, version));
	}

	/**
	 * A repack landed: mint a fresh `Quiver`, re-read the catalog (a version directory
	 * may have appeared or gone), and carry the document into the quill that came out.
	 * The ref is unchanged, so the document is landed under a schema that may have
	 * moved under it; a ref that vanished falls back to whatever the catalog now holds.
	 */
	async function reload(): Promise<void> {
		const carry = open ? carryOf(open) : held;
		let next: Catalog;
		try {
			quiver = await openQuiver();
			next = catalogOf(quiver);
			catalog = next;
		} catch (err) {
			thrown = diagnosticsOf(err);
			phase = { kind: 'failed', message: messageOf(err) };
			syncNotes();
			return;
		}
		const at = picked;
		if (at && next.quills.some((q) => q.name === at.name && q.versions.includes(at.version)))
			return mount(refOf(at.name, at.version), carry);
		// The ref went away under the author (a version directory renamed), so the
		// document has nothing to land in: whatever the catalog holds now, seeded.
		const first = next.quills[0];
		if (!first) {
			thrown = [];
			phase = { kind: 'failed', message: `quiver "${next.name}" holds no quills` };
			syncNotes();
			return;
		}
		await pick(first.name, first.versions[0]);
	}

	// ── The bridge ──────────────────────────────────────────────────────────────
	let settle: ReturnType<typeof setTimeout> | undefined;

	function scheduleRecompile(): void {
		clearTimeout(settle);
		settle = setTimeout(recompileNow, RECOMPILE_MS);
	}

	function recompileNow(): void {
		settle = undefined;
		if (!open) return;
		try {
			previewRef?.refresh(open.session.update(open.doc));
			thrown = [];
		} catch (err) {
			// The session is transactional, so the last good paint stays on screen. What
			// the engine said about the attempt is the reason studio exists, so it is
			// read out rather than logged.
			thrown = diagnosticsOf(err);
		}
		syncNotes();
	}

	function handleChange(change: EditorChange): void {
		// The carry's diagnostics describe the document as it arrived; an edit makes
		// them history, and the schema producer speaks for it from here.
		if (carried.length) carried = [];
		// A structure op happens once per gesture and the stack has already moved, so
		// it applies at once; prose and field edits arrive per keystroke and debounce.
		if (change.source === 'structure') recompileNow();
		else scheduleRecompile();
	}

	function handleCaretPick(hit: ContentHit): void {
		editorRef?.setCaret(hit);
	}

	/** The editor already speaks the preview's address grammar, so nothing translates. */
	function handleCaretMove(at: Place): void {
		previewRef?.focusPosition(at);
	}

	/** Both surfaces report here: a commit the boundary refused, a page the backend
	 *  would not paint. Neither stops the session, and both belong in the one place
	 *  studio puts what went wrong. */
	function handleSurfaceError(err: EditorError): void {
		recovered = [{ severity: 'warning', code: err.code, message: err.message }];
		syncNotes();
	}

	// ── Errors, unwrapped ───────────────────────────────────────────────────────
	function messageOf(err: unknown): string {
		return err instanceof Error ? err.message : String(err);
	}

	function diagnosticsOf(err: unknown): Diagnostic[] {
		if (isQuillmarkError(err) && err.diagnostics.length > 0) return err.diagnostics;
		return [{ severity: 'error', message: messageOf(err) }];
	}

	onMount(() => {
		let cancelled = false;
		(async () => {
			try {
				// `init` instantiates the core; every boundary verb throws
				// `runtime::not_initialized` until it resolves, and the quiver's
				// `getQuill` materializes a quill, so it waits.
				await init();
				quiver = await openQuiver();
				const next = catalogOf(quiver);
				catalog = next;
				const first = next.quills[0];
				if (!first) throw new Error(`quiver "${next.name}" holds no quills`);
				if (cancelled) return;
				engine = new Engine();
				await pick(first.name, first.versions[0]);
			} catch (err) {
				if (!cancelled) {
					thrown = diagnosticsOf(err);
					phase = { kind: 'failed', message: messageOf(err) };
					syncNotes();
				}
			}
		})();

		// The repack signal, dev only: a built studio has no dev server behind it and
		// nothing to repack.
		const hot = import.meta.hot;
		hot?.on(REPACKED, reload);

		return () => {
			cancelled = true;
			clearTimeout(settle);
			hot?.off(REPACKED, reload);
			if (open) close(open);
			open = undefined;
		};
	});
</script>

<div class="app">
	<header class="head">
		<span class="mark">quillmark<span class="slash">/</span>studio</span>
		{#if catalog}
			<Picker {catalog} {picked} disabled={busy} onPick={pick} />
		{/if}
		<span class="state">
			{#if phase.kind === 'booting'}
				<span class="st-status" data-testid="phase">Opening…</span>
			{:else if phase.kind === 'opening'}
				<span class="st-status" data-testid="phase">Opening {phase.ref}…</span>
			{:else if phase.kind === 'failed'}
				<!-- The head says the STATE; what went wrong is a sentence, and it belongs
				     where the panes were and in the notes band, not on one line of chrome. -->
				<span class="st-status failed" data-testid="phase">Open failed</span>
				{#if held}
					<!-- The document is not gone with the quill that would not open: it waits
					     as text for the repack that fixes it. -->
					<span class="st-status" data-testid="held">Document held</span>
				{/if}
			{:else if open && open.carry.how !== 'seeded'}
				<!-- An open session says so by painting the page, so the only word here is
				     what a repack did to the document that was already in hand. -->
				<span class="st-status" data-testid="phase"
					>Repacked · document {open.carry.how === 'carried' ? 'carried' : 'reseeded'}</span
				>
			{/if}
		</span>
	</header>

	{#if open}
		<!-- Both surfaces bind their handles ONCE, on mount: `mount()` clears `open`
		     and waits a tick before freeing anything, so a new session arrives as a
		     remount of this block rather than as a prop swap the preview would
		     refuse to rebind. -->
		<div class="panes">
			<section class="pane edit" aria-label="Editor">
				<VisualEditor
					bind:this={editorRef}
					doc={open.doc}
					quill={open.quill}
					diagnostics={notes.diagnostics}
					onCaretMove={handleCaretMove}
					onChange={handleChange}
					onError={handleSurfaceError}
				/>
			</section>
			<section class="pane paint" aria-label="Preview">
				<Preview
					bind:this={previewRef}
					session={open.session}
					onCaretPick={handleCaretPick}
					onError={handleSurfaceError}
				/>
			</section>
		</div>
	{:else}
		<!-- Nothing is mounted, so the room the panes had says why: the message where
		     the paint would be, and the notes band below it with the code and the hint. -->
		<div class="vacant">
			{#if phase.kind === 'failed'}
				<p class="reason" data-testid="reason">{phase.message}</p>
			{/if}
		</div>
	{/if}

	<Notes {notes} />
</div>

<style>
	/* The whole viewport, three bands: the head, the panes, the errors. Studio is a
	   workspace rather than a page — it scrolls nowhere, and the panes below own their
	   overflow, so a surface holds still while its contents move. */
	.app {
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		height: 100dvh;
	}

	/* One line: whose surface this is, which quill, and the boundary's phase. */
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--st-space-2) var(--st-space-4);
		padding: var(--st-space-2) var(--st-space-4);
		border-bottom: var(--st-border-width) solid var(--st-border);
	}

	.mark {
		font-family: var(--st-font-mono);
		font-size: var(--st-text-label);
		font-weight: var(--st-weight-mid);
		letter-spacing: var(--st-track-label);
		text-transform: uppercase;
		color: var(--st-ink);
	}

	.slash {
		color: var(--st-ghost);
	}

	/* The phase reads off the end of the line, so the picker holds its position when
	   it clears. */
	.state {
		margin-inline-start: auto;
		min-width: 0;
	}

	.panes {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		min-height: 0;
	}

	/* One hairline between the two, and no resizer: studio hides its instruments, and
	   a divider that can be dragged is one. */
	.pane.paint {
		border-inline-start: var(--st-border-width) solid var(--st-border);
	}

	.pane {
		min-width: 0;
		min-height: 0;
		overflow: auto;
	}

	/* The mounting site, and the four properties THEMING §"What is behind the column
	   is yours" leaves to the host: the gutter, the scroll container, the page tone,
	   and the tail that lets the last card reach the middle of the pane. */
	.pane.edit {
		padding: var(--st-space-2) var(--st-space-2) var(--st-tail);
		background: var(--st-page);
	}

	/* The painted sheet sits inset on a tone of the host's own, so it reads against
	   the page rather than bleeding into it. */
	.pane.paint {
		padding: var(--st-space-2);
		background: var(--st-surface);
	}

	/* Where the panes were. It takes the same room so the bands do not move when a
	   quill stops opening, and it holds the one sentence that says why. */
	.vacant {
		display: grid;
		place-items: center;
		min-height: 0;
		padding: var(--st-space-4);
		background: var(--st-surface);
	}

	.reason {
		margin: 0;
		max-width: var(--st-measure);
		text-align: center;
		color: var(--st-alert);
		overflow-wrap: anywhere;
	}

	/* Below the width that fits two panes, the split stops being one: the panes stack
	   and the band scrolls, since two full-height mounts do not fit a phone. */
	@media (width < 60rem) {
		.app {
			grid-template-rows: auto minmax(0, 1fr) auto;
		}

		.panes {
			grid-template-columns: minmax(0, 1fr);
			grid-auto-rows: var(--st-mount);
			overflow: auto;
		}

		.pane.paint {
			border-inline-start: none;
			border-block-start: var(--st-border-width) solid var(--st-border);
		}
	}
</style>
