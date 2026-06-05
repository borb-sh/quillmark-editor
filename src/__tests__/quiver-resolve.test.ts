import { describe, it, expect } from "vitest";
import { Quiver } from "../node.js";
import type { Quillmark, Quill } from "@quillmark/wasm";
import { makeMockEngine } from "./helpers/mock-engine.js";

const SAMPLE_FIXTURE = new URL("./fixtures/sample-quiver", import.meta.url)
  .pathname;

// ─── resolve ──────────────────────────────────────────────────────────────────

describe("Quiver.resolve", () => {
  it('1. unqualified "memo" → "memo@1.1.0" (highest)', async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    expect(await quiver.resolve("memo")).toBe("memo@1.1.0");
  });

  it('2. "memo@1" → "memo@1.1.0" (highest 1.*.*)', async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    expect(await quiver.resolve("memo@1")).toBe("memo@1.1.0");
  });

  it('3. "memo@1.0" → "memo@1.0.0" (highest 1.0.*)', async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    expect(await quiver.resolve("memo@1.0")).toBe("memo@1.0.0");
  });

  it('4. "memo@1.0.0" → "memo@1.0.0" (exact)', async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    expect(await quiver.resolve("memo@1.0.0")).toBe("memo@1.0.0");
  });

  it('5. "memo@2.0.0" (not present) → quill_not_found', async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    await expect(quiver.resolve("memo@2.0.0")).rejects.toThrow(
      expect.objectContaining({ code: "quill_not_found" }),
    );
  });

  it('6. "memo@^1" → invalid_ref (from parseQuillRef)', async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    await expect(quiver.resolve("memo@^1")).rejects.toThrow(
      expect.objectContaining({ code: "invalid_ref" }),
    );
  });

  it('7. "" (empty string) → invalid_ref', async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    await expect(quiver.resolve("")).rejects.toThrow(
      expect.objectContaining({ code: "invalid_ref" }),
    );
  });

  it("8. unknown name → quill_not_found", async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    await expect(quiver.resolve("nonexistent")).rejects.toThrow(
      expect.objectContaining({ code: "quill_not_found" }),
    );
  });
});

// ─── getQuill ─────────────────────────────────────────────────────────────────

describe("Quiver.getQuill", () => {
  it("9. canonical ref returns mock Quill; engine.quill called with tree containing Quill.yaml", async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    const { calls, engine } = makeMockEngine();

    const quill = await quiver.getQuill("memo@1.0.0", { engine });

    expect(quill).toBeDefined();
    expect(typeof quill.render).toBe("function");
    expect(calls).toHaveLength(1);
    expect(calls[0]!.has("Quill.yaml")).toBe(true);
  });

  it("10. selector ref resolves and returns a quill", async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    const { engine } = makeMockEngine();

    const a = await quiver.getQuill("memo", { engine });
    const b = await quiver.getQuill("memo@1.1.0", { engine });

    // Both resolve to memo@1.1.0 → identical cached instance.
    expect(a).toBe(b);
  });

  it("11. same canonical ref returns cached instance (identity equality)", async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    const { engine } = makeMockEngine();

    const quill1 = await quiver.getQuill("memo@1.0.0", { engine });
    const quill2 = await quiver.getQuill("memo@1.0.0", { engine });

    expect(quill1).toBe(quill2);
  });

  it("12. engine.quill called exactly once for repeated getQuill of same ref", async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    const { calls, engine } = makeMockEngine();

    await quiver.getQuill("memo@1.0.0", { engine });
    await quiver.getQuill("memo@1.0.0", { engine });

    expect(calls).toHaveLength(1);
  });

  it("13. concurrent calls for same ref coalesce into one engine.quill call", async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    const { calls, engine } = makeMockEngine();

    const [a, b] = await Promise.all([
      quiver.getQuill("memo@1.0.0", { engine }),
      quiver.getQuill("memo@1.0.0", { engine }),
    ]);

    expect(a).toBe(b);
    expect(calls).toHaveLength(1);
  });

  it("14. distinct engines get distinct cached quills", async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    const { engine: e1 } = makeMockEngine();
    const { engine: e2 } = makeMockEngine();

    const q1 = await quiver.getQuill("memo@1.0.0", { engine: e1 });
    const q2 = await quiver.getQuill("memo@1.0.0", { engine: e2 });

    expect(q1).not.toBe(q2);
  });

  it('15. getQuill("memo@1.2.3") (version not present) → quill_not_found', async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    const { engine } = makeMockEngine();

    await expect(quiver.getQuill("memo@1.2.3", { engine })).rejects.toThrow(
      expect.objectContaining({ code: "quill_not_found" }),
    );
  });

  it('16. getQuill("memo@^1") (malformed) → invalid_ref', async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    const { engine } = makeMockEngine();

    await expect(quiver.getQuill("memo@^1", { engine })).rejects.toThrow(
      expect.objectContaining({ code: "invalid_ref" }),
    );
  });

  it("17. if engine.quill throws, error propagates and in-flight entry is cleared (retry works)", async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    let callCount = 0;
    const flakyEngine = {
      quill(_tree: Map<string, Uint8Array>): Quill {
        callCount++;
        if (callCount === 1) {
          throw new Error("engine exploded");
        }
        return { render: () => ({ ok: true }) } as unknown as Quill;
      },
    } as unknown as Quillmark;

    await expect(
      quiver.getQuill("memo@1.0.0", { engine: flakyEngine }),
    ).rejects.toThrow("engine exploded");

    const quill = await quiver.getQuill("memo@1.0.0", { engine: flakyEngine });
    expect(quill).toBeDefined();
    expect(typeof quill.render).toBe("function");
    expect(callCount).toBe(2);
  });
});

