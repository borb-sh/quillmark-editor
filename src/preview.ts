/**
 * Manual-validation helper for Quiver authors.
 *
 * `runQuiverTests` (`@quillmark/quiver/testing`) proves every quill *compiles*
 * — it never produces a rendered artifact a human can look at. This module
 * closes that gap: it renders each quill's bundled `example.md`, writes the
 * artifacts to a directory, and emits an `index.html` gallery so an author
 * can eyeball real output before publishing.
 *
 * Node-only: writes files and loads a source quiver from disk.
 *
 * Usage (place a script next to your Quiver.yaml):
 *
 *   import { Quillmark, Document } from "@quillmark/wasm";
 *   import { renderQuiverSamples } from "@quillmark/quiver/preview";
 *
 *   await renderQuiverSamples(import.meta.url, {
 *     engine: new Quillmark(),
 *     Document,
 *   });
 *   // → open ./preview/index.html
 *
 * The example document is the `example.md` file inside each quill version
 * directory (`quills/<name>/<version>/example.md`). Quills without one are
 * skipped, not failed.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Quiver } from "./node.js";
import type { QuillmarkLike } from "./engine-types.js";

/** The `example.md` filename looked up inside each quill version directory. */
const EXAMPLE_FILE = "example.md";

/** Default directory rendered artifacts are written to. */
const DEFAULT_OUT_DIR = "preview";

/**
 * Structural shape of the `Document` class from `@quillmark/wasm`. Only the
 * `fromMarkdown` factory is used; passing the real class satisfies this.
 */
export interface DocumentFactoryLike {
  fromMarkdown(markdown: string): unknown;
}

/** One render output: a format-tagged byte payload. */
interface ArtifactLike {
  format: string;
  bytes: Uint8Array;
}

/** A render-time diagnostic (warning/note). */
interface DiagnosticLike {
  severity: string;
  message: string;
}

/** Structural shape of `RenderResult` from `@quillmark/wasm`. */
interface RenderResultLike {
  artifacts?: ArtifactLike[];
  warnings?: DiagnosticLike[];
}

export interface RenderQuiverSamplesOptions {
  /** Quillmark engine instance (`new Quillmark()` from `@quillmark/wasm`). */
  engine: QuillmarkLike;
  /** The `Document` class from `@quillmark/wasm`. */
  Document: DocumentFactoryLike;
  /** Directory to write rendered artifacts into. Default: `preview`. */
  outDir?: string;
  /** Force an output format (`pdf`/`svg`/`png`/`txt`). Default: engine's choice. */
  format?: string;
  /** Suppress the console summary. Default: false. */
  quiet?: boolean;
}

/** Per-quill outcome returned by `renderQuiverSamples`. */
export interface RenderedSample {
  /** Canonical ref, e.g. `"memo@1.0.0"`. */
  ref: string;
  /** `rendered` — artifacts written; `skipped` — no example; `failed` — error. */
  status: "rendered" | "skipped" | "failed";
  /** Artifact filenames written under `outDir` (relative). */
  files: string[];
  /** Render warnings, formatted `"severity: message"`. */
  warnings: string[];
  /** Why the quill was skipped or failed; absent when rendered. */
  reason?: string;
}

/**
 * Renders every quill's `example.md` and writes the artifacts plus an
 * `index.html` gallery to `outDir`.
 *
 * Does NOT fail fast: a quill that throws is recorded as `failed` and the
 * run continues, so one broken quill never hides the others. Inspect the
 * returned array (or `index.html`) for the full picture.
 *
 * @param metaUrlOrDir `import.meta.url` when called from the quiver root, or
 *   an absolute path to the source quiver directory.
 */
export async function renderQuiverSamples(
  metaUrlOrDir: string,
  opts: RenderQuiverSamplesOptions,
): Promise<RenderedSample[]> {
  const outDir = opts.outDir ?? DEFAULT_OUT_DIR;
  const quiver = await Quiver.fromDir(metaUrlOrDir);
  await mkdir(outDir, { recursive: true });

  const results: RenderedSample[] = [];
  for (const name of quiver.quillNames()) {
    for (const version of quiver.versionsOf(name)) {
      results.push(await renderOne(quiver, name, version, outDir, opts));
    }
  }

  await writeFile(
    join(outDir, "index.html"),
    renderIndexHtml(quiver.name, results),
  );

  if (!opts.quiet) printSummary(quiver.name, outDir, results);
  return results;
}

