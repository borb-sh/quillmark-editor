# The Editor Session API

> **Status**: proposal, not canon. The shape argued for in the consumer-surface review; nothing here is built. Canon describes what is, so this lives outside `prose/canon/` until it ships, at which point it is deleted and `ARCHITECTURE`, `VISUAL_EDITOR`, `PREVIEW` and `DOCUMENT_MODEL` carry it.

## TL;DR

There is one editing session, and the surfaces are views over it. The package does not say that anywhere, so every consumer says it instead: it opens four handles in dependency order, holds three component refs, wires four hops between them, debounces one of them by hand, and remembers a `{#key}` on all three when the document changes. `openEditor()` says it once. A consumer writes one call and three components, and the wiring, the lifecycle, the document swap, the error channel and the wording contract come with it.

Everything below is a rewrite, not an addition: it subsumes the fourteen consumer-surface findings and the six mechanisms a patch-per-finding pass produced.

## What a consumer writes today

Six lines to open, three to tear down, and none of them are the consumer's problem:

```ts
init();
const quill = Quill.fromTree(tree);
const doc = quill.seedDocument();
const session = await new Engine().open(quill, doc);
// … and free() session, doc, quill on teardown, in that order.
```

Then the shell. The reference one is `src/routes/editor/+page.svelte`: a debounced recompile, a repaint, a re-serialize, two caret hops, and a handler that reads `doc.cards.map(c => c.kind)` on the keystroke path because the bridge's signature asks for it. Around a hundred lines, of which the consumer's own is the split pane.

Three of those hops are load-bearing and undocumented as such:

- A prose edit emits no change signal. `bump()` (`visual/VisualEditor.svelte`) is the only `onChange` caller and every call site is a scalar or structure mutation; a prose commit lowers through `core/codec/field.ts` and reports only `onCaretMove`. A consumer wiring the two as the README does gets a preview that never updates while typing.
- `onCaretMove` fires on every transaction, so the shell that corrects for that recompiles on every arrow key.
- All three surfaces bind their handle in `onMount` and ignore a later prop change. The documented fix is `{#key doc}`; nothing raises when it is missing.

Each is a real defect and each has a one-site fix. The fixes are not the interesting part: **the shell is the part every consumer rewrites, and every one of these defects is a shell-layer fact the package declined to own.**

## The shape

### One door in

```ts
import { openEditor } from '@quillmark/editor';

const qm = await openEditor({
	quill: tree, // Map<string, Uint8Array> | Quill
	document: markdown, // string | Document | undefined → quill.seedDocument()
	strings, // Partial<QuillmarkStrings>
	onError, // (e: EditorError) => void
	onApply, // (c: ChangeSet) => void
	debounce: 120
});
```

`openEditor` installs the panic hook (idempotent), builds the `Quill` if handed a tree, seeds or parses the `Document`, opens the `LiveSession`, and returns a handle that owns all four. It throws with the failing step named; a partial open frees what it built.

```ts
interface EditorSession {
	readonly quill: Quill;
	readonly doc: Document;
	readonly session: LiveSession;

	/** The document revision the last apply compiled. */
	readonly revision: number;
	/** Registered surfaces, for a host driving its own chrome. */
	readonly editor: EditorHandle | undefined;
	readonly preview: PreviewHandle | undefined;

	/** Swap the document. Same quill: an apply plus a surface rebind. */
	open(next: Document | string): Promise<void>;
	/** Schedule a recompile. Gated on the document's revision, so a redundant
	 *  call is free and a missing one is recovered by the next. */
	touch(hint?: ChangeSource): void;
	/** Recompile now, dropping a pending one. */
	flush(): void;
	destroy(): void;
}
```

The handles stay reachable and stay quillmark's. Nothing here wraps a `Document`; `qm.doc` is the handle, and every verb on it works. What the session owns is what a consumer should not have to re-derive: open order, teardown order, the recompile schedule, the document swap, and who is wired to whom.

### The surfaces take the session

```svelte
<VisualEditor {qm} />
<Preview {qm} />
<SourceView {qm} />
```

That is the whole integration. Each surface registers with the session on mount and unregisters on destroy; the session forwards `onCaretPick` to the editor and `onCaretMove` to the preview when both are registered, and forwards nothing when they are not. The two surfaces still never import each other — the session is the seam, which is the layer the bridge always lived at.

Per-surface props are the ones that genuinely vary per instance and nothing else: `class`, `style`, rest props, `diagnostics`, `enumOptionAllowed`, `cardActions` on the editor; `margin`, `overlays`, `zoom`, `message` on the preview.

`bridge: false` on `openEditor` opts out of the automatic caret hops for a consumer routing them itself. Two editors on one page over one session both register; the last mount wins the bridge and the session reports the collision through `onError` as a `dev` violation. Two editors over two documents are two sessions, which is the shape that already works.

### The vanilla constructors stay

