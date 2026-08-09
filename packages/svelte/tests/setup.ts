// Instantiate the core once per worker, before any test body. Through `$lib/core`
// rather than the artifact directly: the package's gate is what latches the surface
// its sync codec reads (`core/lifecycle.ts`), so a suite touching the codec needs
// this door and not the one under it. Both are memoized, so a module that awaits
// `init()` again for the classes pays nothing.
import { init } from '$lib/core';

await init();
