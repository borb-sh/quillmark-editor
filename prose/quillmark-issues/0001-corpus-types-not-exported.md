# Corpus edit types are not exported from `@quillmark/wasm` root

**Package:** `@quillmark/wasm` 0.94.0
**Severity:** friction (worked around downstream; no functional block)
**Filed by:** @quillmark/editor Phase 1 integration
**Status:** RESOLVED in 0.95.1 — the runtime root now re-exports the whole
vocabulary (under the `Content*` genus, the 0.95 `RichText → Content` rename). The
editor's structural-derivation seam (`src/lib/core/wasm-types.ts`) collapsed to a
plain re-export from `@quillmark/wasm` and was deleted; only `DeltaOp` (the op
union of the exported `Delta`) stays derived, inline in `/core`.

## What

The runtime root (`runtime/runtime.d.ts`) re-exports the `Quill`/`Document`
classes, the render/session types, and the schema/diagnostic types — but not the
corpus edit vocabulary those classes' methods speak:

- `RichText`, `RichTextLine`, `RichTextContainer`, `RichTextMark`, `RichTextIsland`
- `Addr`, `Delta`, `Assoc`, `LineOp`, `MarkOp`, `ChangeBundle`
- `CardInput`, `PathStep`

They are declared in `core/wasm.d.ts`, but `@quillmark/wasm/core` is not an
exported subpath (the package `exports` map lists only `.`), so a consumer cannot
reach them there either.

## Reproduce

```ts
import type { Addr, RichText, ChangeBundle } from '@quillmark/wasm';
//                 ^ TS2305: Module '"@quillmark/wasm"' has no exported member 'Addr'.
```

## Why it matters

These are the exact types the op-grained edit surface consumes:
`doc.applyChange(addr: Addr, bundle: ChangeBundle)`, `doc.install(addr, rt:
RichText)`, `doc.revise(...) => Delta`. A consumer building a ProseMirror↔corpus
codec must name every one of them. They are the correctness core of an editor
integration, not an edge type.

## Workaround in use

Derived structurally off the re-exported `Document`/`mapPos` signatures
(`Parameters<Document['applyChange']>[0]`, etc.) in the editor's `/core` boundary
module. Drift-proof but indirect; every downstream consumer must re-derive or
depend on our re-export.

## Requested fix

Re-export the corpus types from the runtime root (a one-line `export type { … }
from '../core/wasm.js'` addition alongside the existing schema re-export), or
expose `@quillmark/wasm/core` as a documented subpath. The former keeps the
single-entry-point invariant the runtime doc emphasizes.