// ─── warm ─────────────────────────────────────────────────────────────────────

/** Builds a Quiver wired to a counting loader. Lets us assert tree-fetch counts. */
function makeCountingQuiver(opts: {
  name: string;
  catalog: Map<string, string[]>;
  failOnNthCall?: number;
}): { quiver: Quiver; loaderCalls: () => number } {
  let calls = 0;
  const loader = {
    async loadTree(_name: string, _version: string) {
      calls++;
      if (opts.failOnNthCall !== undefined && calls === opts.failOnNthCall) {
        throw new Error("loader failure");
      }
      return new Map<string, Uint8Array>([
        ["Quill.yaml", new TextEncoder().encode("name: stub\n")],
      ]);
    },
  };
  const quiver = Quiver._fromLoader(opts.name, opts.catalog, loader);
  return { quiver, loaderCalls: () => calls };
}

describe("Quiver.warm", () => {
  it("18. warm() does not require an engine and does not materialize quills", async () => {
    const quiver = await Quiver.fromDir(SAMPLE_FIXTURE);
    const { calls } = makeMockEngine();

    await quiver.warm();

    // No engine was passed; no engine.quill calls happen anywhere.
    expect(calls).toHaveLength(0);
  });

  it("19. warm() prefetches every (name, version); loader called once per ref", async () => {
    const { quiver, loaderCalls } = makeCountingQuiver({
      name: "test",
      catalog: new Map([
        ["memo", ["1.0.0", "1.1.0"]],
        ["resume", ["2.0.0"]],
      ]),
    });

    await quiver.warm();
    expect(loaderCalls()).toBe(3);
  });

  it("20. getQuill after warm() reuses cached tree; no second fetch", async () => {
    const { quiver, loaderCalls } = makeCountingQuiver({
      name: "test",
      catalog: new Map([["memo", ["1.0.0"]]]),
    });
    const { calls, engine } = makeMockEngine();

    await quiver.warm();
    expect(loaderCalls()).toBe(1);

    await quiver.getQuill("memo@1.0.0", { engine });
    expect(loaderCalls()).toBe(1); // still 1 — tree cache hit
    expect(calls).toHaveLength(1); // engine.quill ran exactly once
  });

  it("21. warm() is idempotent — second warm() does not refetch", async () => {
    const { quiver, loaderCalls } = makeCountingQuiver({
      name: "test",
      catalog: new Map([["memo", ["1.0.0"]]]),
    });

    await quiver.warm();
    await quiver.warm();

    expect(loaderCalls()).toBe(1);
  });

  it("22. if loader throws for one ref, warm() rejects (fail-fast)", async () => {
    const { quiver } = makeCountingQuiver({
      name: "test",
      catalog: new Map([["memo", ["1.0.0", "1.1.0"]]]),
      failOnNthCall: 1,
    });

    await expect(quiver.warm()).rejects.toThrow("loader failure");
  });

  it("23. after a failed warm() ref, retry can succeed (in-flight entry cleared)", async () => {
    let calls = 0;
    const loader = {
      async loadTree(_name: string, _version: string) {
        calls++;
        if (calls === 1) throw new Error("transient");
        return new Map<string, Uint8Array>([
          ["Quill.yaml", new TextEncoder().encode("name: stub\n")],
        ]);
      },
    };
    const quiver = Quiver._fromLoader(
      "test",
      new Map([["memo", ["1.0.0"]]]),
      loader,
    );

    await expect(quiver.warm()).rejects.toThrow("transient");
    await expect(quiver.warm()).resolves.toBeUndefined();
    expect(calls).toBe(2);
  });
});

