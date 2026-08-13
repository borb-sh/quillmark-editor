# Changelog

`@quillmark/svelte`. An entry is written into `## Unreleased` by the change that earns it; a release promotes that body to its own version section.

## Unreleased

**A `plaintext` field no longer offers formatting.** Its leaf mounts a schema declaring no mark types, so the selection popover withholds itself over one — the way it never rises over the input a `string` field draws — `Mod-b`/`i`/`u` bind nothing, the markdown shorthands build no rule, and a paste lands as literal text. Formatting one was previously accepted by the commit and refused at render (`cannot coerce <plaintext> to type plaintext at <field>`), so an ordinary click broke the document with nothing on the write side able to catch it: a mark has to be unreachable rather than rejected. A value already carrying one opens as its text and drops the mark on its next commit, so a document an earlier build marked heals by being edited.

## v0.4.0 - 2026-08-13

**The `@quillmark/wasm` peer floor is `>=0.104.0-0`, where an array element's address is bracketed.** `FieldRegion.field` and `ContentHit.field` spell an element `main.keywords[0]` where 0.103 spelled it `main.keywords.0`, which is the spelling `Diagnostic.path` and `formatDocPath` already used: one address for one place, joining on string equality. Both hooks are typed `string`, so nothing upstream reports this — a consumer matching an address's children by prefix needs the `[` opener beside the `.`, and any heuristic reading a trailing all-digit field name as a lost index is dead.

The two places this package read one move with it. The preview's box fallback matches both opening characters, so a declared array still reaches the rows it prints. `elementAddrForFieldPath` reads the index segment alone: it took either spelling because the boundary minted one and formatted the other, and there is no longer a second spelling to bridge.

`enum:` on `type: string` is gone from `QuillFieldSchema`, upstream having retired the modifier: `type: enum` with `values:` is the one spelling of a finite string domain, and the schema echo re-emits every domain that way. A `string` field is a text control unconditionally. A quill still authored against the modifier now fails to parse at the boundary rather than reaching the editor.

**`# ` and `---` fire inside a list item**, where they stayed literal text. An input rule declines only where what it mints is unrepresentable or is a shape another gesture owns, never on how a quill renders it: `importMarkdown` produces `list_item > heading` from `- # title` and an item's own divider from `---` under one, so a rule refusing either refuses to author a shape a document arrives carrying. `- ` / `1. ` still decline at the head of an item that already exists, where Tab owns the nesting, and still retype a heading they wrap into a paragraph — `# ` inside the item is the gesture that mints a heading there.

## v0.3.1 - 2026-08-11

The preview's field-box overlay is gone, and with it the correlation bloom: a caret move or a `scrollToField` washed the address's boxes over the rendered page, which is ink on the surface a user proofs against, driven by a signal that fires per keystroke. Nothing replaces it — correlating the two panes on the page is unbuilt. `PreviewOptions.overlays` and the `<Preview overlays>` prop are removed, as are the `.qm-field-box` elements and their `data-qm-field` attribute; a consumer drawing its own overlay targets `.qm-page` and `data-page` as before. The scroll commands are unaffected: they measure a throwaway marker and never read a box. The editor's own arrival wash stays, so a landing on a leaf still blooms inside it.

## v0.3.0 - 2026-08-11

## v0.2.0 - 2026-08-09

**The `@quillmark/wasm` peer floor is `>=0.103.0-0`**, where the init gate is the only door to the classes. `Quill`, `Document`, `importMarkdown`, `exportMarkdown`, `rebase`, `mapPos`, `parseDocPath` and `formatDocPath` are not static exports of the artifact; `init()` resolves to them, so `const { Quill, Document } = await init()` is what a host writes in place of the value import beside it. `Engine`, `MAIN_CARD_ADDR`, `isQuillmarkError` and the open-set guards are unchanged, as are the `Quill` / `Document` **type** exports, so an annotation and an `import type` compile untouched.

`init` from `/core` hands that surface straight back and latches it for the verbs here that cannot await one: `fieldPathForAddr` and `addrForFieldPath` on the public API, and the codec inside a ProseMirror transaction. Reaching one before the gate resolves throws naming the fix rather than reading `undefined` off the artifact. A host awaits `init()` where it already did, at each entry point that needs a class.

## v0.1.1 - 2026-08-08

The package claims `sideEffects: true`, so a consumer's bundler keeps the stylesheets its modules import for effect. Under the previous `["**/*.css"]` every module the globs missed was prunable, and Rollup dropped all four sheet-carrying edges. With `core/theme.css` gone every `--_qm-*` rung was undefined, so every declaration reading one was invalid at computed-value time and dropped: controls with no border, no background and no padding, under chrome that read as intact. `codec/prose.css` and ProseMirror's own two sheets went the same way, taking the prose reset and the structural rules a view needs to render. A bundled consumer now takes the surfaces whole; an unbundled one was never affected.

