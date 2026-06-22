import { describe, it, expect, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

import { FsBuiltTransport } from "../../transports/fs-built-transport.js";
import { QuiverError } from "../../errors.js";

function tempDir(): string {
  return join(tmpdir(), `fs-built-transport-test-${randomUUID()}`);
}

describe("FsBuiltTransport.fetchBytes", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const d of tmpDirs.splice(0)) {
      await rm(d, { recursive: true, force: true });
    }
  });

  it("happy path: returns bytes from a file at the given relative path", async () => {
    const dir = tempDir();
    tmpDirs.push(dir);
    await mkdir(dir, { recursive: true });
    const expected = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    await writeFile(join(dir, "latest.json"), expected);

    const transport = new FsBuiltTransport(dir);
    const bytes = await transport.fetchBytes("latest.json");

    expect(bytes).toEqual(expected);
  });

  it("reads nested paths under store/", async () => {
    const dir = tempDir();
    tmpDirs.push(dir);
    await mkdir(join(dir, "store"), { recursive: true });
    const expected = new Uint8Array([1, 2, 3]);
    await writeFile(join(dir, "store", "abc"), expected);

    const transport = new FsBuiltTransport(dir);
    const bytes = await transport.fetchBytes("store/abc");

    expect(bytes).toEqual(expected);
  });

  it("missing file throws transport_error", async () => {
    const dir = tempDir();
    tmpDirs.push(dir);
    await mkdir(dir, { recursive: true });

    const transport = new FsBuiltTransport(dir);
    await expect(transport.fetchBytes("missing.json")).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
  });

  it("missing root directory throws transport_error", async () => {
    const transport = new FsBuiltTransport(
      join(tmpdir(), `fs-no-such-${randomUUID()}`),
    );
    await expect(transport.fetchBytes("latest.json")).rejects.toThrow(
      expect.objectContaining({ code: "transport_error" }),
    );
  });

  it("rejects absolute paths with transport_error", async () => {
    const dir = tempDir();
    tmpDirs.push(dir);
    await mkdir(dir, { recursive: true });

    const transport = new FsBuiltTransport(dir);
    let thrown: unknown;
    try {
      await transport.fetchBytes("/etc/passwd");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(QuiverError);
    expect((thrown as QuiverError).code).toBe("transport_error");
  });

  it("rejects parent-directory traversal with transport_error", async () => {
    const dir = tempDir();
    tmpDirs.push(dir);
    await mkdir(dir, { recursive: true });

    const transport = new FsBuiltTransport(dir);
    let thrown: unknown;
    try {
      await transport.fetchBytes("../escape");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(QuiverError);
    expect((thrown as QuiverError).code).toBe("transport_error");
  });

  it("rejects mid-path .. segments", async () => {
    const dir = tempDir();
    tmpDirs.push(dir);
    await mkdir(dir, { recursive: true });

    const transport = new FsBuiltTransport(dir);
    await expect(
      transport.fetchBytes("store/../../escape"),
    ).rejects.toThrow(expect.objectContaining({ code: "transport_error" }));
  });
});
