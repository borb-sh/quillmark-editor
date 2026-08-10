// `@quillmark/wasm` ships wasm-bindgen's web target: the core build is
// instantiated by an explicit `await init()`, which resolves to the classes and
// free functions — the artifact exports none of them statically, so awaiting is
// the only way to hold one. Instantiation carries the panic hook on its start
// section, so a Rust panic reaches JS as a stack trace.
import { init as initWasm, type CoreSurface } from '@quillmark/wasm';

let started: Promise<CoreSurface> | undefined;

/** The resolved surface, for the sync verbs below that cannot await one. */
let latched: CoreSurface | undefined;

/**
 * Instantiate the core WASM build and resolve to its surface. Await once before
 * any other boundary verb, from any surface's setup path; the promise is memoized,
 * so concurrent callers share one instantiation and repeat calls are free. A failed
 * init clears the memo, leaving a retry possible.
 *
 * The surface is the artifact's own, handed back unchanged: `const { Quill, Document }
 * = await init()` is the whole of a host's access to the classes, and this package
 * re-declares none of it.
 */
export function init(): Promise<CoreSurface> {
	if (started) return started;
	started = initWasm().then(
		(surface) => {
			latched = surface;
			return surface;
		},
		(err: unknown) => {
			started = undefined;
			throw err;
		}
	);
	return started;
}

/**
 * The surface synchronously, for this package's pure verbs: the `DocPath` formatter
 * on the public API and the codec inside a ProseMirror transaction, neither of which
 * can await. Package-internal, and read at the call rather than destructured at
 * module scope, so no module's import graph carries an ordering constraint.
 *
 * Reaching one before {@link init} resolves throws, naming the fix. This is the seam
 * that turns an awaited surface back into sync verbs, so it is the one place the
 * precondition the gate made structural has to be stated again.
 */
export function core(): CoreSurface {
	if (!latched) {
		throw new Error(
			'@quillmark/svelte: the WASM core is not initialized. Await `init()` from `@quillmark/svelte/core` before mounting a surface or calling a boundary verb.'
		);
	}
	return latched;
}