```ts
createPreview({ qm, container });
createPreview({ session, container }); // no session object needed
createSourceView({ qm, container });
createField({ doc, addr, container });
```

One options object each, `qm` accepted wherever the raw handles are. A non-Svelte host either drives the constructors and writes its own four hops — which is what it does today — or builds an `EditorSession` and gets them. `/preview` still reaches `/core` and nothing else, so the reserved `@quillmark/preview` promotion is untouched.

### Recompile is gated on the revision

The session schedules an apply on any signal and **skips it when `doc.revision` has not moved** since the last one. The counter is upstream's, monotonic per handle, bumped by every mutator and no read.

- An arrow key costs nothing. Today it costs an apply that is a cheap no-op, which is a different thing from free.
- A consumer mutating the document through its own button gets a repaint without knowing to call anything.
- A signal a future mutator forgets to emit degrades to a delayed repaint, not a stale preview. The counter is an upper bound on real changes, never a lower one, so gating on it can do redundant work and cannot miss work.

`onChange` therefore stops being the wiring and becomes what a host actually wants it for: dirty flags, autosave, undo labels, analytics. It reports `{ source, path? }` where `source` is `'prose' | 'field' | 'structure'`, and the session — not the consumer — decides that a structure op applies at once while a keystroke burst settles for `debounce`.

### One address vocabulary in public

Canonical `DocPath` strings, everywhere a hook speaks a place:

```ts
interface Place {
	/** `main.subject` / `main.body` / `cards.<kind>[i].<field>`. */
	field: DocPath;
	/** The caret in USV. */
	pos: number;
}
```

Declared once, in `/core`. `Diagnostic.path`, `ContentHit.field` and `FieldRegion.field` already speak this grammar; the editor's hooks currently speak `Addr` and `fieldPathForAddr(addr, kinds)` is the toll every consumer pays at the boundary between them. Emitting both addressings in every payload removes the toll and keeps the two vocabularies, which is the patch rather than the design.

`Addr` stays exported from `/core` for a consumer driving `doc.applyChange` / `doc.storeField` directly — it is the mutator currency and belongs there — with `addrForPath(path, kinds)` and `pathForAddr(addr, kinds)` beside it. Where an index is what the caller needs, the payload carries the index rather than an `Addr`: `CardContext` gives `{ path, kind, index, isMain }`.

The consequence worth naming: `onCaretMove={qm.preview.focusPosition}` is a pass-through, and so is `onCaretPick → editor.setCaret`. Both hops are the identity function because both surfaces speak one grammar, not because a payload carries two.

### The verbs are on the handle

```ts
interface EditorHandle {
	setCaret(at: Place): void;
	focusField(path: DocPath): void;
	insertCard(card: CardInput, after?: number): void;
	removeCard(index: number): void;
	moveCard(from: number, to: number): void;
	setKind(index: number, kind: string): void;
}
```

The editor owns card identity — a stable session id per card, resolved to an index only at the mutation boundary — so a consumer calling `doc.insertCard` behind it leaves that array a position short and every later address off by one, silently. Handing the verbs to a card-header snippet fixes that for a card-header button. A host toolbar, a command palette, or a keyboard shortcut in the shell is at least as common and has no door at all; `qm.editor` is that door, and `CardContext` becomes the bound convenience view of it.

Then harden what is underneath, because an API rule is not a safety mechanism: **the id array reconciles against the document on each derive** rather than assuming lockstep — exactly via `$id` and `doc.cardIndexById` where a card carries one, else by length and kind. An external `doc.insertCard` costs the new card a fresh session id instead of shifting every later address by one. This is an invariant, not surface area, and it retires the whole class of bug rather than the instance the snippet would have caused.

### Swapping the document is a verb

`qm.open(next)` replaces the remount contract. The `LiveSession` recompiles against any document built on the same quill, so a same-quill swap is an `apply` plus a rebind, not a re-open.

The rebind is the editor's work and it is the reseed it already does at mount: the card-id array, the `IdSeq`, the leaf registry, the active address, the commit-error map. Doing it on a registration event rather than only in `onMount` is what turns a documented `{#key doc}` — and the dev-mode warning proposed for its absence — into a verb that works.

### Wording is one contract

One `QuillmarkStrings`, namespaced by surface, passed to `openEditor` and delivered to the surfaces by context. A consumer wiring i18n wires it once, not once per surface. The empty-body placeholder is the entry that takes a function and keeps its once-per-kind cache; every accessible name in the editor is a key, because a control whose only label is a glyph is named here or is unnamed in the reader's language.

The preview needs no strings of its own: **the vanilla core reports its state and the Svelte wrapper renders it**, as a `message` snippet with a default. A framework-free core writing English into the DOM is what forced a second wording contract into existence; moving the three message states to the layer that can render them deletes the contract and the `messages` opt-out with it.

Diagnostics are the hole this does not close on its own. A product that overrides every key still shows every validation error, every commit refusal and every parse warning in English, because `Diagnostic.message` is quillmark's text. `formatDiagnostic?: (d: Diagnostic) => string` on the session is the seam; what makes it usable is the upstream ask below.

