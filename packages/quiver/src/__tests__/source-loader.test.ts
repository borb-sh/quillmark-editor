import { describe, it, expect, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { scanSourceQuiver, readQuillTree } from "../source-loader.js";
import { QuiverError } from "../errors.js";

// Absolute path to the committed fixture
const SAMPLE_FIXTURE = new URL("./fixtures/sample-quiver", import.meta.url).pathname;

// Helper: create a temp directory unique per test
function makeTempDir(): string {
  return join(tmpdir(), `quiver-test-${randomUUID()}`);
}

// Helper: build a minimal valid quiver tree in a temp dir
async function buildMinimalQuiver(
  root: string,
  opts: {
    quiverYaml?: string;
    quills?: Array<{ name: string; version: string; hasQuillYaml?: boolean }>;
    noQuillsDir?: boolean;
  } = {},
): Promise<void> {
  await mkdir(root, { recursive: true });

  const quiverYaml = opts.quiverYaml ?? "name: test\n";
  await writeFile(join(root, "Quiver.yaml"), quiverYaml);

  if (!opts.noQuillsDir) {
    const quillsDir = join(root, "quills");
    await mkdir(quillsDir, { recursive: true });

    for (const { name, version, hasQuillYaml = true } of opts.quills ?? []) {
      const versionDir = join(quillsDir, name, version);
      await mkdir(versionDir, { recursive: true });
      if (hasQuillYaml) {
        await writeFile(join(versionDir, "Quill.yaml"), `name: ${name}\n`);
      }
      await writeFile(join(versionDir, "template.typ"), "// content\n");
    }
  }
}

describe("scanSourceQuiver", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // --- Fixture happy path ---

  it("scans sample fixture: meta name is 'sample'", async () => {
    const { meta } = await scanSourceQuiver(SAMPLE_FIXTURE);
    expect(meta.name).toBe("sample");
  });

  it("scans sample fixture: catalog has memo with [1.1.0, 1.0.0] descending", async () => {
    const { catalog } = await scanSourceQuiver(SAMPLE_FIXTURE);
    expect(catalog.get("memo")).toEqual(["1.1.0", "1.0.0"]);
  });

  it("scans sample fixture: catalog has resume with [2.0.0]", async () => {
    const { catalog } = await scanSourceQuiver(SAMPLE_FIXTURE);
    expect(catalog.get("resume")).toEqual(["2.0.0"]);
  });

  it("scans sample fixture: description is present", async () => {
    const { meta } = await scanSourceQuiver(SAMPLE_FIXTURE);
    expect(meta.description).toBe("A sample quiver for testing");
  });

  // --- Non-canonical version dir ---

  it("throws quiver_invalid for non-canonical version dir '1.0' (missing patch)", async () => {
    const root = makeTempDir();
    tempDirs.push(root);
    await buildMinimalQuiver(root, {
      quills: [{ name: "myquill", version: "1.0" }],
    });

    await expect(scanSourceQuiver(root)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  it("throws quiver_invalid for non-canonical version dir '1.2.3-beta' (prerelease)", async () => {
    const root = makeTempDir();
    tempDirs.push(root);
    await buildMinimalQuiver(root, {
      quills: [{ name: "myquill", version: "1.2.3-beta" }],
    });

    await expect(scanSourceQuiver(root)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  // --- Missing Quill.yaml ---

  it("throws quiver_invalid when Quill.yaml is missing in a version dir", async () => {
    const root = makeTempDir();
    tempDirs.push(root);
    await buildMinimalQuiver(root, {
      quills: [{ name: "myquill", version: "1.0.0", hasQuillYaml: false }],
    });

    await expect(scanSourceQuiver(root)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  // --- Missing quills/ directory ---

  it("returns empty catalog when quills/ dir is absent", async () => {
    const root = makeTempDir();
    tempDirs.push(root);
    await buildMinimalQuiver(root, { noQuillsDir: true });

    const { catalog } = await scanSourceQuiver(root);
    expect(catalog.size).toBe(0);
  });

  // --- Missing Quiver.yaml ---

  it("throws transport_error when Quiver.yaml is missing", async () => {
    // ENOENT on Quiver.yaml is transport_error (missing-path condition) — the
    // path doesn't point to a quiver at all, not a structural violation within
    // one. Contrast: missing Quill.yaml inside a version dir is quiver_invalid.
    const root = makeTempDir();
    tempDirs.push(root);
    await mkdir(root, { recursive: true });
    // No Quiver.yaml written

    await expect(scanSourceQuiver(root)).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
  });

  // --- Invalid Quiver.yaml content ---

  it("throws quiver_invalid when Quiver.yaml has unknown fields", async () => {
    const root = makeTempDir();
    tempDirs.push(root);
    await buildMinimalQuiver(root, { quiverYaml: "name: test\nextra: bad\n" });

    await expect(scanSourceQuiver(root)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });
});

describe("readQuillTree", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reads memo/1.0.0 from fixture with POSIX-style keys", async () => {
    const quillDir = join(SAMPLE_FIXTURE, "quills", "memo", "1.0.0");
    const tree = await readQuillTree(quillDir);
    expect(tree.has("Quill.yaml")).toBe(true);
    expect(tree.has("template.typ")).toBe(true);
  });

  it("returns Uint8Array values for each file", async () => {
    const quillDir = join(SAMPLE_FIXTURE, "quills", "memo", "1.0.0");
    const tree = await readQuillTree(quillDir);
    for (const value of tree.values()) {
      expect(value).toBeInstanceOf(Uint8Array);
    }
  });

  it("reads nested files with forward-slash POSIX paths", async () => {
    const root = makeTempDir();
    tempDirs.push(root);
    await mkdir(join(root, "subdir"), { recursive: true });
    await writeFile(join(root, "Quill.yaml"), "name: x\n");
    await writeFile(join(root, "subdir", "asset.svg"), "<svg/>");

    const tree = await readQuillTree(root);
    expect(tree.has("subdir/asset.svg")).toBe(true);
    expect(tree.has("Quill.yaml")).toBe(true);
  });

  it("returns correct byte content for a file", async () => {
    const quillDir = join(SAMPLE_FIXTURE, "quills", "memo", "1.0.0");
    const tree = await readQuillTree(quillDir);
    const bytes = tree.get("template.typ")!;
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain("minimal");
  });

  it("throws transport_error when directory does not exist", async () => {
    await expect(readQuillTree("/nonexistent/path/quill")).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
  });
});
