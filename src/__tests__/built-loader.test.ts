/**
 * Tests for built-loader.ts — all scenarios use an in-memory mock transport
 * so no filesystem or network is needed.
 */

import { describe, it, expect, afterEach } from "vitest";
import { loadBuiltQuiver } from "../built-loader.js";
import { packFiles } from "../bundle.js";
import { QuiverError } from "../errors.js";
import type { BuiltTransport } from "../built-loader.js";
import { mockQuillFromTree } from "./helpers/mock-engine.js";

// The Quiver tree path is private (`getQuill` → internal `#loadTree`). To
// observe the tree the loader produced, stub `Quill.fromTree` and read the
// tree it was handed; `getQuill` resolves the ref and drives the same loader.
let treeStub: ReturnType<typeof mockQuillFromTree> | undefined;
afterEach(() => {
  treeStub?.restore();
  treeStub = undefined;
});

/** Drives the loader via `getQuill` and returns the tree fed to Quill.fromTree. */
async function loadTreeViaGetQuill(
  quiver: { getQuill: (ref: string) => Promise<unknown> },
  name: string,
  version: string,
): Promise<Map<string, Uint8Array>> {
  treeStub ??= mockQuillFromTree();
  const before = treeStub.calls.length;
  await quiver.getQuill(`${name}@${version}`);
  return treeStub.calls[before]!;
}

// ─── In-memory mock transport ─────────────────────────────────────────────────

class MemTransport implements BuiltTransport {
  private readonly store: Map<string, Uint8Array>;
  readonly fetchLog: string[] = [];

  constructor(entries: Record<string, Uint8Array>) {
    this.store = new Map(Object.entries(entries));
  }

  async fetchBytes(relativePath: string): Promise<Uint8Array> {
    this.fetchLog.push(relativePath);
    const bytes = this.store.get(relativePath);
    if (bytes === undefined) {
      throw new QuiverError(
        "transport_error",
        `MemTransport: not found: "${relativePath}"`,
      );
    }
    return bytes;
  }

  set(path: string, bytes: Uint8Array): void {
    this.store.set(path, bytes);
  }
}

// ─── Fixture builders ─────────────────────────────────────────────────────────

const enc = new TextEncoder();

function makeBundle(files: Record<string, string>): Uint8Array {
  const input: Record<string, Uint8Array> = {};
  for (const [k, v] of Object.entries(files)) {
    input[k] = enc.encode(v);
  }
  return packFiles(input);
}

function makePointer(manifestFileName: string): Uint8Array {
  return enc.encode(JSON.stringify({ manifest: manifestFileName }));
}

function makeManifest(
  name: string,
  quills: Array<{
    name: string;
    version: string;
    bundle: string;
    fonts?: Record<string, string>;
  }>,
): Uint8Array {
  const manifest = {
    version: 1,
    name,
    quills: quills.map((q) => ({
      ...q,
      fonts: q.fonts ?? {},
    })),
  };
  return enc.encode(JSON.stringify(manifest));
}

// ─── Minimal fixture ──────────────────────────────────────────────────────────

