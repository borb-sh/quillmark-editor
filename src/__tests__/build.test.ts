import { describe, it, expect, afterEach } from "vitest";
import { mkdir, rm, writeFile, readFile, access } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { buildQuiver } from "../build.js";
import { unpackFiles } from "../bundle.js";
import { Quiver } from "../node.js";
import { QuiverError } from "../errors.js";

// Absolute path to the committed fixture
const SAMPLE_FIXTURE = new URL("./fixtures/sample-quiver", import.meta.url)
  .pathname;

// ─── Helpers ────────────────────────────────────────────────────────────────

function tempDir(): string {
  return join(tmpdir(), `quiver-pack-test-${randomUUID()}`);
}

/**
 * Build a minimal Source Quiver programmatically.
 * If `fonts` is provided for a quill entry, those files are written as font
 * bytes (same content for dedup testing).
 */
async function seedSourceQuiver(
  root: string,
  opts: {
    name?: string;
    quills: Array<{
      name: string;
      version: string;
      fonts?: Array<{ path: string; content: Uint8Array }>;
    }>;
  },
): Promise<void> {
  await mkdir(root, { recursive: true });
  await writeFile(
    join(root, "Quiver.yaml"),
    `name: ${opts.name ?? "test"}\n`,
  );
  for (const q of opts.quills) {
    const dir = join(root, "quills", q.name, q.version);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "Quill.yaml"), `name: ${q.name}\n`);
    await writeFile(join(dir, "template.typ"), `// ${q.name} ${q.version}\n`);
    for (const font of q.fonts ?? []) {
      const fontPath = join(dir, font.path);
      await mkdir(join(dir, "fonts"), { recursive: true }).catch(() => {});
      await writeFile(fontPath, font.content);
    }
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("buildQuiver — happy path (sample-quiver fixture)", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("writes latest.json with a manifest pointer", async () => {
    const out = tempDir();
    tmpDirs.push(out);
    await buildQuiver(SAMPLE_FIXTURE, out);

    const raw = await readFile(join(out, "latest.json"), "utf-8");
    const pointer = JSON.parse(raw) as { manifest: string };
    expect(pointer.manifest).toMatch(/^manifest\.[0-9a-f]{6}\.json$/);
  });

  it("manifest has version 1 and name 'sample'", async () => {
    const out = tempDir();
    tmpDirs.push(out);
    await buildQuiver(SAMPLE_FIXTURE, out);

    const ptr = JSON.parse(await readFile(join(out, "latest.json"), "utf-8")) as {
      manifest: string;
    };
    const manifest = JSON.parse(
      await readFile(join(out, ptr.manifest), "utf-8"),
    ) as { version: number; name: string; quills: unknown[] };

    expect(manifest.version).toBe(1);
    expect(manifest.name).toBe("sample");
  });

  it("manifest has quill entries for memo@1.0.0, memo@1.1.0, resume@2.0.0", async () => {
    const out = tempDir();
    tmpDirs.push(out);
    await buildQuiver(SAMPLE_FIXTURE, out);

    const ptr = JSON.parse(await readFile(join(out, "latest.json"), "utf-8")) as {
      manifest: string;
    };
    const manifest = JSON.parse(
      await readFile(join(out, ptr.manifest), "utf-8"),
    ) as {
      quills: Array<{ name: string; version: string; bundle: string; fonts: Record<string, string> }>;
    };

    const keys = manifest.quills.map((q) => `${q.name}@${q.version}`).sort();
    expect(keys).toEqual(["memo@1.0.0", "memo@1.1.0", "resume@2.0.0"]);
  });

  it("creates one .zip bundle per quill version", async () => {
    const out = tempDir();
    tmpDirs.push(out);
    await buildQuiver(SAMPLE_FIXTURE, out);

    const ptr = JSON.parse(await readFile(join(out, "latest.json"), "utf-8")) as {
      manifest: string;
    };
    const manifest = JSON.parse(
      await readFile(join(out, ptr.manifest), "utf-8"),
    ) as { quills: Array<{ bundle: string }> };

    for (const q of manifest.quills) {
      await expect(access(join(out, q.bundle))).resolves.toBeUndefined();
    }
    expect(manifest.quills).toHaveLength(3);
  });

  it("store/ directory exists and is empty (no fonts in sample fixture)", async () => {
    const out = tempDir();
    tmpDirs.push(out);
    await buildQuiver(SAMPLE_FIXTURE, out);

    const { readdir } = await import("node:fs/promises");
    const storeEntries = await readdir(join(out, "store"));
    expect(storeEntries).toHaveLength(0);
  });

  it("manifest entries have fonts: {} for font-less quills", async () => {
    const out = tempDir();
    tmpDirs.push(out);
    await buildQuiver(SAMPLE_FIXTURE, out);

    const ptr = JSON.parse(await readFile(join(out, "latest.json"), "utf-8")) as {
      manifest: string;
    };
    const manifest = JSON.parse(
      await readFile(join(out, ptr.manifest), "utf-8"),
    ) as { quills: Array<{ fonts: Record<string, string> }> };

    for (const q of manifest.quills) {
      expect(q.fonts).toEqual({});
    }
  });
});

