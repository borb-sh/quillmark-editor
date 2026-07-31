/**
 * Real-engine integration test.
 *
 * Every other render-path test in the suite drives a MOCK engine
 * (`preview.test.ts` `makeEngine()`, `integration.test.ts` "mock render"). This
 * file is the only one that wires a TRUE `new Engine()` from `@quillmark/wasm`
 * to a quiver-materialized core `Quill` and renders end-to-end: it loads the
 * private Typst backend binary, clones the core handles across the WASM-memory
 * seam, and produces real artifact bytes.
 *
 * It pins quiver's side of two canonical contracts:
 *   1. a core `Quill` from `getQuill` passes straight to `engine.render` — no
 *      boundary-crossing helper is needed (the Engine hides the seam);
 *   2. the Engine CLONES the quill, it never consumes it — the same `Quill`
 *      renders a second time.
 *
 * The Typst backend load makes this the slowest test in the suite (seconds).
 * It is kept in its own file with two `it()`s so it stays cheap to skip
 * locally.
 */

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { Engine } from "@quillmark/wasm";
import { Quiver } from "../node.js";

// The same fixture `preview.test.ts` uses: quills `memo@1.0.0` and
// `plain@1.0.0`, both `backend: typst` (see their `Quill.yaml`), both
// render-complete — a comment-only `template.typ` compiles to a valid PDF.
const PREVIEW_FIXTURE = fileURLToPath(
  new URL("./fixtures/preview-quiver", import.meta.url),
);

describe("Engine.render against a quiver quill", () => {
  it("renders a fixture quill end-to-end with a real Engine", async () => {
    const quiver = await Quiver.fromDir(PREVIEW_FIXTURE);
    const engine = new Engine();

    const quill = await quiver.getQuill("memo@1.0.0");
    // The fixture declares `backend: typst`; the Engine routes on this.
    expect(quill.backendId).toBe("typst");

    const doc = quill.seedDocument();
    try {
      const result = await engine.render(quill, doc);

      expect(result.artifacts.length).toBeGreaterThan(0);
      const [artifact] = result.artifacts;
      expect(artifact.bytes).toBeInstanceOf(Uint8Array);
      expect(artifact.bytes.length).toBeGreaterThan(0);
    } finally {
      doc.free();
    }
  }, 60000);

  it("clones the quill on render — the same handle renders twice", async () => {
    const quiver = await Quiver.fromDir(PREVIEW_FIXTURE);
    const engine = new Engine();

    const quill = await quiver.getQuill("memo@1.0.0");
    expect(quill.backendId).toBe("typst");

    // First render.
    const first = quill.seedDocument();
    try {
      const result = await engine.render(quill, first);
      expect(result.artifacts.length).toBeGreaterThan(0);
    } finally {
      first.free();
    }

    // The Engine clones into backend memory and frees the clone — the source
    // `Quill` is untouched, so a second render with the SAME handle succeeds.
    expect(quill.backendId).toBe("typst");
    const second = quill.seedDocument();
    try {
      const result = await engine.render(quill, second);
      expect(result.artifacts.length).toBeGreaterThan(0);
      expect(result.artifacts[0].bytes.length).toBeGreaterThan(0);
    } finally {
      second.free();
    }
  }, 60000);
});
