import { describe, it, expect, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { Quiver } from "../node.js";
import { QuiverError } from "../errors.js";
import { mockQuillFromTree } from "./helpers/mock-engine.js";

// Absolute path to the committed fixture
const SAMPLE_FIXTURE = new URL("./fixtures/sample-quiver", import.meta.url).pathname;

function makeTempDir(): string {
  return join(tmpdir(), `quiver-test-${randomUUID()}`);
}

describe("Quiver.fromDir", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  // --- Happy path ---

  it("loads sample fixture: name is 'sample'", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    expect(q.name).toBe("sample");
  });

  it("loads sample fixture: quillNames() returns sorted names", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    const names = q.quillNames();
    expect(names).toEqual([...names].sort());
    expect(names).toContain("memo");
    expect(names).toContain("resume");
  });

  it("loads sample fixture: versionsOf('memo') is descending", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    expect(q.versionsOf("memo")).toEqual(["1.1.0", "1.0.0"]);
  });

  it("loads sample fixture: versionsOf('resume') is ['2.0.0']", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    expect(q.versionsOf("resume")).toEqual(["2.0.0"]);
  });

  it("versionsOf returns empty array for unknown quill name", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    expect(q.versionsOf("nonexistent")).toEqual([]);
  });

  it("name property is readonly string", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    expect(typeof q.name).toBe("string");
  });

  // --- tree loading (observed via the tree fed to Quill.fromTree) ---
  //
  // The tree path is private (`getQuill` → internal `#loadTree`). To inspect
  // the loaded tree, stub `Quill.fromTree` and read the tree it was handed.

  let stub: ReturnType<typeof mockQuillFromTree> | undefined;
  afterEach(() => {
    stub?.restore();
    stub = undefined;
  });

  it("getQuill('memo@1.0.0') loads a tree with Quill.yaml and template.typ", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    stub = mockQuillFromTree();
    await q.getQuill("memo@1.0.0");
    const tree = stub.calls[0]!;
    expect(tree).toBeInstanceOf(Map);
    expect(tree.has("Quill.yaml")).toBe(true);
    expect(tree.has("template.typ")).toBe(true);
  });

  it("loaded tree values are Uint8Array", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    stub = mockQuillFromTree();
    await q.getQuill("memo@1.0.0");
    const tree = stub.calls[0]!;
    for (const value of tree.values()) {
      expect(value).toBeInstanceOf(Uint8Array);
    }
  });

  it("loads the correct version: 1.1.0 content differs from 1.0.0", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    stub = mockQuillFromTree();
    await q.getQuill("memo@1.0.0");
    await q.getQuill("memo@1.1.0");
    const text100 = new TextDecoder().decode(stub.calls[0]!.get("template.typ")!);
    const text110 = new TextDecoder().decode(stub.calls[1]!.get("template.typ")!);
    expect(text100).toContain("1.0.0");
    expect(text110).toContain("1.1.0");
  });

  // --- not-found / errors ---

  it("getQuill throws quill_not_found for unknown quill name", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    await expect(q.getQuill("unknown@1.0.0")).rejects.toThrow(
      expect.objectContaining({ code: "quill_not_found" }),
    );
  });

  it("getQuill throws quill_not_found for unknown version of a known quill", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    await expect(q.getQuill("memo@99.0.0")).rejects.toThrow(
      expect.objectContaining({ code: "quill_not_found" }),
    );
  });

  // --- Error propagation from scanSourceQuiver ---

  it("throws transport_error when Quiver.yaml is missing", async () => {
    // ENOENT on Quiver.yaml is transport_error (missing-path condition) — the
    // path doesn't point to a quiver at all, not a structural violation within
    // one. Contrast: missing Quill.yaml inside a version dir is quiver_invalid.
    const root = makeTempDir();
    tempDirs.push(root);
    await mkdir(root, { recursive: true });

    await expect(Quiver.fromDir(root)).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
  });

  it("throws quiver_invalid for non-canonical version dir", async () => {
    const root = makeTempDir();
    tempDirs.push(root);
    await mkdir(join(root, "quills", "myquill", "bad-version"), {
      recursive: true,
    });
    await writeFile(join(root, "Quiver.yaml"), "name: test\n");
    await writeFile(
      join(root, "quills", "myquill", "bad-version", "Quill.yaml"),
      "name: myquill\n",
    );

    await expect(Quiver.fromDir(root)).rejects.toThrow(
      expect.objectContaining({ code: "quiver_invalid" }),
    );
  });

  // --- Immutability ---

  it("quillNames() returns a new array each call (defensive copy)", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    const a = q.quillNames();
    const b = q.quillNames();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });

  it("versionsOf() returns a new array each call (defensive copy)", async () => {
    const q = await Quiver.fromDir(SAMPLE_FIXTURE);
    const a = q.versionsOf("memo");
    const b = q.versionsOf("memo");
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
