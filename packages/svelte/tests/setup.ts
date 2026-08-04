// Instantiate the core once per worker, before any test body: every
// `@quillmark/wasm` export throws `runtime::not_initialized` until `init()`
// resolves.
import { init } from '@quillmark/wasm';

await init();
