/**
 * Manual-validation helper for Quiver authors.
 *
 * `runQuiverTests` (`@quillmark/quiver/testing`) proves every quill *compiles*
 * — it never produces a rendered artifact a human can look at. This module
 * closes that gap: it renders each quill's example document, writes the
 * artifacts to a directory, and emits an `index.html` gallery so an author can
 * eyeball real output before publishing.
 *
 * Node-only: writes files and loads a source quiver from disk.
 *
 * Usage (place a script next to your Quiver.yaml):
 *
 *   import { Engine } from "@quillmark/wasm";
 *   import { renderQuiverSamples } from "@quillmark/quiver/preview";
 *
 *   await renderQuiverSamples(import.meta.url, { engine: new Engine() });
 *   // → open ./preview/index.html
 *
 * The sample document is the illustrative example seeded by
 * `quill.seedDocument()` for each quill version — a fully filled-out,
 * always-renderable document (the blueprint itself carries `<must-fill>`
 * sentinels and is not renderable). Every quill always seeds an example, so no
 * quills are skipped for lack of a sample document.
 *
 * A `.gitignore` is written into `outDir` so the generated artifacts are not
 * accidentally committed.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Quiver } from "./node.js";
import { isQuillmarkError } from "@quillmark/wasm";
import type { Engine, RenderResult, OutputFormat } from "@quillmark/wasm";

/** Default directory rendered artifacts are written to. */
const DEFAULT_OUT_DIR = "preview";

/** Output formats the engine supports. `txt` was removed in wasm 0.98. */
const OUTPUT_FORMATS: readonly OutputFormat[] = ["pdf", "svg", "png"];

/**
 * Narrows the CLI's free-form `--format` string to an `OutputFormat`.
 *
 * The engine rejects anything else at render time with a per-quill diagnostic,
 * which would report the same typo once per quill. Checking up front turns that
 * into one clear error before any rendering starts.
 */
function parseFormat(format: string): OutputFormat {
  if ((OUTPUT_FORMATS as readonly string[]).includes(format)) {
    return format as OutputFormat;
  }
  throw new Error(
    `Unknown output format '${format}'. Expected one of: ${OUTPUT_FORMATS.join(", ")}.`,
  );
}

export interface RenderQuiverSamplesOptions {
  /**
   * Canonical render engine (`new Engine()` from `@quillmark/wasm`). It takes the
   * core `Quill`/`Document` that quiver produces and clones them into the
   * backend on demand — no build-matching or handle-crossing for the caller.
   */
  engine: Engine;
  /** Directory to write rendered artifacts into. Default: `preview`. */
  outDir?: string;
  /** Force an output format (`pdf`/`svg`/`png`). Default: engine's choice. */
  format?: string;
  /** Suppress the console summary. Default: false. */
  quiet?: boolean;
  /**
   * Render only these quills. Each entry matches a quill name (`"memo"`) or a
   * canonical ref (`"memo@1.0.0"`). Omit to render all quills.
   */
  include?: string[];
  /**
   * Skip these quills. Each entry matches a quill name (`"memo"`) or a
   * canonical ref (`"memo@1.0.0"`). Applied after `include`.
   */
  exclude?: string[];
}

/** Per-quill outcome returned by `renderQuiverSamples`. */
export interface RenderedSample {
  /** Canonical ref, e.g. `"memo@1.0.0"`. */
  ref: string;
  /** `rendered` — artifacts written; `failed` — error. */
  status: "rendered" | "failed";
  /** Artifact filenames written under `outDir` (relative). */
  files: string[];
  /** Render warnings, formatted `"severity: message"`. */
  warnings: string[];
  /**
   * Why the quill was skipped or failed. Empty when rendered. A failed render
   * carries every diagnostic from the engine, not just the first.
   */
  reasons: string[];
}

/**
 * Renders every quill's example document and writes the artifacts plus an
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
  const format = opts.format === undefined ? undefined : parseFormat(opts.format);
  const quiver = await Quiver.fromDir(metaUrlOrDir);
  await mkdir(outDir, { recursive: true });

  const results: RenderedSample[] = [];
  for (const name of quiver.quillNames()) {
    for (const version of quiver.versionsOf(name)) {
      if (!isSelected(name, `${name}@${version}`, opts)) continue;
      results.push(
        await renderOne(quiver, name, version, outDir, opts.engine, format),
      );
    }
  }

  await writeFile(join(outDir, ".gitignore"), "*\n");
  await writeFile(
    join(outDir, "index.html"),
    renderIndexHtml(quiver.name, results),
  );

  if (!opts.quiet) printSummary(quiver.name, outDir, results);
  return results;
}

/** Whether a quill passes the `include`/`exclude` filters. */
function isSelected(
  name: string,
  ref: string,
  opts: RenderQuiverSamplesOptions,
): boolean {
  const matches = (list: string[]) => list.includes(name) || list.includes(ref);
  if (opts.include && !matches(opts.include)) return false;
  if (opts.exclude && matches(opts.exclude)) return false;
  return true;
}

/**
 * Formats a thrown render error into one string per diagnostic. `@quillmark/wasm`
 * throws `QuillmarkError`s (an `Error` carrying `diagnostics`); fall back to
 * the message for anything else.
 */
function failureReasons(err: unknown): string[] {
  if (isQuillmarkError(err) && err.diagnostics.length > 0) {
    return err.diagnostics.map((d) => `${d.severity}: ${d.message}`);
  }
  return [(err as Error).message];
}

async function renderOne(
  quiver: Quiver,
  name: string,
  version: string,
  outDir: string,
  engine: Engine,
  format: OutputFormat | undefined,
): Promise<RenderedSample> {
  const ref = `${name}@${version}`;

  let result: RenderResult;
  try {
    // Canonical render path: a core Quill + its seeded Document handed straight
    // to the Engine, which clones them into the backend and frees the clones.
    const quill = await quiver.getQuill(ref);
    const doc = quill.seedDocument();
    try {
      result = await engine.render(
        quill,
        doc,
        format ? { format } : undefined,
      );
    } finally {
      doc.free();
    }
  } catch (err) {
    return {
      ref,
      status: "failed",
      files: [],
      warnings: [],
      reasons: failureReasons(err),
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
      reasons: ["render produced no artifacts"],
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
  return { ref, status: "rendered", files, warnings, reasons: [] };
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
      r.status === "rendered" ? r.files.join(", ") : (r.reasons[0] ?? "");
    console.log(`  [${r.status.padEnd(8)}] ${r.ref}${detail ? ` — ${detail}` : ""}`);
    for (const extra of r.reasons.slice(1)) console.log(`             ${extra}`);
    for (const w of r.warnings) console.log(`             ⚠ ${w}`);
  }
  console.log(`\n${count("rendered")} rendered, ${count("failed")} failed`);
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
          : `<ul class="reasons">${r.reasons
              .map((reason) => `<li>${escapeHtml(reason)}</li>`)
              .join("")}</ul>`;
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
  h2 { font-size: 1rem; margin: 0 0 0.5rem; }
  .badge { font-size: 0.7rem; text-transform: uppercase; background: #eee;
           border-radius: 4px; padding: 2px 6px; vertical-align: middle; }
  .failed .badge { background: #f3d2d2; }
  .art { width: 100%; height: 600px; border: 1px solid #eee; }
  img.art { height: auto; }
  .reasons { color: #a33; font-style: italic; }
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
