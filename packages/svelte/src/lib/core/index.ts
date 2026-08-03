// The theme derivation: the public dials → the private `--_qm-*` scale, applied
// to every `data-qm-root` element. Imported HERE because `core/` is the one module
// both `preview/` and `visual/` already pull, so a consumer cannot forget it and
// the derivation is minted once rather than re-declared per detached root
// (THEMING.md).
import './theme.css';

// `@quillmark/svelte/core`: what this package OWNS at the substrate seam.
//
// The `@quillmark/wasm` API is not re-exported: import it straight from the peer
// dependency, the single source of truth (quiver states the same rule). The
// handles cross this package's surfaces untouched (no wrapper types, per
// DOCUMENT_MODEL §What the editor owns), so the boundary needs no second door
// here. What earns a line is what more than one surface speaks and no other
// package declares: the address vocabulary and the error channel, plus the
// panic-hook install.

export { init } from './lifecycle.js';

// ── The address vocabulary ──────────────────────────────────────────────────
// Every hook naming a place speaks the canonical `DocPath`; `Place` is the caret
// payload the editor emits and the preview scrolls to. Declared here because both
// `/preview` and `/visual` name a place in their hooks: declared in either one,
// the other imports across a boundary the package keeps closed or declares its
// own copy.
export type { DocPath, Place } from './address.js';
// The hop between that vocabulary and the `Addr` the document verbs take, both
// directions: a host handed a path by a hook and holding a mutator needs it.
export { fieldPathForAddr, addrForFieldPath } from './address.js';

// ── The error channel ───────────────────────────────────────────────────────
// What every surface reports a recovered failure through, via its `onError` prop.
// The types are the contract; the reporting plumbing stays the package's own.
export type { EditorError, EditorErrorCode, EditorErrorHandler } from './errors.js';