describe("buildQuiver — font dehydration & deduplication", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("stores the shared font exactly once in store/", async () => {
    const src = tempDir();
    const out = tempDir();
    tmpDirs.push(src, out);

    const sharedFontBytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    await seedSourceQuiver(src, {
      name: "font-test",
      quills: [
        {
          name: "quillA",
          version: "1.0.0",
          fonts: [{ path: "fonts/font.ttf", content: sharedFontBytes }],
        },
        {
          name: "quillB",
          version: "1.0.0",
          fonts: [{ path: "fonts/font.ttf", content: sharedFontBytes }],
        },
      ],
    });

    await buildQuiver(src, out);

    const { readdir } = await import("node:fs/promises");
    const storeEntries = await readdir(join(out, "store"));
    expect(storeEntries).toHaveLength(1);
  });

  it("both manifest entries reference the same font hash", async () => {
    const src = tempDir();
    const out = tempDir();
    tmpDirs.push(src, out);

    const sharedFontBytes = new Uint8Array([10, 20, 30, 40, 50]);

    await seedSourceQuiver(src, {
      name: "font-test",
      quills: [
        {
          name: "quillA",
          version: "1.0.0",
          fonts: [{ path: "fonts/shared.ttf", content: sharedFontBytes }],
        },
        {
          name: "quillB",
          version: "1.0.0",
          fonts: [{ path: "fonts/shared.ttf", content: sharedFontBytes }],
        },
      ],
    });

    await buildQuiver(src, out);

    const ptr = JSON.parse(await readFile(join(out, "latest.json"), "utf-8")) as {
      manifest: string;
    };
    const manifest = JSON.parse(
      await readFile(join(out, ptr.manifest), "utf-8"),
    ) as { quills: Array<{ fonts: Record<string, string> }> };

    const hashes = manifest.quills.map((q) => q.fonts["fonts/shared.ttf"]);
    expect(hashes[0]).toBeDefined();
    expect(hashes[0]).toBe(hashes[1]);
  });

  it("bundle zip does NOT contain the font file", async () => {
    const src = tempDir();
    const out = tempDir();
    tmpDirs.push(src, out);

    const fontBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

    await seedSourceQuiver(src, {
      name: "font-test",
      quills: [
        {
          name: "quillA",
          version: "1.0.0",
          fonts: [{ path: "fonts/font.otf", content: fontBytes }],
        },
      ],
    });

    await buildQuiver(src, out);

    const ptr = JSON.parse(await readFile(join(out, "latest.json"), "utf-8")) as {
      manifest: string;
    };
    const manifest = JSON.parse(
      await readFile(join(out, ptr.manifest), "utf-8"),
    ) as { quills: Array<{ bundle: string }> };

    const bundleBytes = await readFile(join(out, manifest.quills[0]!.bundle));
    const bundleFiles = unpackFiles(bundleBytes);

    expect(Object.keys(bundleFiles)).toContain("Quill.yaml");
    expect(Object.keys(bundleFiles)).not.toContain("fonts/font.otf");
  });
});