// ─── tree cache lifecycle ────────────────────────────────────────────────────

describe("Quiver tree cache lifecycle", () => {
  it("24. tree is purged after successful materialization (different engine refetches)", async () => {
    const { quiver, loaderCalls } = makeCountingQuiver({
      name: "test",
      catalog: new Map([["memo", ["1.0.0"]]]),
    });
    const { engine: e1 } = makeMockEngine();
    const { engine: e2 } = makeMockEngine();

    await quiver.getQuill("memo@1.0.0", { engine: e1 });
    expect(loaderCalls()).toBe(1);

    // Different engine → quill cache miss; tree was purged → loader called again.
    await quiver.getQuill("memo@1.0.0", { engine: e2 });
    expect(loaderCalls()).toBe(2);
  });

  it("25. tree is retained on engine failure so retry skips network", async () => {
    const { quiver, loaderCalls } = makeCountingQuiver({
      name: "test",
      catalog: new Map([["memo", ["1.0.0"]]]),
    });

    let engineCalls = 0;
    const flakyEngine = {
      quill(_tree: Map<string, Uint8Array>): Quill {
        engineCalls++;
        if (engineCalls === 1) throw new Error("boom");
        return { render: () => ({ ok: true }) } as unknown as Quill;
      },
    } as unknown as Quillmark;

    await expect(
      quiver.getQuill("memo@1.0.0", { engine: flakyEngine }),
    ).rejects.toThrow("boom");

    const quill = await quiver.getQuill("memo@1.0.0", { engine: flakyEngine });
    expect(quill).toBeDefined();
    expect(loaderCalls()).toBe(1); // network paid once
    expect(engineCalls).toBe(2); // engine called twice (fail + retry)
  });

  it("26. warm + getQuill: tree from warm is consumed and purged on materialization", async () => {
    const { quiver, loaderCalls } = makeCountingQuiver({
      name: "test",
      catalog: new Map([["memo", ["1.0.0"]]]),
    });
    const { engine: e1 } = makeMockEngine();
    const { engine: e2 } = makeMockEngine();

    await quiver.warm();
    expect(loaderCalls()).toBe(1);

    await quiver.getQuill("memo@1.0.0", { engine: e1 });
    expect(loaderCalls()).toBe(1); // tree from warm — no fetch

    // Tree was purged after materialization; second engine refetches.
    await quiver.getQuill("memo@1.0.0", { engine: e2 });
    expect(loaderCalls()).toBe(2);
  });

  it("27. repeated getQuill on same engine hits quill cache; no tree access", async () => {
    const { quiver, loaderCalls } = makeCountingQuiver({
      name: "test",
      catalog: new Map([["memo", ["1.0.0"]]]),
    });
    const { calls, engine } = makeMockEngine();

    const a = await quiver.getQuill("memo@1.0.0", { engine });
    const b = await quiver.getQuill("memo@1.0.0", { engine });

    expect(a).toBe(b);
    expect(loaderCalls()).toBe(1);
    expect(calls).toHaveLength(1);
  });
});
