import { describe, it, expect, afterEach } from "vitest";
import { readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { renderQuiverSamples } from "../preview.js";
import type { QuillmarkLike } from "../engine-types.js";

// Fixture: `memo` has an example.md, `plain` does not.
const PREVIEW_FIXTURE = fileURLToPath(
  new URL("./fixtures/preview-quiver", import.meta.url),
);

const tempDirs: string[] = [];
function makeOutDir(): string {
  const dir = join(tmpdir(), `quiver-preview-${randomUUID()}`);
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

/** Mock `Document` — carries the markdown through so render can echo it. */
const MockDocument = {
  fromMarkdown(markdown: string): { md: string } {
    return { md: markdown };
  },
};

/** Mock engine whose quill echoes the document markdown as artifact bytes. */
function makeEngine(): QuillmarkLike {
  return {
    quill() {
      return {
        render(doc: unknown, opts: unknown) {
          const md = (doc as { md: string }).md;
          const format =
            (opts as { format?: string } | undefined)?.format ?? "pdf";
          return {
            artifacts: [{ format, bytes: new TextEncoder().encode(md) }],
            warnings: [{ severity: "warning", message: "mock warning" }],
          };
        },
      };
    },
  };
}

describe("renderQuiverSamples", () => {
  it("renders quills with an example.md and skips those without", async () => {
    const outDir = makeOutDir();
    const results = await renderQuiverSamples(PREVIEW_FIXTURE, {
      engine: makeEngine(),
      Document: MockDocument,
      outDir,
      quiet: true,
    });

    expect(results).toHaveLength(2);

    const memo = results.find((r) => r.ref === "memo@1.0.0")!;
    expect(memo.status).toBe("rendered");
    expect(memo.files).toEqual(["memo@1.0.0.pdf"]);
    expect(memo.warnings).toEqual(["warning: mock warning"]);

    const plain = results.find((r) => r.ref === "plain@1.0.0")!;
    expect(plain.status).toBe("skipped");
    expect(plain.reason).toContain("example.md");
  });

  it("writes the rendered artifact bytes to disk", async () => {
    const outDir = makeOutDir();
    await renderQuiverSamples(PREVIEW_FIXTURE, {
      engine: makeEngine(),
      Document: MockDocument,
      outDir,
      quiet: true,
    });

    const artifact = await readFile(join(outDir, "memo@1.0.0.pdf"), "utf8");
    expect(artifact).toContain("# Memo example");
  });

  it("writes an index.html gallery", async () => {
    const outDir = makeOutDir();
    await renderQuiverSamples(PREVIEW_FIXTURE, {
      engine: makeEngine(),
      Document: MockDocument,
      outDir,
      quiet: true,
    });

    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).toContain("Quiver preview — preview");
    expect(html).toContain("memo@1.0.0.pdf");
    expect(html).toContain('class="card skipped"');
  });

  it("honors a forced output format", async () => {
    const outDir = makeOutDir();
    const results = await renderQuiverSamples(PREVIEW_FIXTURE, {
      engine: makeEngine(),
      Document: MockDocument,
      outDir,
      format: "svg",
      quiet: true,
    });

    const memo = results.find((r) => r.ref === "memo@1.0.0")!;
    expect(memo.files).toEqual(["memo@1.0.0.svg"]);
    const files = await readdir(outDir);
    expect(files).toContain("memo@1.0.0.svg");
  });

  it("records a render failure without aborting the run", async () => {
    const outDir = makeOutDir();
    const explodingEngine: QuillmarkLike = {
      quill() {
        return {
          render() {
            throw new Error("boom");
          },
        };
      },
    };

    const results = await renderQuiverSamples(PREVIEW_FIXTURE, {
      engine: explodingEngine,
      Document: MockDocument,
      outDir,
      quiet: true,
    });

    const memo = results.find((r) => r.ref === "memo@1.0.0")!;
    expect(memo.status).toBe("failed");
    expect(memo.reason).toBe("boom");
    // The skipped quill is still reported — the run did not abort.
    expect(results.find((r) => r.ref === "plain@1.0.0")!.status).toBe(
      "skipped",
    );
  });
});