describe("buildQuiver — determinism", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("packing the same source twice yields identical bundle filenames", async () => {
    const out1 = tempDir();
    const out2 = tempDir();
    tmpDirs.push(out1, out2);

    await buildQuiver(SAMPLE_FIXTURE, out1);
    await buildQuiver(SAMPLE_FIXTURE, out2);

    const getManifest = async (outDir: string) => {
      const ptr = JSON.parse(
        await readFile(join(outDir, "latest.json"), "utf-8"),
      ) as { manifest: string };
      return JSON.parse(await readFile(join(outDir, ptr.manifest), "utf-8")) as {
        quills: Array<{ bundle: string }>;
      };
    };

    const m1 = await getManifest(out1);
    const m2 = await getManifest(out2);

    const bundles1 = m1.quills.map((q) => q.bundle).sort();
    const bundles2 = m2.quills.map((q) => q.bundle).sort();
    expect(bundles1).toEqual(bundles2);
  });

  it("packing the same source twice yields an identical manifest filename", async () => {
    const out1 = tempDir();
    const out2 = tempDir();
    tmpDirs.push(out1, out2);

    await buildQuiver(SAMPLE_FIXTURE, out1);
    await buildQuiver(SAMPLE_FIXTURE, out2);

    const ptr1 = JSON.parse(
      await readFile(join(out1, "latest.json"), "utf-8"),
    ) as { manifest: string };
    const ptr2 = JSON.parse(
      await readFile(join(out2, "latest.json"), "utf-8"),
    ) as { manifest: string };

    expect(ptr1.manifest).toBe(ptr2.manifest);
  });
});

describe("buildQuiver — invalid source", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("throws quiver_invalid for a non-canonical version dir", async () => {
    const src = tempDir();
    const out = tempDir();
    tmpDirs.push(src, out);

    // Build a quiver with a non-canonical version "1.0" (missing patch)
    await mkdir(src, { recursive: true });
    await writeFile(join(src, "Quiver.yaml"), "name: badver\n");
    const versionDir = join(src, "quills", "myquill", "1.0");
    await mkdir(versionDir, { recursive: true });
    await writeFile(join(versionDir, "Quill.yaml"), "name: myquill\n");

    await expect(buildQuiver(src, out)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  it("throws transport_error for a missing Quiver.yaml", async () => {
    // ENOENT on Quiver.yaml is transport_error (missing-path condition) — the
    // path doesn't point to a quiver at all, not a structural violation within
    // one. Contrast: missing Quill.yaml inside a version dir is quiver_invalid.
    const src = tempDir();
    const out = tempDir();
    tmpDirs.push(src, out);

    await mkdir(src, { recursive: true });
    // No Quiver.yaml

    await expect(buildQuiver(src, out)).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
  });
});

describe("buildQuiver — I/O error", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("throws transport_error when outDir parent path is a file, not a directory", async () => {
    // Using a file-as-path-segment (ENOTDIR) works regardless of uid — a
    // chmod-based read-only fixture is bypassed by root, so it can't be
    // relied on in containerized test environments.
    const parentFile = tempDir();
    tmpDirs.push(parentFile);

    await writeFile(parentFile, "not a directory");

    const out = join(parentFile, "out");

    await expect(buildQuiver(SAMPLE_FIXTURE, out)).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
  });
});

describe("Quiver.build (static method delegation)", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("Quiver.build delegates to buildQuiver and writes latest.json", async () => {
    const out = tempDir();
    tmpDirs.push(out);

    await Quiver.build(SAMPLE_FIXTURE, out);

    const raw = await readFile(join(out, "latest.json"), "utf-8");
    const pointer = JSON.parse(raw) as { manifest: string };
    expect(pointer.manifest).toMatch(/^manifest\.[0-9a-f]{6}\.json$/);
  });
});

describe("Quiver.buildPackage", () => {
  it("throws transport_error when the specifier cannot be resolved", async () => {
    const out = tempDir();
    await expect(
      Quiver.buildPackage("@nonexistent/quiver-pkg-xyz", out),
    ).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
    await expect(
      Quiver.buildPackage("@nonexistent/quiver-pkg-xyz", out),
    ).rejects.toBeInstanceOf(QuiverError);
  });
});