### One error channel, two severities

```ts
interface EditorError {
	code: EditorErrorCode;
	severity: 'error' | 'dev';
	message: string;
	cause?: unknown;
	path?: DocPath;
	page?: number;
}
```

`onError` on the session covers every surface, because every surface is registered to it. Absent, each site writes the `console.error` it writes today. `severity` separates a paint failure an app routes to telemetry from a contract violation aimed at the developer building against the package — without it, every consumer's sink filters two codes by hand. `qm.open()` retires the `rebind` code outright; the remaining `dev` member is the bad-dial guard.

### Theming is unchanged, and three of its claims become true

The ten dials, the private `--_qm-*` scale, and the mounting-site properties stay exactly as `THEMING.md` states them. Three enforcement gaps close, none of which is API:

- Register the private length rungs with `@property` so `--qm-space: 4` is invalid at computed-value time and contained at one rung instead of collapsing every `calc()` downstream. The constraint `THEMING.md` cites applies to registering the public dial, not the private rung the derivation reads it into.
- Name the cascade layers (`qm.scale`, `qm.chrome`) in `THEMING.md` with the `@layer qm, app;` prelude. A consumer who declares their own layers in their entry loses to the package in both bundler orders without it; layer names are global, so the prelude alone is enough and no CSS subpath export is needed.
- Name the stable `qm-*` class set as contract and census it in `check:style`, which already censuses the dials. Give the rhythm and stroke axes the marker lane the colour axis has, so a geometry value minted in `.ts` stops walking past the gate.

## What this deletes

| Gone | Replaced by |
| --- | --- |
| `@quillmark/editor/bridge`, `connect()`, `editorProps`/`previewProps`, the getter dance | registration |
| Three `bind:this` refs in every shell | `qm.editor` / `qm.preview` |
| The `{#key doc}` remount contract and its dev-mode identity guard | `qm.open(next)` |
| `onError` on five constructors | one on the session |
| `strings` on three surfaces, `PreviewStrings`, `bodyPlaceholder` as its own prop | one `QuillmarkStrings` |
| `messages: boolean` on the preview core | the wrapper's `message` snippet |
| `fieldPathForAddr` on the keystroke path; `Addr` in every payload | `DocPath` in the hooks |
| The consumer's hand-copied debounce and `flush()` discipline | the session's schedule, revision-gated |

Six mechanisms and a subpath, for one session object and a registration call.

## What it costs

**It inverts a canon position.** `ARCHITECTURE` §"Core vs chrome" has the consumer owning lifecycle. That position is right about layering — the vanilla core still carries the substance and the constructors still take raw handles — and wrong about defaults, for a pre-release library whose cold-consumer probes could not find the load path at all. The session is the default; the handles are the escape hatch, and they are not hidden.

**A session object is state a host already has an opinion about.** A host with its own store now holds an object it did not create and cannot serialize. Mitigations, all real: the session is a plain object, not a framework primitive; it holds no reactive state a host must observe; and every handle on it is reachable, so a host that wants to drive `session.apply` itself calls `bridge: false`, ignores `touch`, and is exactly where it is today.

**SSR.** `openEditor` is client-only, as the WASM boundary already is. The surfaces mount in `onMount` today and that does not change; a SvelteKit host calls `openEditor` in `onMount` or behind a `browser` guard, which is what the playground's dynamic-import dance already does for the same reason.

**Registration is mount-order sensitive.** The bridge wires whatever is registered at the time an event fires, so a surface that mounts late is wired the moment it does and one that never mounts is skipped. That is the same property `connect()`'s getters bought, without the getters.

## Upstream, in `borb-sh/quillmark`

Three of the four asks from the last round are built on the spike branch and should land: `doc.revision`, `doc.cardKinds`, `doc.getContent(addr)`, and coded binding errors. The revision counter is the load-bearing one here, and it is under-credited as a "change counter a framework binding rebuilds by hand": it is what lets a recompile schedule be robust to a signal that never arrives.

**Structured `args` on `Diagnostic` is the one still open, and it is the one that matters most.** Codes make routing possible; args make an interpolated value recomposable in another language. Until they exist, the editor's wording contract is complete for the chrome and cosmetic for everything the engine says, which is most of what a user reads when something is wrong.

Python parity for `getContent` / `revision` is real and does not block this.

## Open questions

- **`DocPath`-only in the hooks** trades a struct for a string parse at the sites that need an index back. The card verbs take indices, so the sites are few; the measurement that would settle it is a cold-consumer probe on both shapes, which is the method this review already established works.
- **Where `EditorSession` lives.** The root barrel is `/core` re-exported today, and the session is framework-free, so the root is its natural home. It must not become a module `/preview` reaches.
- **Whether `open()` should also swap the quill.** A different quill needs a real `engine.open`, so the signature is already async; whether a consumer wants that verb or a second session is not obvious from here.
