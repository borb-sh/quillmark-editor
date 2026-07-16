# `applyChange` cannot create a `continues` (hard-break / code-internal) line

**Package:** `@quillmark/wasm` 0.94.0
**Severity:** friction (worked around downstream via a narrow `install` fallback)
**Filed by:** @quillmark/editor Phase 3 (codec)

## What

A `RichTextLine` carries a `continues` flag: a `\n` that is a *within-block* hard
line break (a paragraph hard break, a code fence's interior) rather than a new
block. It is the difference between one code block of three lines and three
separate code blocks.

The `LineOp` vocabulary the `applyChange` bundle accepts —
`split{at}` / `join{line}` / `setKind` / `setContainers` — has **no way to set or
clear `continues`.** Verified empirically (probes in
`scratchpad/probe6-out.txt`):

- A `\n` inserted through the text `delta` creates a line with `continues:false`.
- `split{at}` likewise yields `continues:false` (`[code] "ab"` split at 1 →
  `[code, code]`, both `continues:false`, i.e. two code blocks).
- `setKind` to `code` on a delta-split line does not make it `continues`.
- `install` *does* store `continues:true` and the corpus preserves it — so the
  flag is real and round-trips through value writes, just not through op writes.

## Why it matters

An op-based editor (the whole point of `applyChange` over `install`, so anchors
survive) cannot represent two common edits:

- **Shift+Enter / hard break** inside a paragraph.
- **Enter inside a code block** (adding an interior line).

Both need a new `continues:true` line. Lowered op-wise they instead split the
block in two, so `decode` of the stored corpus no longer matches the editor's PM
document.

## Workaround in use

`encode.ts` routes all text (including `\n`) through the `delta` and emits only
`setKind` / `setContainers` line ops; when the line metadata is unchanged it emits
no line ops at all, so **text and mark edits *within* an existing code block or
hard-break paragraph lower correctly** (the `continues` flags ride through
untouched). Only the *creation* of a new `continues` line is unreachable.

`structureNeedsInstall(oldRt, newRt)` detects that case (new `continues` count >
old) and the field falls back to `doc.install(addr, newRt)` — correct output at
the cost of that field's identity anchors for that one edit (the design's
sanctioned narrow paste/structural fallback).

## Requested fix

Add a line op that sets the `continues` flag — e.g.
`{ op: "setContinues"; line: number; continues: boolean }` — or make `split{at}`
take a `continues` option. Either lets a hard break and a code-block interior
line lower op-wise, so identity anchors survive those edits too.
