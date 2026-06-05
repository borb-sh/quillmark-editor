import type { Quillmark, Quill } from "@quillmark/wasm";

/**
 * In-test mock for the Quillmark engine. Records every `engine.quill(tree)`
 * call. The mock implements only the slice of the engine contract Quiver
 * exercises, so it is cast to the real `@quillmark/wasm` types.
 */
export function makeMockEngine(): {
  calls: Array<Map<string, Uint8Array>>;
  engine: Quillmark;
} {
  const calls: Array<Map<string, Uint8Array>> = [];
  const engine = {
    quill(tree: Map<string, Uint8Array>): Quill {
      calls.push(tree);
      return { render: () => ({ ok: true }) } as unknown as Quill;
    },
  } as unknown as Quillmark;
  return { calls, engine };
}
