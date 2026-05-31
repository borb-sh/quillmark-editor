#!/usr/bin/env node
/**
 * Quiver CLI — build, test, and preview a quiver collection.
 *
 * Commands:
 *   quiver build [--out <dir>]
 *   quiver test
 *   quiver preview [--out <dir>] [--format <fmt>] [--quiet]
 *                  [--include <ref>...] [--exclude <ref>...]
 *
 * Engine discovery (for `test` and `preview`):
 *   1. Named exports `engine` and `Document` from `quiver.config.js` at the
 *      collection root, if the file exists.
 *   2. Auto-imported `@quillmark/wasm` from the collection's node_modules.
 */

import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { Quiver } from "../node.js";
import { renderQuiverSamples } from "../preview.js";
import type { QuillmarkLike } from "../engine-types.js";
import type { DocumentFactoryLike } from "../preview.js";

// ---------------------------------------------------------------------------
// Arg parsing helpers
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const command = argv[0];

function flag(name: string): string | undefined {
  const i = argv.indexOf(name);
  return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
}

function multiFlag(name: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === name) out.push(argv[i + 1]);
  }
  return out;
}

function hasFlag(name: string): boolean {
  return argv.includes(name);
}

// ---------------------------------------------------------------------------
// Engine discovery
// ---------------------------------------------------------------------------

async function loadEngine(
  cwd: string,
): Promise<{ engine: QuillmarkLike; Document: DocumentFactoryLike }> {
  // 1. Named exports from quiver.config.js, if present.
  try {
    const cfg = await import(pathToFileURL(join(cwd, "quiver.config.js")).href);
    if (cfg.engine != null && cfg.Document != null) {
      return {
        engine: cfg.engine as QuillmarkLike,
        Document: cfg.Document as DocumentFactoryLike,
      };
    }
  } catch {
    // File absent or incomplete — fall through to auto-discovery.
  }

  // 2. Auto-discover @quillmark/wasm from the collection's own node_modules.
  const req = createRequire(pathToFileURL(join(cwd, "package.json")).href);
  let wasmPath: string;
  try {
    wasmPath = req.resolve("@quillmark/wasm");
  } catch {
    throw new Error(
      "Cannot find @quillmark/wasm in this collection's node_modules.\n" +
        "  Install it:  npm install @quillmark/wasm\n" +
        "  Or export { engine, Document } from quiver.config.js for a custom engine.",
    );
  }
  const wasm = (await import(pathToFileURL(wasmPath).href)) as {
    Quillmark: new () => QuillmarkLike;
    Document: DocumentFactoryLike;
  };
  return { engine: new wasm.Quillmark(), Document: wasm.Document };
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function build(): Promise<void> {
  const cwd = process.cwd();
  const outDir = flag("--out") ?? "dist";
  console.log(`quiver build: ${cwd} → ${outDir}`);
  await Quiver.build(cwd, outDir);
  console.log("done.");
}

async function test(): Promise<void> {
  const cwd = process.cwd();
  const { engine, Document } = await loadEngine(cwd);
  const quiver = await Quiver.fromDir(cwd);

  const names = quiver.quillNames();
  if (names.length === 0) {
    console.error("error: quiver has no quills");
    process.exit(1);
  }

  let pass = 0;
  let fail = 0;

  for (const name of names) {
    for (const version of quiver.versionsOf(name)) {
      const ref = `${name}@${version}`;
      try {
        const quill = await quiver.getQuill(ref, { engine });
        const doc = Document.fromMarkdown(quill.example);
        const result = quill.render(doc) as { artifacts?: unknown[] };
        if (!Array.isArray(result.artifacts) || result.artifacts.length === 0) {
          throw new Error("example render produced no artifacts");
        }
        console.log(`pass  ${ref}`);
        pass++;
      } catch (err) {
        console.error(`FAIL  ${ref} — ${(err as Error).message}`);
        fail++;
      }
    }
  }

  const total = pass + fail;
  console.log(`\n${pass}/${total} passed`);
  if (fail > 0) process.exit(1);
}

async function preview(): Promise<void> {
  const cwd = process.cwd();
  const { engine, Document } = await loadEngine(cwd);
  const outDir = flag("--out");
  const format = flag("--format");
  const quiet = hasFlag("--quiet");
  const include = multiFlag("--include");
  const exclude = multiFlag("--exclude");
  await renderQuiverSamples(cwd, {
    engine,
    Document,
    ...(outDir !== undefined && { outDir }),
    ...(format !== undefined && { format }),
    quiet,
    ...(include.length > 0 && { include }),
    ...(exclude.length > 0 && { exclude }),
  });
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function usage(): void {
  console.error(
    [
      "Usage:",
      "  quiver build [--out <dir>]",
      "  quiver test",
      "  quiver preview [--out <dir>] [--format <fmt>] [--quiet]",
      "                 [--include <ref>...] [--exclude <ref>...]",
    ].join("\n"),
  );
}

function die(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`error: ${msg}`);
  process.exit(1);
}

switch (command) {
  case "build":
    build().catch(die);
    break;
  case "test":
    test().catch(die);
    break;
  case "preview":
    preview().catch(die);
    break;
  default:
    usage();
    process.exit(1);
}