function buildMinimalTransport(): MemTransport {
  const memoBundle = makeBundle({
    "Quill.yaml": "name: memo\n",
    "template.typ": "// memo 1.0.0\n",
  });

  const manifestBytes = makeManifest("sample", [
    { name: "memo", version: "1.0.0", bundle: "memo@1.0.0.aabbcc.zip" },
    { name: "memo", version: "1.1.0", bundle: "memo@1.1.0.ddeeff.zip" },
    { name: "resume", version: "2.0.0", bundle: "resume@2.0.0.112233.zip" },
  ]);

  const transport = new MemTransport({
    "Quiver.json": makePointer("manifest.abc123.json"),
    "manifest.abc123.json": manifestBytes,
    "memo@1.0.0.aabbcc.zip": memoBundle,
    "memo@1.1.0.ddeeff.zip": makeBundle({ "Quill.yaml": "name: memo\n" }),
    "resume@2.0.0.112233.zip": makeBundle({ "Quill.yaml": "name: resume\n" }),
  });

  return transport;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("loadBuiltQuiver — happy path", () => {
  it("returns correct name from manifest", async () => {
    const q = await loadBuiltQuiver(buildMinimalTransport());
    expect(q.name).toBe("sample");
  });

  it("quillNames() returns sorted quill names", async () => {
    const q = await loadBuiltQuiver(buildMinimalTransport());
    expect(q.quillNames()).toEqual(["memo", "resume"]);
  });

  it("versionsOf() returns versions sorted descending", async () => {
    const q = await loadBuiltQuiver(buildMinimalTransport());
    expect(q.versionsOf("memo")).toEqual(["1.1.0", "1.0.0"]);
    expect(q.versionsOf("resume")).toEqual(["2.0.0"]);
  });

  it("versionsOf() returns [] for unknown quill", async () => {
    const q = await loadBuiltQuiver(buildMinimalTransport());
    expect(q.versionsOf("nonexistent")).toEqual([]);
  });
});

describe("loadBuiltQuiver — tree rehydration", () => {
  it("loaded tree has content files", async () => {
    const q = await loadBuiltQuiver(buildMinimalTransport());
    const tree = await loadTreeViaGetQuill(q, "memo", "1.0.0");

    expect(tree).toBeInstanceOf(Map);
    expect(tree.has("Quill.yaml")).toBe(true);
    expect(tree.has("template.typ")).toBe(true);
  });

  it("loaded tree has correct bytes for content files", async () => {
    const q = await loadBuiltQuiver(buildMinimalTransport());
    const tree = await loadTreeViaGetQuill(q, "memo", "1.0.0");

    const quillYaml = new TextDecoder().decode(tree.get("Quill.yaml"));
    expect(quillYaml).toBe("name: memo\n");
  });

  it("rehydrates fonts at correct paths", async () => {
    const fontBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const fontHash = "aabbccddeeff00112233445566778899";

    const memoBundle = makeBundle({ "Quill.yaml": "name: memo\n" });
    const manifestBytes = makeManifest("sample", [
      {
        name: "memo",
        version: "1.0.0",
        bundle: "memo@1.0.0.aabbcc.zip",
        fonts: { "fonts/body.ttf": fontHash },
      },
    ]);

    const transport = new MemTransport({
      "Quiver.json": makePointer("manifest.abc123.json"),
      "manifest.abc123.json": manifestBytes,
      "memo@1.0.0.aabbcc.zip": memoBundle,
      [`store/${fontHash}`]: fontBytes,
    });

    const q = await loadBuiltQuiver(transport);
    const tree = await loadTreeViaGetQuill(q, "memo", "1.0.0");

    expect(tree.has("fonts/body.ttf")).toBe(true);
    expect(tree.get("fonts/body.ttf")).toEqual(fontBytes);
  });

  it("getQuill throws quill_not_found for unknown name/version", async () => {
    const q = await loadBuiltQuiver(buildMinimalTransport());
    await expect(q.getQuill("memo@9.9.9")).rejects.toThrow(
      expect.objectContaining({ code: "quill_not_found" }),
    );
  });
});

describe("loadBuiltQuiver — font coalescing", () => {
  it("two concurrent loadTree calls sharing a font fetch it exactly once", async () => {
    const fontHash = "deadbeefdeadbeefdeadbeefdeadbeef";
    const fontBytes = new Uint8Array([1, 2, 3]);

    const bundleA = makeBundle({ "Quill.yaml": "name: quillA\n" });
    const bundleB = makeBundle({ "Quill.yaml": "name: quillB\n" });

    const manifestBytes = makeManifest("coalesce-test", [
      {
        name: "quillA",
        version: "1.0.0",
        bundle: "quillA@1.0.0.aaa.zip",
        fonts: { "fonts/shared.ttf": fontHash },
      },
      {
        name: "quillB",
        version: "1.0.0",
        bundle: "quillB@1.0.0.bbb.zip",
        fonts: { "fonts/shared.ttf": fontHash },
      },
    ]);

    const transport = new MemTransport({
      "Quiver.json": makePointer("manifest.abc.json"),
      "manifest.abc.json": manifestBytes,
      "quillA@1.0.0.aaa.zip": bundleA,
      "quillB@1.0.0.bbb.zip": bundleB,
      [`store/${fontHash}`]: fontBytes,
    });

    const q = await loadBuiltQuiver(transport);
    treeStub = mockQuillFromTree();

    // Fire both concurrently. Each getQuill drives the loader, which coalesces
    // the shared font fetch.
    await Promise.all([
      q.getQuill("quillA@1.0.0"),
      q.getQuill("quillB@1.0.0"),
    ]);

    // Store fetch should have happened exactly once.
    const storeFetches = transport.fetchLog.filter((p) =>
      p.startsWith("store/"),
    );
    expect(storeFetches).toHaveLength(1);
  });
});

describe("loadBuiltQuiver — invalid pointer", () => {
  it("missing Quiver.json → transport_error", async () => {
    const transport = new MemTransport({});
    await expect(loadBuiltQuiver(transport)).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
  });

  it("malformed Quiver.json (not JSON) → quiver_invalid", async () => {
    const transport = new MemTransport({
      "Quiver.json": enc.encode("not-json"),
    });
    await expect(loadBuiltQuiver(transport)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  it("Quiver.json missing manifest field → quiver_invalid", async () => {
    const transport = new MemTransport({
      "Quiver.json": enc.encode(JSON.stringify({ other: "value" })),
    });
    await expect(loadBuiltQuiver(transport)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  it("Quiver.json with extra unknown field → quiver_invalid", async () => {
    const transport = new MemTransport({
      "Quiver.json": enc.encode(
        JSON.stringify({ manifest: "manifest.abc.json", extra: true }),
      ),
    });
    await expect(loadBuiltQuiver(transport)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });
});

describe("loadBuiltQuiver — invalid manifest", () => {
  function transportWith(manifestOverride: Record<string, unknown>): MemTransport {
    return new MemTransport({
      "Quiver.json": makePointer("manifest.abc.json"),
      "manifest.abc.json": enc.encode(JSON.stringify(manifestOverride)),
    });
  }

  it("missing version field → quiver_invalid", async () => {
    await expect(
      loadBuiltQuiver(transportWith({ name: "test", quills: [] })),
    ).rejects.toThrow(expect.objectContaining({ code: "quiver_invalid" }));
  });

  it("version !== 1 → quiver_invalid", async () => {
    await expect(
      loadBuiltQuiver(transportWith({ version: 2, name: "test", quills: [] })),
    ).rejects.toThrow(expect.objectContaining({ code: "quiver_invalid" }));
  });

  it("unknown top-level field → quiver_invalid", async () => {
    await expect(
      loadBuiltQuiver(
        transportWith({ version: 1, name: "test", quills: [], extra: true }),
      ),
    ).rejects.toThrow(expect.objectContaining({ code: "quiver_invalid" }));
  });

  it("non-canonical semver in quill entry → quiver_invalid", async () => {
    await expect(
      loadBuiltQuiver(
        transportWith({
          version: 1,
          name: "test",
          quills: [
            {
              name: "foo",
              version: "1.0", // non-canonical — missing patch
              bundle: "foo@1.0.zip",
              fonts: {},
            },
          ],
        }),
      ),
    ).rejects.toThrow(expect.objectContaining({ code: "quiver_invalid" }));
  });
});

describe("loadBuiltQuiver — missing bundle or store entry", () => {
  it("manifest references a bundle zip that transport can't fetch → transport_error", async () => {
    const manifestBytes = makeManifest("test", [
      { name: "foo", version: "1.0.0", bundle: "foo@1.0.0.deadbeef.zip" },
    ]);
    const transport = new MemTransport({
      "Quiver.json": makePointer("manifest.abc.json"),
      "manifest.abc.json": manifestBytes,
      // bundle NOT included
    });

    const q = await loadBuiltQuiver(transport);
    await expect(q.getQuill("foo@1.0.0")).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
  });

  it("manifest references a font hash not in store → transport_error", async () => {
    const memoBundle = makeBundle({ "Quill.yaml": "name: foo\n" });
    const manifestBytes = makeManifest("test", [
      {
        name: "foo",
        version: "1.0.0",
        bundle: "foo@1.0.0.aaa.zip",
        fonts: { "fonts/missing.ttf": "cafebabecafebabecafebabecafebabe" },
      },
    ]);
    const transport = new MemTransport({
      "Quiver.json": makePointer("manifest.abc.json"),
      "manifest.abc.json": manifestBytes,
      "foo@1.0.0.aaa.zip": memoBundle,
      // store/cafebabecafebabecafebabecafebabe NOT included
    });

    const q = await loadBuiltQuiver(transport);
    await expect(q.getQuill("foo@1.0.0")).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
  });
});

describe("loadBuiltQuiver — path validation (security)", () => {
  it("pointer manifest with path traversal → quiver_invalid", async () => {
    const transport = new MemTransport({
      "Quiver.json": enc.encode(
        JSON.stringify({ manifest: "../../etc/passwd" }),
      ),
    });
    await expect(loadBuiltQuiver(transport)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  it("pointer manifest with absolute path → quiver_invalid", async () => {
    const transport = new MemTransport({
      "Quiver.json": enc.encode(
        JSON.stringify({ manifest: "/etc/passwd" }),
      ),
    });
    await expect(loadBuiltQuiver(transport)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  it("manifest bundle with path traversal → quiver_invalid", async () => {
    const transport = new MemTransport({
      "Quiver.json": makePointer("manifest.abc123.json"),
      "manifest.abc123.json": enc.encode(
        JSON.stringify({
          version: 1,
          name: "test",
          quills: [
            {
              name: "evil",
              version: "1.0.0",
              bundle: "../../etc/passwd",
              fonts: {},
            },
          ],
        }),
      ),
    });
    await expect(loadBuiltQuiver(transport)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  it("manifest font hash with path traversal → quiver_invalid", async () => {
    const transport = new MemTransport({
      "Quiver.json": makePointer("manifest.abc123.json"),
      "manifest.abc123.json": enc.encode(
        JSON.stringify({
          version: 1,
          name: "test",
          quills: [
            {
              name: "evil",
              version: "1.0.0",
              bundle: "evil@1.0.0.aabbcc.zip",
              fonts: { "fonts/body.ttf": "../../etc/passwd" },
            },
          ],
        }),
      ),
    });
    await expect(loadBuiltQuiver(transport)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  it("manifest font hash that is not 32 hex chars → quiver_invalid", async () => {
    const transport = new MemTransport({
      "Quiver.json": makePointer("manifest.abc123.json"),
      "manifest.abc123.json": enc.encode(
        JSON.stringify({
          version: 1,
          name: "test",
          quills: [
            {
              name: "evil",
              version: "1.0.0",
              bundle: "evil@1.0.0.aabbcc.zip",
              fonts: { "fonts/body.ttf": "tooshort" },
            },
          ],
        }),
      ),
    });
    await expect(loadBuiltQuiver(transport)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });
});

describe("loadBuiltQuiver — duplicate entry detection", () => {
  it("duplicate name@version in manifest → quiver_invalid", async () => {
    const transport = new MemTransport({
      "Quiver.json": makePointer("manifest.abc123.json"),
      "manifest.abc123.json": enc.encode(
        JSON.stringify({
          version: 1,
          name: "test",
          quills: [
            {
              name: "foo",
              version: "1.0.0",
              bundle: "foo@1.0.0.aabbcc.zip",
              fonts: {},
            },
            {
              name: "foo",
              version: "1.0.0",
              bundle: "foo@1.0.0.ddeeff.zip",
              fonts: {},
            },
          ],
        }),
      ),
    });
    await expect(loadBuiltQuiver(transport)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  it("same name but different versions is not a duplicate", async () => {
    const transport = new MemTransport({
      "Quiver.json": makePointer("manifest.abc123.json"),
      "manifest.abc123.json": makeManifest("test", [
        { name: "foo", version: "1.0.0", bundle: "foo@1.0.0.aabbcc.zip" },
        { name: "foo", version: "2.0.0", bundle: "foo@2.0.0.ddeeff.zip" },
      ]),
      "foo@1.0.0.aabbcc.zip": makeBundle({ "Quill.yaml": "name: foo\n" }),
      "foo@2.0.0.ddeeff.zip": makeBundle({ "Quill.yaml": "name: foo\n" }),
    });
    const q = await loadBuiltQuiver(transport);
    expect(q.versionsOf("foo")).toEqual(["2.0.0", "1.0.0"]);
  });
});