## v0.1.0 - 2026-08-08

First published version. The surfaces over a `@quillmark/wasm` session ship under three subpaths: `/core` (the `DocPath`/`Place` address vocabulary, the `EditorError` channel, `init`), `/preview` (`createPreview` + `<Preview>`), `/visual` (`<VisualEditor>` and the codec's `createField` leaf). `svelte@^5` and `@quillmark/wasm` are peers: the consumer owns the session and the handles cross untouched. Pre-1.0, so a minor is where a break lands.

Reading a document's canonical markdown is `doc.toMarkdown()` on the `@quillmark/wasm` handle, so no subpath wraps it: a read-only mirror is that call in a `<pre>`, which the README shows and the playground's debug drawer works out in full.

A fourth subpath is CSS: `/preset` is the endorsed look for the page around a surface, opt-in and never side-effect imported. Each surface owns its own column (the gutter, the tone, the preview's desk) and `class="qm-pane"` makes the editor a scroll container with a tail, so a bare `<div>` is a mounting site and nothing is owed before the surface looks right.

The `@quillmark/wasm` peer floor is `>=0.102.0-0`: `init` returns the instantiation promise the lifecycle memoizes rather than installing a panic hook, and a content field comes to rest through `doc.overwrite`, which 0.101 spells `install`. The prose leaf reads its corpus through `reader.getContent`, which decodes a content field by its declared type: a `plaintext` field keeps the markdown characters its author typed, on a document built through either door.

A table island is edited in place. A `table` island rendered as the literal `[table]` and had no way in; it is now a NodeView holding one nested inline-schema prose leaf per cell. Cell text and marks keep the cell-local coordinate space the boundary declares, an identity anchor inside a cell is preserved and rebased rather than dropped, and every edit lowers through the island channel, so the field's anchors survive a keystroke in a cell. Tab traverses cells and appends a row past the last; Enter is the next row, which is the only thing a cell with no line concept can mean.

Its chrome is two `+` strips (one per growing edge) and one handle per body row and column, each raising that line's menu: insert either side, delete, and for a column the four alignments — the one table capability the content round-trips and nothing in the editor could reach. The count does not grow with the rectangle. Rows and columns hold entry order and offer no reorder, matching the rule array fields already state.

The island's wording joins the `strings` set (`tableAddRow`, `tableInsertColumnLeft`, `tableAlignCenter`, …), and `createField` takes an `onIslandMenu` channel the chrome draws that menu through.

The insert surface's keyboard door: `/` at a word boundary raises a filtered menu of block constructs over the caret — a table, the three headings, both lists, a quote, a code block, a divider — and a pick consumes exactly the trigger run in one commit. The trigger is gated on the leaf's schema (a constrained inline or plaintext leaf has none) and on the word boundary, so `and/or` and a URL stay prose; ↑/↓/Enter/Escape belong to the leaf's keymap, so the caret never leaves the text the insert is measured against. A table pick mints the next positional island id and lands the caret in the first cell.

The menu's wording joins the `strings` set (`slashTable`, `slashBulletList`, …), and each label is its own search key, so a translated menu filters in the language it displays. The selection popover no longer raises over a node selection, which has no text to format.

An island edit commits as ops rather than an install. A table's cells and an image's url live in the island entry, not in the content text, so an edit to one produced no delta and no ops at all and never reached the store. It now lowers through the `islandOps` channel: a changed payload is `set`, a slot the text splice may not carry is `insert`, and a deleted island rides the delta that drops its slot. Every identity anchor in the field survives an island edit, and an island's `loss` class is carried by the projection instead of restamped `lossless` on every write.

The preview's follow-the-caret scroll moves the pane only when the caret has left the fold, and moves its own scrollport when it does. `focusPosition` is the continuous hop (one call per keystroke and per arrow key), so centring on every call took the pane back from the user on all of them, and re-centred a preview click on a point that click already had on screen; the change-guard now mirrors the correlation bloom's. `scrollToField` stays unguarded: a discrete "show me this field" centres every time.

The scroll is written as `container.scrollTop` rather than `scrollIntoView`, which walks every scrollable ancestor: a host whose document scrolls had the whole page dragged to the preview by a keystroke in the editor, taking the editor off screen.

`refresh` re-locates the last followed caret. `session.locate` answers against the last compiled layout while a consumer debounces `update`, so a caret typed past that layout is off-content for the whole burst and the pane sits still until some later caret event asks again.

`onCaretMove` reports a place rather than a transaction. A leaf dispatches one caret signal per transaction and a transaction need not have moved the caret to exist, so a repeat of the place last reported no longer reaches a consumer; the memo spans leaves, so a place left and returned to still reports twice.
