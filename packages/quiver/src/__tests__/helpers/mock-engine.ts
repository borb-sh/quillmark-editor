import { vi, type MockInstance } from 'vitest';
import { init, type Quill } from '@quillmark/wasm';

const core = await init();

/**
 * Stubs `Quill.fromTree` so tests can exercise `Quiver.getQuill` without the real
 * WASM validator. Each call records the tree it was given and returns a fresh
 * fake `Quill`, whose identity is what the caching and coalescing tests read.
 *
 * `calls` holds the trees in order; `restore()` undoes the stub.
 */
export function mockQuillFromTree(): {
	calls: Array<Map<string, Uint8Array>>;
	spy: MockInstance;
	restore: () => void;
} {
	const calls: Array<Map<string, Uint8Array>> = [];
	const spy = vi
		.spyOn(core.Quill, 'fromTree')
		.mockImplementation((tree: Map<string, Uint8Array>): Quill => {
			calls.push(tree);
			return { seedDocument: () => ({}) } as unknown as Quill;
		});
	return { calls, spy, restore: () => spy.mockRestore() };
}
