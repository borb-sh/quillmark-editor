/**
 * Integration tests — build → fromBuiltUrl (mock fetch) → resolve → getQuill →
 * mock render.
 *
 * Built artifacts are loaded over HTTP only (Quiver.fromBuiltUrl accepts
 * http(s):// URLs); these tests mock globalThis.fetch to serve files
 * from a temporary directory written by Quiver.build.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Quiver } from "../node.js";
import { QuiverError } from "../errors.js";
import { mockQuillFromTree } from "./helpers/mock-engine.js";

// ─── Fixture ──────────────────────────────────────────────────────────────────

const SAMPLE_FIXTURE = new URL("./fixtures/sample-quiver", import.meta.url)
  .pathname;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tempDir(): string {
  return join(tmpdir(), `quiver-integration-test-${randomUUID()}`);
}

/**
 * Mock globalThis.fetch to serve files from a build-output directory on disk.
 * URL pattern: baseUrl + relativePath (with one slash between them).
 */
function makeMockFetch(
  dir: string,
  baseUrl: string,
): { restore: () => void } {
  const original = globalThis.fetch;
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;

  globalThis.fetch = (async (url: string) => {
    if (!url.startsWith(base)) {
      return new Response(null, { status: 404 });
    }
    const relativePath = url.slice(base.length);
    const filePath = join(dir, relativePath);
    try {
      const bytes = await readFile(filePath);
      return new Response(bytes.buffer, { status: 200 });
    } catch {
      return new Response(null, { status: 404 });
    }
  }) as typeof globalThis.fetch;

  return {
    restore: () => {
      if (original !== undefined) {
        globalThis.fetch = original;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).fetch;
      }
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Integration: build → fromBuiltUrl → resolve → getQuill", () => {
  const tmpDirs: string[] = [];
  let mockFetch: { restore: () => void } | undefined;

  afterEach(async () => {
    if (mockFetch !== undefined) {
      mockFetch.restore();
      mockFetch = undefined;
    }
    for (const d of tmpDirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("fromBuiltUrl catalog matches source quiver", async () => {
    const outDir = tempDir();
    tmpDirs.push(outDir);

    await Quiver.build(SAMPLE_FIXTURE, outDir);

    const baseUrl = "https://mock.cdn.example.com/my-quiver/";
    mockFetch = makeMockFetch(outDir, baseUrl);

    const built = await Quiver.fromBuiltUrl(baseUrl);

    expect(built.name).toBe("sample");
    expect(built.quillNames().sort()).toEqual(["memo", "resume"]);
    expect(built.versionsOf("memo").sort()).toEqual(["1.0.0", "1.1.0"]);
    expect(built.versionsOf("resume")).toEqual(["2.0.0"]);
  });

  it("quiver.resolve works with built quiver", async () => {
    const outDir = tempDir();
    tmpDirs.push(outDir);

    await Quiver.build(SAMPLE_FIXTURE, outDir);

    const baseUrl = "https://mock.cdn.example.com/my-quiver/";
    mockFetch = makeMockFetch(outDir, baseUrl);

    const built = await Quiver.fromBuiltUrl(baseUrl);

    expect(await built.resolve("memo")).toBe("memo@1.1.0");
    expect(await built.resolve("memo@1.0.0")).toBe("memo@1.0.0");
    expect(await built.resolve("resume")).toBe("resume@2.0.0");
  });

  it("quiver.getQuill builds a quill from the correct tree", async () => {
    const outDir = tempDir();
    tmpDirs.push(outDir);

    await Quiver.build(SAMPLE_FIXTURE, outDir);

    const baseUrl = "https://mock.cdn.example.com/my-quiver/";
    mockFetch = makeMockFetch(outDir, baseUrl);

    const built = await Quiver.fromBuiltUrl(baseUrl);
    const { calls, restore } = mockQuillFromTree();
    try {
      const quill = await built.getQuill("memo@1.0.0");

      expect(quill).toBeDefined();
      expect(calls).toHaveLength(1);
      expect(calls[0]!.has("Quill.yaml")).toBe(true);
    } finally {
      restore();
    }
  });

  it("quiver.getQuill for unknown version throws quill_not_found", async () => {
    const outDir = tempDir();
    tmpDirs.push(outDir);

    await Quiver.build(SAMPLE_FIXTURE, outDir);

    const baseUrl = "https://mock.cdn.example.com/my-quiver/";
    mockFetch = makeMockFetch(outDir, baseUrl);

    const built = await Quiver.fromBuiltUrl(baseUrl);

    await expect(built.getQuill("memo@9.9.9")).rejects.toThrow(
      expect.objectContaining({ code: "quill_not_found" }),
    );
  });
});

describe("Integration: fromBuiltUrl error cases", () => {
  let mockFetch: { restore: () => void } | undefined;
  const tmpDirs: string[] = [];

  afterEach(async () => {
    if (mockFetch !== undefined) {
      mockFetch.restore();
      mockFetch = undefined;
    }
    for (const d of tmpDirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("fromBuiltUrl with non-existent base URL throws transport_error", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(null, { status: 404 })) as typeof globalThis.fetch;
    mockFetch = {
      restore: () => {
        if (original !== undefined) globalThis.fetch = original;
      },
    };

    await expect(
      Quiver.fromBuiltUrl("https://does-not-exist.example.com/quiver/"),
    ).rejects.toThrow(expect.objectContaining({ code: "transport_error" }));
  });

  it("fromBuiltUrl with empty directory served over HTTP throws transport_error", async () => {
    const outDir = tempDir();
    tmpDirs.push(outDir);
    await mkdir(outDir, { recursive: true });

    const baseUrl = "https://mock.cdn.example.com/empty/";
    mockFetch = makeMockFetch(outDir, baseUrl);

    await expect(Quiver.fromBuiltUrl(baseUrl)).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
  });

  it("fromBuiltUrl with malformed latest.json throws quiver_invalid", async () => {
    const outDir = tempDir();
    tmpDirs.push(outDir);
    await mkdir(outDir, { recursive: true });

    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(outDir, "latest.json"), "not-json");

    const baseUrl = "https://mock.cdn.example.com/malformed/";
    mockFetch = makeMockFetch(outDir, baseUrl);

    await expect(Quiver.fromBuiltUrl(baseUrl)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  it("fromBuiltUrl throws QuiverError on missing pointer", async () => {
    const outDir = tempDir();
    tmpDirs.push(outDir);
    await mkdir(outDir, { recursive: true });

    const baseUrl = "https://mock.cdn.example.com/missing/";
    mockFetch = makeMockFetch(outDir, baseUrl);

    let thrown: unknown;
    try {
      await Quiver.fromBuiltUrl(baseUrl);
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(QuiverError);
  });

  it("fromBuiltUrl rejects file:// URLs with transport_error", async () => {
    await expect(
      Quiver.fromBuiltUrl("file:///tmp/quiver/"),
    ).rejects.toThrow(expect.objectContaining({ code: "transport_error" }));
  });
});

describe("Integration: build → fromManifest (seed) → resolve → getQuill", () => {
  const tmpDirs: string[] = [];
  let mockFetch: { restore: () => void } | undefined;

  afterEach(async () => {
    if (mockFetch !== undefined) {
      mockFetch.restore();
      mockFetch = undefined;
    }
    for (const d of tmpDirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  /** Read the build output's manifest bytes the way an SSR consumer would. */
  async function readManifestBytes(outDir: string): Promise<Uint8Array> {
    const { manifest } = JSON.parse(
      await readFile(join(outDir, "latest.json"), "utf8"),
    ) as { manifest: string };
    return new Uint8Array(await readFile(join(outDir, manifest)));
  }

  it("seeds the catalog, fetches no pointer/manifest, fetches bundles lazily", async () => {
    const outDir = tempDir();
    tmpDirs.push(outDir);
    await Quiver.build(SAMPLE_FIXTURE, outDir);
    const manifestBytes = await readManifestBytes(outDir);

    const urls: string[] = [];
    const baseUrl = "https://mock.cdn.example.com/my-quiver/";
    const inner = makeMockFetch(outDir, baseUrl);
    const wrapped = globalThis.fetch;
    globalThis.fetch = ((url: string) => {
      urls.push(url);
      return wrapped(url);
    }) as typeof globalThis.fetch;
    mockFetch = { restore: inner.restore };

    const built = await Quiver.fromManifest(baseUrl, manifestBytes);
    expect(built.name).toBe("sample");
    expect(built.quillNames().sort()).toEqual(["memo", "resume"]);
    expect(built.versionsOf("memo").sort()).toEqual(["1.0.0", "1.1.0"]);

    const { restore } = mockQuillFromTree();
    try {
      await built.getQuill("memo@1.0.0");
    } finally {
      restore();
    }

    expect(urls.some((u) => /Quiver\.json$|manifest\.[0-9a-f]+\.json$/.test(u))).toBe(false);
    expect(urls.some((u) => /memo@1\.0\.0\.[0-9a-f]+\.zip$/.test(u))).toBe(true);
  });

  it("malformed manifest → quiver_invalid; file:// baseUrl → transport_error", async () => {
    await expect(
      Quiver.fromManifest("https://cdn.example.com/q/", new TextEncoder().encode("not-json")),
    ).rejects.toThrow(expect.objectContaining({ code: "quiver_invalid" }));

    await expect(
      Quiver.fromManifest("file:///tmp/quiver/", new TextEncoder().encode("{}")),
    ).rejects.toThrow(expect.objectContaining({ code: "transport_error" }));
  });
});

describe("Integration: build → fromBuiltDir → resolve → getQuill", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("fromBuiltDir catalog matches source quiver", async () => {
    const outDir = tempDir();
    tmpDirs.push(outDir);

    await Quiver.build(SAMPLE_FIXTURE, outDir);

    const built = await Quiver.fromBuiltDir(outDir);

    expect(built.name).toBe("sample");
    expect(built.quillNames().sort()).toEqual(["memo", "resume"]);
    expect(built.versionsOf("memo").sort()).toEqual(["1.0.0", "1.1.0"]);
    expect(built.versionsOf("resume")).toEqual(["2.0.0"]);
  });

  it("fromBuiltDir + getQuill loads tree from disk without network", async () => {
    const outDir = tempDir();
    tmpDirs.push(outDir);

    await Quiver.build(SAMPLE_FIXTURE, outDir);

    // Sabotage fetch — fromBuiltDir must not touch it.
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("fetch must not be called by fromBuiltDir");
    }) as typeof globalThis.fetch;

    const { calls, restore } = mockQuillFromTree();
    try {
      const built = await Quiver.fromBuiltDir(outDir);

      const quill = await built.getQuill("memo@1.0.0");

      expect(quill).toBeDefined();
      expect(calls).toHaveLength(1);
      expect(calls[0]!.has("Quill.yaml")).toBe(true);
    } finally {
      restore();
      if (original !== undefined) globalThis.fetch = original;
    }
  });

  it("fromBuiltDir on missing directory throws transport_error", async () => {
    await expect(
      Quiver.fromBuiltDir(join(tmpdir(), `does-not-exist-${randomUUID()}`)),
    ).rejects.toThrow(expect.objectContaining({ code: "transport_error" }));
  });

  it("fromBuiltDir on empty directory throws transport_error", async () => {
    const outDir = tempDir();
    tmpDirs.push(outDir);
    await mkdir(outDir, { recursive: true });

    await expect(Quiver.fromBuiltDir(outDir)).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
  });
});
