// WASM lifecycle. The core build (`Quill`/`Document`/codec) loads eagerly on
// first import via wasm-bindgen's bundler target, so no async bootstrap gates
// use; `init()` only installs the panic hook that turns a Rust panic into a
// legible JS error. Idempotent: the hook installs once per page regardless of
// how many surfaces call it, so every entry point may call it defensively.
import { init as installPanicHook } from '@quillmark/wasm';

let installed = false;

/**
 * Install the WASM panic hook once. Safe to call from any surface's setup path;
 * repeat calls are no-ops. Optional (the boundary works without it), but a
 * panic surfaces as a readable error only after it runs.
 */
export function init(): void {
	if (installed) return;
	installPanicHook();
	installed = true;
}
