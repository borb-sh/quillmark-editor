// The WASM init gate. `@quillmark/wasm` ships wasm-bindgen's web target, so the
// core build is instantiated by an explicit `init()` and every export throws
// `runtime::not_initialized` until it resolves. Awaiting here runs it once per
// worker, before any test body.
import { init } from '@quillmark/wasm';

await init();
