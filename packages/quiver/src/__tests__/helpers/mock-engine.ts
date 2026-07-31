import { vi, type MockInstance } from "vitest";
import { Quill } from "@quillmark/wasm";

/**
 * Stubs `Quill.fromTree` so tests can exercise `Quiver.getQuill` without the
 * real WASM validator (quill construction is now engine-free — `getQuill`
 * calls `Quill.fromTree(tree)` directly). Each call records the tree it was
 * given and returns a fresh fake `Quill` whose identity tracks the
 * caching/coalescing behavior under test.
 *
 * Returns `calls` (the trees passed to `Quill.fromTree`, in order) and a
 * `restore()` to undo the stub. Install in `beforeEach`/at test top and call
 * `restore()` after.
 */
export function mockQuillFromTree(): {
  calls: Array<Map<string, Uint8Array>>;
  spy: MockInstance;
  restore: () => void;
} {
  const calls: Array<Map<string, Uint8Array>> = [];
  const spy = vi
    .spyOn(Quill, "fromTree")
    .mockImplementation((tree: Map<string, Uint8Array>): Quill => {
      calls.push(tree);
      return { seedDocument: () => ({}) } as unknown as Quill;
    });
  return { calls, spy, restore: () => spy.mockRestore() };
}