async function renderOne(
  quiver: Quiver,
  name: string,
  version: string,
  outDir: string,
  opts: RenderQuiverSamplesOptions,
): Promise<RenderedSample> {
  const ref = `${name}@${version}`;

  const tree = await quiver.loadTree(name, version);
  const exampleBytes = tree.get(EXAMPLE_FILE);
  if (exampleBytes === undefined) {
    return {
      ref,
      status: "skipped",
      files: [],
      warnings: [],
      reason: `no ${EXAMPLE_FILE} in quill directory`,
    };
  }

  let result: RenderResultLike;
  try {
    const quill = await quiver.getQuill(ref, { engine: opts.engine });
    const markdown = new TextDecoder().decode(exampleBytes);
    const doc = opts.Document.fromMarkdown(markdown);
    result = quill.render(
      doc,
      opts.format ? { format: opts.format } : undefined,
    ) as RenderResultLike;
  } catch (err) {
    return {
      ref,
      status: "failed",
      files: [],
      warnings: [],
      reason: (err as Error).message,
    };
  }

  const warnings = (result.warnings ?? []).map(
    (w) => `${w.severity}: ${w.message}`,
  );
  const artifacts = result.artifacts ?? [];
  if (artifacts.length === 0) {
    return {
      ref,
      status: "failed",
      files: [],
      warnings,
      reason: "render produced no artifacts",
    };
  }

  const files: string[] = [];
  for (let i = 0; i < artifacts.length; i++) {
    const artifact = artifacts[i];
    const suffix = artifacts.length > 1 ? `.${i}` : "";
    const fileName = `${ref}${suffix}.${artifact.format}`;
    await writeFile(join(outDir, fileName), artifact.bytes);
    files.push(fileName);
  }
  return { ref, status: "rendered", files, warnings };
}

function printSummary(
  quiverName: string,
  outDir: string,
  results: RenderedSample[],
): void {
  const count = (s: RenderedSample["status"]) =>
    results.filter((r) => r.status === s).length;

  console.log(`\nQuiver "${quiverName}" — sample render`);
  for (const r of results) {
    const detail =
      r.status === "rendered" ? r.files.join(", ") : (r.reason ?? "");
    console.log(`  [${r.status.padEnd(8)}] ${r.ref}${detail ? ` — ${detail}` : ""}`);
    for (const w of r.warnings) console.log(`             ⚠ ${w}`);
  }
  console.log(
    `\n${count("rendered")} rendered, ${count("skipped")} skipped, ` +
      `${count("failed")} failed`,
  );
  console.log(`Open ${join(outDir, "index.html")} to review.\n`);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function embedArtifact(fileName: string): string {
  const ext = fileName.slice(fileName.lastIndexOf(".") + 1).toLowerCase();
  const src = escapeHtml(fileName);
  if (ext === "pdf") {
    return `<iframe class="art" src="${src}" title="${src}"></iframe>`;
  }
  if (ext === "png" || ext === "svg") {
    return `<img class="art" src="${src}" alt="${src}" />`;
  }
  return `<a href="${src}">${src}</a>`;
}

function renderIndexHtml(
  quiverName: string,
  results: RenderedSample[],
): string {
  const cards = results
    .map((r) => {
      const body =
        r.status === "rendered"
          ? r.files.map(embedArtifact).join("\n")
          : `<p class="reason">${escapeHtml(r.reason ?? "")}</p>`;
      const warnings = r.warnings.length
        ? `<ul class="warnings">${r.warnings
            .map((w) => `<li>${escapeHtml(w)}</li>`)
            .join("")}</ul>`
        : "";
      return `<section class="card ${r.status}">
  <h2>${escapeHtml(r.ref)} <span class="badge">${r.status}</span></h2>
  ${warnings}
  ${body}
</section>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Quiver preview — ${escapeHtml(quiverName)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; background: #fafafa; }
  h1 { font-size: 1.4rem; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 8px;
          padding: 1rem; margin: 1rem 0; }
  .card.failed { border-color: #e0b4b4; }
  .card.skipped { opacity: 0.7; }
  h2 { font-size: 1rem; margin: 0 0 0.5rem; }
  .badge { font-size: 0.7rem; text-transform: uppercase; background: #eee;
           border-radius: 4px; padding: 2px 6px; vertical-align: middle; }
  .failed .badge { background: #f3d2d2; }
  .art { width: 100%; height: 600px; border: 1px solid #eee; }
  img.art { height: auto; }
  .reason { color: #a33; font-style: italic; }
  .warnings { color: #96690a; font-size: 0.85rem; }
</style>
</head>
<body>
<h1>Quiver preview — ${escapeHtml(quiverName)}</h1>
${cards}
</body>
</html>
`;
}
