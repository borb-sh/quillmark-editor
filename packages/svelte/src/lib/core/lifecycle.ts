// WASM lifecycle. `@quillmark/wasm` ships wasm-bindgen's web target: the core
// build is instantiated by an explicit `await init()`, and every export throws
// `runtime::not_initialized` until it resolves. Instantiation carries the panic
// hook on its start section, so a Rust panic reaches JS as a stack trace.
import { init as initWasm } from '@quillmark/wasm';

let started: Promise<void> | undefined;

/**
 * Instantiate the core WASM build. Await once before any other boundary verb,
 * from any surface's setup path; the promise is memoized, so concurrent callers
 * share one instantiation and repeat calls are free. A failed init clears the
 * memo, leaving a retry possible.
 */
export function init(): Promise<void> {
	if (started) return started;
	started = initWasm().catch((err: unknown) => {
		started = undefined;
		throw err;
	});
	return started;
}
